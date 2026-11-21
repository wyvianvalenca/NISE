"""Eventos do filé da menina (M6, #118): o detalhe da A06·4b e o que muda o status.

Um evento é um item do filé como uma atividade (a mesma tabela `file_entries`),
mas vem de uma das duas fontes: um evento da curadoria (de fora, RN-19) ou uma
ação de um grupo da NISE (F30). As regras que dependem da data usam o dia de
hoje em Maceió, que a rota passa.
"""

import enum
from collections.abc import Collection
from dataclasses import dataclass
from datetime import date
from typing import Literal

from sqlalchemy import select
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
from app.modules.girls.models import StudyStage, Topic
from app.modules.girls.utils import STUDY_STAGE_LABELS, TOPIC_LABELS
from app.modules.groups.models import Group

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
    `city` é o nome da cidade de um presencial.
    """

    entry: FileEntry
    curated: CuratedItem | None
    action: Action | None
    group: str | None
    city: str | None

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
        waiting_attendance=(
            event.entry.status is FileStatus.SIGNED_UP
            and event_phase(event, today) is EventPhase.WAITING_ATTENDANCE
        ),
        cost=cost,
        stage=stage,
        prerequisites=prerequisites,
        registration_url=registration_url,
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
