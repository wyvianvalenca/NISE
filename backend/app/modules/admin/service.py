from datetime import UTC, datetime

from sqlalchemy import exists, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.modules.actions.models import Action
from app.modules.admin.schemas import (
    CoordinatorCountsOut,
    CoordinatorFilter,
    CoordinatorListOut,
    CoordinatorRowOut,
    CoordinatorStatus,
    GroupCardOut,
)
from app.modules.cities.utils import normalize_search
from app.modules.girls.models import Girl
from app.modules.groups.models import CoordinatorInvite, Group, GroupCoordinator
from app.users.models import Role, User

# Convite aberto de um e-mail que ainda não tem conta. Com conta, ela já está
# na lista como coordenadora (ou o convite não serve mais): não conta duas vezes.
OPEN_INVITE = (
    CoordinatorInvite.accepted_at.is_(None),
    CoordinatorInvite.cancelled_at.is_(None),
    ~exists().where(User.email == CoordinatorInvite.email),
)

INVITE_STATUSES = {CoordinatorStatus.INVITE_SENT, CoordinatorStatus.INVITE_EXPIRED}

FILTER_STATUSES = {
    CoordinatorFilter.ACTIVE: {CoordinatorStatus.ACTIVE},
    CoordinatorFilter.INVITES: INVITE_STATUSES,
    CoordinatorFilter.DEACTIVATED: {CoordinatorStatus.DEACTIVATED},
}


async def list_coordinators(
    session: AsyncSession,
    status_filter: CoordinatorFilter = CoordinatorFilter.ALL,
    search: str = "",
    now: datetime | None = None,
) -> CoordinatorListOut:
    """A lista do admin (AD02, RF-S2.24): coordenadoras e convites, por nome.

    Só traz nome, grupo, situação e data: nenhum dado de menina (RN-41) e
    nenhum e-mail. Os convites cancelados ou aceitos não entram (o aceito já é
    a coordenadora), nem os de e-mail que já tem conta. A lista é pequena,
    então filtra e busca aqui.
    """
    now = now or datetime.now(UTC)

    members = await session.execute(
        select(User, Group.name, GroupCoordinator.created_at)
        .join(GroupCoordinator, GroupCoordinator.user_id == User.id)
        .join(Group, Group.id == GroupCoordinator.group_id)
        .where(User.role == Role.COORDINATOR)
    )
    invites = await session.execute(
        select(CoordinatorInvite, Group.name)
        .join(Group, Group.id == CoordinatorInvite.group_id)
        .where(*OPEN_INVITE)
    )

    rows: list[CoordinatorRowOut] = []
    for user, group_name, joined_at in members.all():
        if user.deactivated_at is not None:
            row_status, date = CoordinatorStatus.DEACTIVATED, user.deactivated_at
        else:
            row_status, date = CoordinatorStatus.ACTIVE, joined_at
        rows.append(
            CoordinatorRowOut(
                id=user.id,
                name=user.name,
                group_name=group_name,
                status=row_status,
                date=date,
            )
        )
    for invite, group_name in invites.all():
        expired = invite.expires_at <= now
        rows.append(
            CoordinatorRowOut(
                id=invite.id,
                name=invite.name,
                group_name=group_name,
                status=(
                    CoordinatorStatus.INVITE_EXPIRED
                    if expired
                    else CoordinatorStatus.INVITE_SENT
                ),
                date=invite.expires_at,
            )
        )

    counts = CoordinatorCountsOut(
        all=len(rows),
        active=sum(r.status is CoordinatorStatus.ACTIVE for r in rows),
        invites=sum(r.status in INVITE_STATUSES for r in rows),
        deactivated=sum(r.status is CoordinatorStatus.DEACTIVATED for r in rows),
    )

    wanted = FILTER_STATUSES.get(status_filter)
    term = normalize_search(search)
    shown = [
        r
        for r in rows
        if (wanted is None or r.status in wanted)
        and (
            not term
            or term in normalize_search(r.name)
            or term in normalize_search(r.group_name)
        )
    ]
    shown.sort(key=lambda r: (normalize_search(r.name), r.id))

    return CoordinatorListOut(items=shown, counts=counts)


async def list_group_cards(
    session: AsyncSession, now: datetime | None = None
) -> list[GroupCardOut]:
    """Os grupos da aba Grupos (AD06, RF-S2.29, D-120).

    Os que precisam de coordenadora vêm primeiro, depois os outros, cada bloco
    por nome. Um convite esperando não tira a etiqueta: só a coordenadora
    ativa tira. Só traz contagens, nada de menina (RN-41).
    """
    now = now or datetime.now(UTC)

    async def counts(group_column, *where) -> dict[int, int]:  # type: ignore[no-untyped-def]
        rows = await session.execute(
            select(group_column, func.count()).where(*where).group_by(group_column)
        )
        return {group_id: total for group_id, total in rows.all()}

    coordinators = await counts(
        GroupCoordinator.group_id,
        GroupCoordinator.user_id.in_(
            select(User.id).where(
                User.role == Role.COORDINATOR, User.deactivated_at.is_(None)
            )
        ),
    )
    invites = await counts(
        CoordinatorInvite.group_id,
        *OPEN_INVITE,
        CoordinatorInvite.expires_at > now,
    )
    girls = await counts(Girl.origin_group_id, Girl.origin_group_id.is_not(None))
    actions = await counts(Action.group_id)

    groups = await session.scalars(select(Group).options(selectinload(Group.city)))
    cards = [
        GroupCardOut(
            id=group.id,
            name=group.name,
            city=f"{group.city.name}, {group.city.state}" if group.city else None,
            coordinators=coordinators.get(group.id, 0),
            invites=invites.get(group.id, 0),
            girls=girls.get(group.id, 0),
            actions=actions.get(group.id, 0),
            needs_coordinator=coordinators.get(group.id, 0) == 0,
        )
        for group in groups
    ]
    cards.sort(key=lambda c: (not c.needs_coordinator, normalize_search(c.name), c.id))
    return cards
