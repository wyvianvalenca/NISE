"""Eventos do filé da menina (M6, #118): o detalhe da A06·4b e o que muda o status.

Um evento é um item do filé como uma atividade (a mesma tabela `file_entries`),
mas vem de uma das duas fontes: um evento da curadoria (de fora, RN-19) ou uma
ação de um grupo da NISE (F30). As regras que dependem da data usam o dia de
hoje em Maceió, que a rota passa.
"""

import enum
from collections.abc import Collection
from dataclasses import dataclass
from datetime import date, timedelta
from typing import Literal

from sqlalchemy import or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.modules.actions.models import (
    Action,
    ActionFormat,
    ActionVisibility,
    Participation,
)
from app.modules.catalog.models import CuratedItem, CuratedType, ItemKind, ItemOrigin
from app.modules.catalog.service import (
    action_effort_band,
    action_is_visible,
    curated_is_visible,
)
from app.modules.catalog.utils import ACTION_TYPE_LABELS, CURATED_TYPE_LABELS, item_id
from app.modules.cities.models import City
from app.modules.events.schemas import EventOut, EventStatus, EventType
from app.modules.girl_file.models import FileEntry, FileStatus
from app.modules.girl_file.service import find_entry, main_theme, new_entry
from app.modules.girls.models import Girl, StudyStage, Topic
from app.modules.girls.utils import STUDY_STAGE_LABELS, TOPIC_LABELS, first_name
from app.modules.groups.models import Group
from app.users.models import User

# Os status de um evento que está no filé, e como a A06·4b chama cada um. O
# "Ver depois" e o "Não é pra mim" não estão no filé; IN_PROGRESS é só de
# atividade.
EVENT_STATUS: dict[FileStatus, EventStatus] = {
    FileStatus.NEXT: EventStatus.NEXT,
    FileStatus.SIGNED_UP: EventStatus.IN_PROGRESS,
    FileStatus.CONCLUDED: EventStatus.CONCLUDED,
}

# A ordem das etapas, da primeira à última, para achar a etapa mínima.
STAGE_ORDER: list[StudyStage] = list(StudyStage)


@dataclass
class FileEvent:
    """Um evento do filé dela: a linha e o item, de uma das duas fontes.

    `group` é o nome do grupo da NISE de uma ação; vazio num evento da curadoria.
    `city` é o nome da cidade de um presencial. `first_name` é o primeiro nome da
    menina da sessão, para a celebração do "Fui!" (A06·5).
    """

    entry: FileEntry
    curated: CuratedItem | None
    action: Action | None
    group: str | None
    city: str | None
    first_name: str

    @property
    def starts_on(self) -> date:
        if self.action is not None:
            return self.action.starts_on
        assert self.curated is not None and self.curated.starts_on is not None
        return self.curated.starts_on

    @property
    def ends_on(self) -> date:
        if self.action is not None:
            return self.action.ends_on
        assert self.curated is not None and self.curated.ends_on is not None
        return self.curated.ends_on

    @property
    def is_group_event(self) -> bool:
        """Evento de um grupo da NISE: a presença vem da coordenadora (#194)."""
        return self.action is not None


def is_after_event(ends_on: date, today: date) -> bool:
    """O último dia do evento já acabou, no fuso de Maceió (#190).

    `today` já é o dia de hoje em Maceió, então o evento acaba à meia-noite de
    lá: no próprio último dia ainda não é "depois".
    """
    return today > ends_on


class EventPhase(enum.Enum):
    """Em que ponto o evento está, o mesmo para todas as meninas.

    É a única regra de data e de organização do evento: cada ação da menina
    confere o status da linha dela e a fase, e nada mais (`event_phase`).
    """

    # Ainda não acabou: dá para marcar e desfazer a inscrição.
    BEFORE = "before"
    # De fora, desativado pela curadoria antes de acabar, que é como ela o
    # cancela. Continua no filé, mas não aceita mais nada. Depois do último dia,
    # desativar é só tirar das sugestões (scripts/carregar_curadoria.py): o
    # evento aconteceu e continua perguntando "Você foi?". Uma ação cancelada é
    # excluída pela coordenadora (RF-F30.12) e leva a linha junto.
    CANCELLED = "cancelled"
    # De fora, depois do último dia: a tela pergunta "Você foi?" (#190).
    ASKS_IF_WENT = "asks_if_went"
    # De grupo da NISE, depois do último dia, sem a presença (#194).
    WAITING_ATTENDANCE = "waiting_attendance"
    # De grupo da NISE, com a presença concluída pela coordenadora (#135,
    # RN-37). Ela pode concluir a partir do primeiro dia, antes do fim de um
    # evento de vários dias; daí em diante o filé só muda pela presença.
    ATTENDANCE_CONCLUDED = "attendance_concluded"


