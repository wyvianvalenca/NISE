from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.admin.schemas import (
    CoordinatorCountsOut,
    CoordinatorFilter,
    CoordinatorListOut,
    CoordinatorRowOut,
    CoordinatorStatus,
)
from app.modules.cities.utils import normalize_search
from app.modules.groups.models import CoordinatorInvite, Group, GroupCoordinator
from app.users.models import Role, User

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
    a coordenadora). A lista é pequena, então filtra e busca aqui.
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
        .where(
            CoordinatorInvite.accepted_at.is_(None),
            CoordinatorInvite.cancelled_at.is_(None),
        )
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
