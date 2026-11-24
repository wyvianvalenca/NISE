from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.modules.groups.exceptions import ExpiredInviteError, InvalidInviteError
from app.modules.groups.models import Group, GroupCoordinator, Invite
from app.modules.groups.utils import new_invite_code
from app.users.models import Role, User


async def get_valid_invite(
    session: AsyncSession, code: str, now: datetime | None = None
) -> Invite:
    """Devolve o convite com o grupo já carregado.

    Levanta InvalidInviteError se o código não existe e ExpiredInviteError se
    ele já venceu.
    """
    if now is None:
        now = datetime.now(UTC)

    invite = await session.scalar(
        select(Invite).where(Invite.code == code).options(selectinload(Invite.group))
    )

    if invite is None:
        raise InvalidInviteError

    if invite.expires_at <= now:
        raise ExpiredInviteError

    return invite


async def create_invite(
    session: AsyncSession, group: Group, days: int, now: datetime | None = None
) -> Invite:
    """Cria um convite do grupo que vale por `days` dias (usado pelo script)."""
    if now is None:
        now = datetime.now(UTC)

    invite = Invite(
        code=new_invite_code(),
        group_id=group.id,
        expires_at=now + timedelta(days=days),
    )
    session.add(invite)
    await session.commit()

    return invite


async def get_coordinator_group(session: AsyncSession, user: User) -> Group | None:
    """The group shown in a coordinator's top menu, or None.

    Only coordinators have one. With several groups the lowest id wins, so the
    answer does not change between calls; the menu only shows the name, and the
    routes that write data never read the group from here (RN-14).
    """
    if user.role is not Role.COORDINATOR:
        return None

    return await session.scalar(
        select(Group)
        .join(GroupCoordinator, GroupCoordinator.group_id == Group.id)
        .where(GroupCoordinator.user_id == user.id)
        .order_by(Group.id)
        .limit(1)
    )