def event_phase(event: FileEvent, today: date) -> EventPhase:
    """A fase do evento hoje (`today` é o dia de hoje em Maceió)."""
    after = is_after_event(event.ends_on, today)
    if event.action is not None:
        if event.action.attendance_registered_at is not None:
            return EventPhase.ATTENDANCE_CONCLUDED
        return EventPhase.WAITING_ATTENDANCE if after else EventPhase.BEFORE
    assert event.curated is not None
    if after:
        return EventPhase.ASKS_IF_WENT
    return EventPhase.BEFORE if event.curated.active else EventPhase.CANCELLED


# O que as mudanças de status respondem quando não dá: a rota devolve 409 com
# o código.
EventError = Literal[
    "event_concluded", "event_over", "event_cancelled", "event_not_asked"
]


def phase_error(phase: EventPhase) -> EventError:
    """O erro de uma mudança que só vale antes do evento, na fase `phase`."""
    return "event_cancelled" if phase is EventPhase.CANCELLED else "event_over"


async def city_name(session: AsyncSession, code: int | None) -> str | None:
    if code is None:
        return None
    return await session.scalar(select(City.name).where(City.id == code))


async def load_event_item(
    session: AsyncSession, origin: ItemOrigin, number: int
) -> tuple[CuratedItem | None, Action | None, str | None] | None:
    """O item de um evento das duas fontes, com o nome do grupo de uma ação.

    Devolve None quando o item não existe ou é uma atividade. O item vem com os
    temas e as etapas, para o tema e a etapa mínima da tela.
    """
    if origin is ItemOrigin.CURATED:
        item = await session.scalar(
            select(CuratedItem)
            .where(CuratedItem.id == number)
            .options(
                selectinload(CuratedItem.topics), selectinload(CuratedItem.audiences)
            )
        )
        if item is None or item.kind is not ItemKind.EVENT:
            return None
        return item, None, None

    action = await session.scalar(
        select(Action)
        .where(Action.id == number)
        .options(selectinload(Action.topics), selectinload(Action.audiences))
    )
    if action is None:
        return None
    group = await session.scalar(select(Group.name).where(Group.id == action.group_id))
    return None, action, group


async def find_event(
    session: AsyncSession,
    girl_id: int,
    origin: ItemOrigin,
    number: int,
    first_name: str,
    for_update: bool = False,
    include_did_not_go: bool = False,
) -> FileEvent | None:
    """Um evento do filé dela, ou None se não há.

    Fica de fora o que não é um evento no filé dela: o "Ver depois", o "Não é
    pra mim", um item sem escolha e as atividades, que abrem a A06·4a. Com
    `include_did_not_go`, vem também o evento que saiu do filé pelo "Não deu",
    que só o "Não deu" e o "Desfazer" dele usam.

    A linha é buscada pelo id dela, então a de outra menina nunca é achada
    (RNF-G.03). Com `for_update`, a linha fica travada até o fim da transação
    (`find_entry`): duas mudanças ao mesmo tempo vão uma depois da outra.
    """
    entry = await find_entry(session, girl_id, origin, number, for_update=for_update)
    if entry is None:
        return None
    did_not_go = include_did_not_go and entry.status is FileStatus.DID_NOT_GO
    if entry.status not in EVENT_STATUS and not did_not_go:
        return None

    found = await load_event_item(session, origin, number)
    if found is None:
        return None
    curated, action, group = found

    code = action.city_ibge_code if action is not None else None
    if curated is not None:
        code = curated.city_ibge_code
    return FileEvent(
        entry=entry,
        curated=curated,
        action=action,
        group=group,
        city=await city_name(session, code),
        first_name=first_name,
    )


