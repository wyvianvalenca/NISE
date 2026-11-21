"""Eventos do filé da menina (M6, #118): o detalhe da A06·4b e o que muda o status.

Um evento é um item do filé como uma atividade (a mesma tabela `file_entries`),
mas vem de uma das duas fontes: um evento da curadoria (de fora, RN-19) ou uma
ação de um grupo da NISE (F30). As regras que dependem da data usam o dia de
hoje em Maceió, que a rota passa.
"""

from dataclasses import dataclass
from datetime import date

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.modules.actions.models import Action, ActionFormat, ActionVisibility
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
from app.modules.girl_file.service import find_entry, main_theme
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
) -> FileEvent | None:
    """Um evento do filé dela, ou None se não há.

    Fica de fora o que não é um evento no filé dela: o "Ver depois", o "Não é
    pra mim", um item sem escolha e as atividades, que abrem a A06·4a.

    A linha é buscada pelo id dela, então a de outra menina nunca é achada
    (RNF-G.03). Com `for_update`, a linha fica travada até o fim da transação
    (`find_entry`): duas mudanças ao mesmo tempo vão uma depois da outra.
    """
    entry = await find_entry(session, girl_id, origin, number, for_update=for_update)
    if entry is None or entry.status not in EVENT_STATUS:
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
        cost=cost,
        stage=stage,
        prerequisites=prerequisites,
        registration_url=registration_url,
    )
