"""O catálogo de sugestões: os itens que podem ser sugeridos, das duas fontes.

As regras de quem aparece ficam em funções puras (sem sessão), para serem
testadas sem banco. `load_catalog` só busca no banco e aplica essas funções.
Quais itens combinam com cada menina e em que ordem é a #80.
"""

from datetime import date

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.modules.actions.models import Action, ActionFormat, ActionVisibility
from app.modules.catalog.models import (
    CuratedItem,
    CuratedItemAudience,
    CuratedItemTopic,
    EffortBand,
    ItemKind,
    ItemLevel,
    ItemOrigin,
)
from app.modules.catalog.schemas import CatalogItem, CuratedItemIn, EventInfo
from app.modules.catalog.utils import (
    ACTION_TYPE_LABELS,
    CURATED_TYPE_LABELS,
    item_id,
)
from app.modules.groups.models import Group

# A coordenadora não informa o nível de uma ação. As ações dos grupos são
# feitas para quem está começando, então todas entram como iniciante (a confirmar
# com a equipe).
ACTION_LEVEL = ItemLevel.BEGINNER


def curated_is_visible(item: CuratedItem, today: date) -> bool:
    """Um item da curadoria aparece se está ativo e não venceu (RF-F11.06, RF-F11.07).

    A validade vale até o próprio dia. Um evento ainda precisa começar depois de
    hoje e estar dentro do prazo de inscrição.
    """
    if not item.active:
        return False
    if item.expires_on is not None and item.expires_on < today:
        return False
    if item.kind is ItemKind.EVENT:
        if item.starts_on is None or item.starts_on <= today:
            return False
        if (
            item.registration_deadline is not None
            and item.registration_deadline < today
        ):
            return False
    return True


def action_is_visible(action: Action, today: date) -> bool:
    """Uma ação de grupo aparece se é aberta, futura e com inscrições abertas (RN-16).

    "Futura" é começar depois de hoje, o mesmo dia que conta no status da ação
    (RN-37): no dia do evento ela já espera a presença. Ações com data passada
    nunca aparecem (RF-F30.14). Uma ação cancelada é excluída (RF-F30.12), então
    não chega aqui.
    """
    return (
        action.visibility is ActionVisibility.OPEN
        and action.registrations_open
        and action.starts_on > today
    )


def reaches_city(
    item_format: ActionFormat, city_ibge_code: int | None, girl_city: int | None
) -> bool:
    """Online aparece para todas; presencial, só para quem é da mesma cidade (RN-16).

    Vale para as duas fontes. Quem ainda não informou a cidade só vê os online.
    """
    if item_format is ActionFormat.ONLINE:
        return True
    return girl_city is not None and city_ibge_code == girl_city


def action_effort_band(action: Action) -> EffortBand:
    """Uma ação de um dia é "Rolê com a galera"; de mais dias, "Grande desafio".

    As duas faixas em grupo (RF-F10.03). A regra está a confirmar com a equipe.
    """
    if action.ends_on == action.starts_on:
        return EffortBand.ROLE_COM_A_GALERA
    return EffortBand.GRANDE_DESAFIO


def action_duration(action: Action) -> str:
    """Duração para a tela, "1 dia" ou "3 dias": a ação tem datas, não duração."""
    days = (action.ends_on - action.starts_on).days + 1
    return "1 dia" if days == 1 else f"{days} dias"


def from_curated(item: CuratedItem) -> CatalogItem:
    """O item da curadoria no formato do catálogo. Precisa de topics e audiences carregados."""
    event = None
    if item.kind is ItemKind.EVENT:
        # A restrição ck_curated_items_event_has_dates garante as duas datas.
        assert item.starts_on is not None and item.ends_on is not None
        event = EventInfo(
            starts_on=item.starts_on,
            ends_on=item.ends_on,
            registration_deadline=item.registration_deadline,
            organizer=item.source,
            prerequisites=item.prerequisites,
        )

    return CatalogItem(
        id=item_id(ItemOrigin.CURATED, item.id),
        origin=ItemOrigin.CURATED,
        kind=item.kind,
        type=item.type.value,
        type_label=CURATED_TYPE_LABELS[item.type],
        title=item.title,
        source=item.source,
        description=item.description,
        url=item.url,
        effort_band=item.effort_band,
        level=item.level,
        topics=[row.topic for row in item.topics],
        stages=[row.stage for row in item.audiences],
        format=item.format,
        city_ibge_code=item.city_ibge_code,
        min_age=item.min_age,
        cost_cents=item.cost_cents,
        duration=item.duration,
        event=event,
    )


def from_action(action: Action, group_name: str) -> CatalogItem:
    """A ação do grupo no formato do catálogo. Precisa de topics e audiences carregados.

    Toda ação tem datas, então é um evento. O grupo é o organizador, e o link é
    o de inscrição do grupo, sem nada acrescentado (RN-19).
    """
    # A restrição ck_actions_open_has_registration_url garante o link das abertas.
    assert action.registration_url is not None

    return CatalogItem(
        id=item_id(ItemOrigin.GROUP_ACTION, action.id),
        origin=ItemOrigin.GROUP_ACTION,
        kind=ItemKind.EVENT,
        type=action.type.value,
        type_label=ACTION_TYPE_LABELS[action.type],
        title=action.name,
        source=group_name,
        description=action.description or "",
        url=action.registration_url,
        effort_band=action_effort_band(action),
        level=ACTION_LEVEL,
        topics=[row.topic for row in action.topics],
        stages=[row.stage for row in action.audiences],
        format=action.format,
        city_ibge_code=action.city_ibge_code,
        min_age=None,
        cost_cents=None,
        duration=action_duration(action),
        event=EventInfo(
            starts_on=action.starts_on,
            ends_on=action.ends_on,
            registration_deadline=None,
            organizer=group_name,
            prerequisites=None,
        ),
    )