def cost_text(cost_cents: int | None) -> str | None:
    """O custo para a tela, "R$ 20" ou "R$ 20,50". Vazio quando é grátis."""
    if not cost_cents:
        return None
    reais, cents = divmod(cost_cents, 100)
    if cents == 0:
        return f"R$ {reais}"
    return f"R$ {reais},{cents:02d}"


def minimum_stage(stages: list[StudyStage]) -> str | None:
    """A primeira etapa do público, ex.: "Ensino médio". Vazio se serve para todas."""
    if not stages:
        return None
    first = min(stages, key=STAGE_ORDER.index)
    return STUDY_STAGE_LABELS[first]


def prerequisite_lines(text: str | None) -> list[str]:
    """Os pré-requisitos da curadoria, um por linha, sem as linhas vazias."""
    if not text:
        return []
    return [line.strip() for line in text.splitlines() if line.strip()]


def topic_label(topics: list[Topic]) -> str | None:
    theme = main_theme(topics)
    return TOPIC_LABELS[theme] if theme is not None else None


def curated_event_type(item_type: CuratedType) -> EventType:
    """O tipo da curadoria no vocabulário da A06·4b: só o hackathon tem o seu."""
    if item_type is CuratedType.HACKATHON:
        return EventType.HACKATHON
    return EventType.OUTRO


def event_out(event: FileEvent, today: date) -> EventOut:
    """O detalhe do evento como a A06·4b mostra (RF-F10.13).

    `today` é o dia de hoje em Maceió. Os dias que faltam nunca são negativos:
    0 é hoje, ou já passou (aí `registrations_open` e `after_event` dizem qual).
    """
    starts_on = event.starts_on
    ends_on = event.ends_on
    days_until_start = max((starts_on - today).days, 0)
    after_event = is_after_event(ends_on, today)

    if event.action is not None:
        action = event.action
        number = action.id
        origin = ItemOrigin.GROUP_ACTION
        event_type = EventType(action.type.value)
        type_label = ACTION_TYPE_LABELS[action.type]
        topic = topic_label([row.topic for row in action.topics])
        band = action_effort_band(action)
        title = action.name
        organizer = event.group or ""
        item_format = action.format
        # As ações não têm prazo: a coordenadora abre e fecha as inscrições
        # (#236, #237). As mesmas regras de quando a ação aparece nas
        # sugestões: aberta, com inscrições abertas e antes do dia (RN-16).
        deadline = None
        days_left = None
        registrations_open = action_is_visible(action, today)
        cost = None
        stage = minimum_stage([row.stage for row in action.audiences])
        prerequisites: list[str] = []
        # Uma ação fechada (só convidadas) não tem link, mesmo se ficou um
        # guardado de quando era aberta.
        registration_url = (
            action.registration_url
            if action.visibility is ActionVisibility.OPEN
            else None
        )
    else:
        item = event.curated
        assert item is not None
        number = item.id
        origin = ItemOrigin.CURATED
        event_type = curated_event_type(item.type)
        type_label = CURATED_TYPE_LABELS[item.type]
        topic = topic_label([row.topic for row in item.topics])
        band = item.effort_band
        title = item.title
        organizer = item.source
        item_format = item.format
        deadline = item.registration_deadline
        days_left = None if deadline is None else max((deadline - today).days, 0)
        # As mesmas regras de quando o evento aparece nas sugestões: um evento
        # desativado ou vencido pela curadoria não está mais aberto.
        registrations_open = curated_is_visible(item, today)
        cost = cost_text(item.cost_cents)
        stage = minimum_stage([row.stage for row in item.audiences])
        prerequisites = prerequisite_lines(item.prerequisites)
        registration_url = item.url

    city = event.city if item_format is ActionFormat.IN_PERSON else None
    return EventOut(
        id=item_id(origin, number),
        status=EVENT_STATUS[event.entry.status],
        type=event_type,
        type_label=type_label,
        topic=topic,
        band=band,
        title=title,
        group=event.group,
        organizer=organizer,
        starts_on=starts_on,
        ends_on=ends_on,
        city=city,
        deadline=deadline,
        days_left=days_left,
        registrations_open=registrations_open,
        days_until_start=days_until_start,
        after_event=after_event,
        # Uma linha recém-criada só ganha o padrão (false) quando vai ao banco.
        reminder=bool(event.entry.reminder),
        waiting_attendance=(
            event.entry.status is FileStatus.SIGNED_UP
            and event_phase(event, today) is EventPhase.WAITING_ATTENDANCE
        ),
        cost=cost,
        stage=stage,
        prerequisites=prerequisites,
        registration_url=registration_url,
        first_name=event.first_name,
    )


# --- Inscrição (A09 e versão "Inscrita", #182) --------------------------------


async def mark_signed_up(
    session: AsyncSession, event: FileEvent, today: date
) -> EventError | None:
    """ "Sim, me inscrevi" e "Já me inscrevi": próxima → inscrita (RF-F10.14).

    Devolve None quando deu certo, ou o erro que a rota responde. Marcar de
    novo não muda nada e vale. O prazo não bloqueia: ela pode ter se inscrito
    no último minuto e só voltar depois. Só antes do evento (`EventPhase`):
    depois da data a tela pergunta "Você foi?" (#190) ou espera a presença
    (#194), e um evento cancelado não aceita mais inscrição.
    """
    entry = event.entry
    if entry.status is FileStatus.SIGNED_UP:
        return None
    if entry.status is not FileStatus.NEXT:
        return "event_concluded"
    phase = event_phase(event, today)
    if phase is not EventPhase.BEFORE:
        return phase_error(phase)
    entry.status = FileStatus.SIGNED_UP
    await session.commit()
    return None


async def undo_signed_up(
    session: AsyncSession, event: FileEvent, today: date
) -> EventError | None:
    """ "Desfazer" do aviso "Você tá inscrita!": inscrita → próxima (RF-F10.15).

    Devolve None quando deu certo, ou o erro que a rota responde. Desfazer de
    novo não muda nada e vale. Só antes do evento, como a marca: depois da
    data, uma próxima não teria mais como andar.
    """
    entry = event.entry
    if entry.status is FileStatus.NEXT:
        return None
    if entry.status is not FileStatus.SIGNED_UP:
        return "event_concluded"
    phase = event_phase(event, today)
    if phase is not EventPhase.BEFORE:
        return phase_error(phase)
    entry.status = FileStatus.NEXT
    # Sem inscrição não há lembrete (#186).
    entry.reminder = False
    await session.commit()
    return None


# --- "Você foi?" do evento de fora (A06·4b, #190) -----------------------------
#
# Só o evento de fora pergunta "Você foi?" (`EventPhase.ASKS_IF_WENT`); o de um
# grupo da NISE é concluído pela presença que a coordenadora registra (#194).
# O "Não deu" tira o evento do filé (não está em IN_FILE), mas a linha fica,
# com o próprio status, para o "Desfazer" saber que ela estava inscrita.


async def mark_went(
    session: AsyncSession, event: FileEvent, today: date
) -> EventError | None:
    """ "Fui!": inscrita → concluído, com o dia (RF-F10.23).

    Um "Fui!" repetido (clique duplo) acha o evento já concluído: vale, sem
    mudar o dia, mesmo se a curadoria mexeu no evento entre os dois.
    """
    entry = event.entry
    if event.is_group_event:
        return "event_not_asked"
    if entry.status is FileStatus.CONCLUDED:
        return None
    if (
        entry.status is not FileStatus.SIGNED_UP
        or event_phase(event, today) is not EventPhase.ASKS_IF_WENT
    ):
        return "event_not_asked"
    entry.status = FileStatus.CONCLUDED
    entry.concluded_on = today
    entry.reminder = False
    await session.commit()
    return None