async def load_catalog(
    session: AsyncSession, girl_city: int | None, today: date
) -> list[CatalogItem]:
    """Todos os itens que podem ser sugeridos hoje a quem mora em `girl_city`.

    Primeiro os da curadoria, depois as ações dos grupos. A consulta já deixa de
    fora o que é óbvio (itens desativados, ações fechadas ou passadas), e as
    funções acima decidem o resto, para a regra ficar num lugar só.
    """
    curated = await session.scalars(
        select(CuratedItem)
        .where(CuratedItem.active.is_(True))
        .options(selectinload(CuratedItem.topics), selectinload(CuratedItem.audiences))
        .order_by(CuratedItem.id)
    )
    actions = await session.execute(
        select(Action, Group.name)
        .join(Group, Group.id == Action.group_id)
        .where(
            Action.visibility == ActionVisibility.OPEN,
            Action.registrations_open.is_(True),
            Action.starts_on > today,
        )
        .options(selectinload(Action.topics), selectinload(Action.audiences))
        .order_by(Action.starts_on, Action.id)
    )

    items = [from_curated(item) for item in curated if curated_is_visible(item, today)]
    items += [
        from_action(action, group_name)
        for action, group_name in actions
        if action_is_visible(action, today)
    ]
    return [
        item
        for item in items
        if reaches_city(item.format, item.city_ibge_code, girl_city)
    ]


async def is_suggestible(
    session: AsyncSession,
    origin: ItemOrigin,
    number: int,
    girl_city: int | None,
    today: date,
) -> bool:
    """O item existe e pode ser sugerido hoje a quem mora em `girl_city`.

    As mesmas regras de `load_catalog`, para um item só. Serve para recusar a
    escolha num item que ela não veria nas sugestões: desativado, vencido, ação
    fechada ou passada, presencial de outra cidade (RF-F11.07, RN-16).
    """
    if origin is ItemOrigin.CURATED:
        item = await session.scalar(select(CuratedItem).where(CuratedItem.id == number))
        return (
            item is not None
            and curated_is_visible(item, today)
            and reaches_city(item.format, item.city_ibge_code, girl_city)
        )

    action = await session.scalar(select(Action).where(Action.id == number))
    return (
        action is not None
        and action_is_visible(action, today)
        and reaches_city(action.format, action.city_ibge_code, girl_city)
    )


def apply_entry(item: CuratedItem, entry: CuratedItemIn) -> None:
    """Copia para o item o que está no arquivo da curadoria.

    Temas e etapas que continuam no arquivo ficam com a mesma linha; só os novos
    são criados e só os que saíram são apagados. Trocar a lista inteira apagaria
    e recriaria as mesmas linhas, e a restrição de único reclamaria no flush.
    O item precisa de topics e audiences carregados.
    """
    item.kind = entry.kind
    item.type = entry.type
    item.title = entry.title
    item.source = entry.source
    item.description = entry.description
    item.url = entry.url
    item.effort_band = entry.effort_band
    item.level = entry.level
    item.format = entry.format
    item.city_ibge_code = entry.city_ibge_code
    item.min_age = entry.min_age
    item.cost_cents = entry.cost_cents
    item.duration = entry.duration
    item.expires_on = entry.expires_on
    item.active = entry.active
    item.starts_on = entry.starts_on
    item.ends_on = entry.ends_on
    item.registration_deadline = entry.registration_deadline
    item.prerequisites = entry.prerequisites

    kept_topics = [row for row in item.topics if row.topic in entry.topics]
    current_topics = {row.topic for row in kept_topics}
    item.topics = kept_topics + [
        CuratedItemTopic(topic=topic)
        for topic in entry.topics
        if topic not in current_topics
    ]

    kept_stages = [row for row in item.audiences if row.stage in entry.stages]
    current_stages = {row.stage for row in kept_stages}
    item.audiences = kept_stages + [
        CuratedItemAudience(stage=stage)
        for stage in entry.stages
        if stage not in current_stages
    ]


async def save_curated_items(
    session: AsyncSession, entries: list[CuratedItemIn]
) -> tuple[int, int]:
    """Cria ou atualiza os itens da curadoria pelo slug. Devolve (criados, atualizados).

    Rodar de novo com o mesmo arquivo não duplica nada: o slug já existe e o
    item só é atualizado. Item que saiu do arquivo não é apagado (o filé das
    meninas aponta para ele); para tirá-lo das sugestões, use "active": false.
    """
    existing = {
        item.slug: item
        for item in await session.scalars(
            select(CuratedItem).options(
                selectinload(CuratedItem.topics), selectinload(CuratedItem.audiences)
            )
        )
    }

    created = 0
    for entry in entries:
        item = existing.get(entry.slug)
        if item is None:
            item = CuratedItem(slug=entry.slug, topics=[], audiences=[])
            session.add(item)
            existing[entry.slug] = item
            created += 1
        apply_entry(item, entry)

    await session.commit()
    return created, len(entries) - created