async def mark_did_not_go(
    session: AsyncSession, event: FileEvent, today: date
) -> EventError | None:
    """ "Não deu": o evento de fora em que ela se inscreveu sai do filé (RF-F10.23).

    `event` vem de `find_event(include_did_not_go=True)`. Valem as regras do
    "Fui!". Um "Não deu" repetido acha o evento já fora do filé: vale.
    """
    entry = event.entry
    if event.is_group_event:
        return "event_not_asked"
    if entry.status is FileStatus.DID_NOT_GO:
        return None
    if (
        entry.status is not FileStatus.SIGNED_UP
        or event_phase(event, today) is not EventPhase.ASKS_IF_WENT
    ):
        return "event_not_asked"
    entry.status = FileStatus.DID_NOT_GO
    entry.reminder = False
    await session.commit()
    return None


async def undo_did_not_go(
    session: AsyncSession, event: FileEvent, today: date
) -> EventError | None:
    """O "Desfazer" do aviso do "Não deu": o evento volta, inscrita, ao filé dela.

    `event` vem de `find_event(include_did_not_go=True)`. Desfazer de novo acha
    o evento já inscrita: vale, a qualquer data (a linha não guarda se houve um
    "Não deu" antes). Vale também se a curadoria adiou o evento depois, para a
    linha nunca ficar presa fora do filé; não se ela o cancelou, porque ele não
    aconteceu e, de volta ao filé, ficaria inscrita sem "Você foi?".
    """
    entry = event.entry
    if event.is_group_event:
        return "event_not_asked"
    if entry.status is FileStatus.SIGNED_UP:
        return None
    if (
        entry.status is not FileStatus.DID_NOT_GO
        or event_phase(event, today) is EventPhase.CANCELLED
    ):
        return "event_not_asked"
    entry.status = FileStatus.SIGNED_UP
    await session.commit()
    return None


# --- Evento de grupo da NISE e a presença (A06·4b, #194) ----------------------


async def apply_attendance(
    session: AsyncSession,
    group_id: int,
    action_id: int,
    present: Collection[int],
    today: date,
    *,
    concluding: bool,
) -> bool:
    """Muda o filé das meninas pela presença que a coordenadora registrou (#196).

    A C3 (#135) chama em dois momentos, nunca para marcações só salvas
    ("Salvar e continuar depois"): nada muda no filé antes de concluir (#337,
    D-81).

    - `concluding=True`, quando ela toca "Concluir presença", com quem veio.
      Todo evento inscrita dessa ação de quem não veio sai do filé
      (RF-F10.24), esteja ela na lista de inscritas ou não: quem marcou "Já me
      inscrevi" e não apareceu na lista também não veio.
    - `concluding=False`, quando ela marca alguém como presente depois de
      concluir (aba "Faltaram" ou "Veio sem inscrição?"), só com essa menina.

    Quem veio fica com o evento concluído no filé, com o dia `today`. Vale
    também para quem tirou o evento do filé, faltou antes ou nunca o escolheu:
    a linha é criada, já concluída. Quem já está concluída não muda. Só conta
    como presente quem está inscrita na ação (`participations`): a C3 inscreve
    quem veio sem inscrição antes de marcar a presença; os outros ids são
    ignorados (RNF-G.03).

    Só vale para a ação do grupo dela (`group_id`). Devolve False, sem mudar
    nada, se a ação não é do grupo.

    Não faz commit: grava na transação de quem chamou, para a presença e o
    filé mudarem juntos. As linhas são travadas antes de decidir.
    """
    action_group = await session.scalar(
        select(Action.group_id).where(Action.id == action_id)
    )
    if action_group is None or action_group != group_id:
        return False

    came: set[int] = set()
    if present:
        came = set(
            await session.scalars(
                select(Participation.girl_id).where(
                    Participation.action_id == action_id,
                    Participation.girl_id.in_(set(present)),
                )
            )
        )
    if not came and not concluding:
        return True

    # Ao concluir, todas as linhas da ação, em qualquer status, ficam travadas:
    # um "Já me inscrevi" ao mesmo tempo espera a conclusão (e então vê a
    # presença concluída, "event_over"), ou a conclusão espera a marca e a vê.
    # Buscar só as inscritas deixaria passar a linha que ainda é próxima.
    # Pelo id: duas chamadas ao mesmo tempo travam na mesma ordem, sem deadlock.
    query = (
        select(FileEntry).where(FileEntry.action_id == action_id).order_by(FileEntry.id)
    )
    if not concluding:
        query = query.where(FileEntry.girl_id.in_(came))
    entries = {
        entry.girl_id: entry
        for entry in await session.scalars(
            query.with_for_update().execution_options(populate_existing=True)
        )
    }

    for girl_id in sorted(came):
        entry = entries.get(girl_id)
        if entry is None:
            entry = await insert_concluded(session, girl_id, action_id, today)
        if entry.status is not FileStatus.CONCLUDED:
            entry.status = FileStatus.CONCLUDED
            entry.dismiss_reason = None
            entry.concluded_on = today
            entry.reminder = False

    if concluding:
        for girl_id, entry in entries.items():
            if girl_id not in came and entry.status is FileStatus.SIGNED_UP:
                await session.delete(entry)

    await session.flush()
    return True


async def insert_concluded(
    session: AsyncSession, girl_id: int, action_id: int, today: date
) -> FileEntry:
    """Cria a linha concluída de quem veio e não tinha o evento no filé.

    Se ela escolheu o evento no mesmo instante (um "Quero fazer" ao mesmo
    tempo), o banco recusa a segunda linha (a restrição de único): devolve a
    linha que ela criou, travada, para quem chamou concluir. O insert roda num
    savepoint, como em `save_choice`, para a recusa não desfazer a presença.
    """
    entry = new_entry(girl_id, ItemOrigin.GROUP_ACTION, action_id, FileStatus.CONCLUDED)
    entry.concluded_on = today
    try:
        async with session.begin_nested():
            session.add(entry)
    except IntegrityError:
        found = await find_entry(
            session, girl_id, ItemOrigin.GROUP_ACTION, action_id, for_update=True
        )
        if found is None:
            raise
        return found
    return entry


# --- Lembrete um dia antes (A06·4b inscrita, #186) ----------------------------


def can_remind(starts_on: date, today: date) -> bool:
    """O dia do lembrete, a véspera do evento, ainda está por vir.

    Se o evento começa hoje ou amanhã, a véspera já passou ou é hoje: a opção
    nem aparece (`reminderDate` em frontend/lib/evento.ts).
    """
    return (starts_on - today).days >= 2


async def set_reminder(
    session: AsyncSession, event: FileEvent, on: bool, today: date
) -> bool:
    """ "Me lembra um dia antes": liga ou desliga o lembrete do evento (#186).

    Só num evento em que ela se inscreveu. Ligar só vale antes do evento
    (`EventPhase.BEFORE`: um evento cancelado não é lembrado) e enquanto a
    véspera ainda está por vir (`can_remind`); desligar vale sempre. Nos outros
    casos devolve False sem mudar nada. Ligar ou desligar de novo não muda nada.
    """
    entry = event.entry
    if entry.status is not FileStatus.SIGNED_UP:
        # Fora da inscrição o lembrete já está desligado (o banco garante).
        return not on
    turning_on = on and not entry.reminder
    if turning_on and (
        event_phase(event, today) is not EventPhase.BEFORE
        or not can_remind(event.starts_on, today)
    ):
        return False
    if bool(entry.reminder) is not on:
        entry.reminder = on
        await session.commit()
    return True


@dataclass
class DueReminder:
    """Um lembrete que sai hoje: a linha, a menina, a conta e o evento, com a
    data de agora.

    A conta vai junto para o envio passar por `can_send_email` com
    `EmailKind.EVENT_REMINDER` e `reminder_on=entry.reminder` (RN-30), como
    todo e-mail para a menina.
    """

    entry: FileEntry
    girl: Girl
    user: User
    item_id: str
    title: str
    starts_on: date


async def reminders_due(session: AsyncSession, today: date) -> list[DueReminder]:
    """Quem lembrar hoje: inscrita, com o lembrete ligado, evento amanhã (#186).

    O evento precisa continuar no filé dela (a linha existe e está inscrita) e
    o lembrete ainda não ter saído para essa data do evento. A data é a do
    evento agora, não a do dia em que ela ligou o lembrete: se o evento mudou
    de dia depois do lembrete, sai outro na véspera da data nova.

    As linhas vêm travadas. Uma rodada ao mesmo tempo que ela mexe no lembrete
    espera o pedido dela terminar, e duas rodadas ao mesmo tempo não mandam o
    mesmo lembrete duas vezes: a segunda espera a primeira e, no Postgres,
    relê a linha já marcada como enviada, que sai da busca.
    """
    tomorrow = today + timedelta(days=1)
    waiting = (
        FileEntry.status == FileStatus.SIGNED_UP,
        FileEntry.reminder.is_(True),
    )

    curated = await session.execute(
        select(FileEntry, Girl, User, CuratedItem.id, CuratedItem.title)
        .join(Girl, Girl.id == FileEntry.girl_id)
        .join(User, User.id == Girl.user_id)
        .join(CuratedItem, CuratedItem.id == FileEntry.curated_item_id)
        .where(
            *waiting,
            # Um evento que a curadoria desativou (cancelado), venceu ou deixou
            # de ser evento não é lembrado, como nas sugestões.
            CuratedItem.active.is_(True),
            CuratedItem.kind == ItemKind.EVENT,
            or_(CuratedItem.expires_on.is_(None), CuratedItem.expires_on >= today),
            CuratedItem.starts_on == tomorrow,
            FileEntry.reminder_sent_for.is_distinct_from(tomorrow),
        )
        .order_by(FileEntry.id)
        .with_for_update(of=FileEntry)
        .execution_options(populate_existing=True)
    )
    actions = await session.execute(
        select(FileEntry, Girl, User, Action.id, Action.name)
        .join(Girl, Girl.id == FileEntry.girl_id)
        .join(User, User.id == Girl.user_id)
        .join(Action, Action.id == FileEntry.action_id)
        .where(
            *waiting,
            Action.starts_on == tomorrow,
            FileEntry.reminder_sent_for.is_distinct_from(tomorrow),
        )
        .order_by(FileEntry.id)
        .with_for_update(of=FileEntry)
        .execution_options(populate_existing=True)
    )

    due = [
        DueReminder(
            entry, girl, user, item_id(ItemOrigin.CURATED, number), title, tomorrow
        )
        for entry, girl, user, number, title in curated
    ]
    due += [
        DueReminder(
            entry,
            girl,
            user,
            item_id(ItemOrigin.GROUP_ACTION, number),
            title,
            tomorrow,
        )
        for entry, girl, user, number, title in actions
    ]
    return due


def mark_reminder_sent(reminder: DueReminder) -> None:
    """Guarda para que data do evento o lembrete saiu. Quem chama faz o commit,
    antes de enviar (como os e-mails da #275): na dúvida, ela fica sem um
    lembrete, nunca recebe dois."""
    reminder.entry.reminder_sent_for = reminder.starts_on


# Texto a confirmar com o design: não há tela no Figma para o e-mail.
REMINDER_SUBJECT = "Amanhã tem {title}!"
REMINDER_BODY = """Oi, {name}!

Passando pra lembrar: amanhã, {date}, tem {title}.

Ver o evento na NISE: {url}

Você recebe este e-mail porque pediu pra ser lembrada um dia antes. Pra não \
receber mais, desmarque "Me lembra um dia antes" no evento.

Equipe NISE
"""

MONTHS = [
    "janeiro",
    "fevereiro",
    "março",
    "abril",
    "maio",
    "junho",
    "julho",
    "agosto",
    "setembro",
    "outubro",
    "novembro",
    "dezembro",
]


def day_text(day: date) -> str:
    """O dia como a A06·4b escreve, ex.: "1º de dezembro", "8 de novembro"."""
    number = "1º" if day.day == 1 else str(day.day)
    return f"{number} de {MONTHS[day.month - 1]}"


def reminder_email(reminder: DueReminder, event_url: str) -> tuple[str, str]:
    """O assunto e o texto do lembrete: o nome do evento, a data e o link de volta.

    `event_url` é o endereço do evento no app (/file/evento/{id}). O título vai
    numa linha só no assunto, para um título com quebra de linha não virar
    outro cabeçalho.
    """
    title = " ".join(reminder.title.split())
    subject = REMINDER_SUBJECT.format(title=title)
    body = REMINDER_BODY.format(
        name=first_name(reminder.girl.name),
        date=day_text(reminder.starts_on),
        title=title,
        url=event_url,
    )
    return subject, body
