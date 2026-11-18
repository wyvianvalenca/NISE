"""Restrições únicas conferidas no Postgres de verdade (fixture `db_session`).

O `test_core_models.py` confere que as restrições estão declaradas nos models;
aqui o banco é quem recusa a linha duplicada. Os dados são fictícios.
"""

from datetime import date

import pytest
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.actions.models import (
    Action,
    ActionFormat,
    ActionType,
    ActionVisibility,
    Participation,
)
from app.modules.girls.models import Girl
from app.modules.groups.models import Group
from app.users.models import OAuthAccount, Provider, User


async def test_two_users_cannot_share_an_email(db_session: AsyncSession) -> None:
    db_session.add(User(email="ana@exemplo.test", name="Ana"))
    await db_session.flush()

    db_session.add(User(email="ana@exemplo.test", name="Outra Ana"))
    with pytest.raises(IntegrityError):
        await db_session.flush()


async def test_one_google_account_links_to_a_single_user(
    db_session: AsyncSession,
) -> None:
    first = User(email="bia@exemplo.test", name="Bia")
    second = User(email="carla@exemplo.test", name="Carla")
    db_session.add_all([first, second])
    await db_session.flush()

    db_session.add(
        OAuthAccount(
            user_id=first.id, provider=Provider.GOOGLE, provider_user_id="g-123"
        )
    )
    await db_session.flush()

    db_session.add(
        OAuthAccount(
            user_id=second.id, provider=Provider.GOOGLE, provider_user_id="g-123"
        )
    )
    with pytest.raises(IntegrityError):
        await db_session.flush()


async def test_girl_email_is_unique_across_groups(db_session: AsyncSession) -> None:
    # RF-F2.01: listas de grupos diferentes reconhecem a mesma menina pelo e-mail.
    db_session.add(Girl(email="duda@exemplo.test", name="Duda"))
    await db_session.flush()

    db_session.add(Girl(email="duda@exemplo.test", name="Duda de outra lista"))
    with pytest.raises(IntegrityError):
        await db_session.flush()


async def test_girl_takes_part_in_an_action_only_once(
    db_session: AsyncSession,
) -> None:
    # RF-F2.03: um registro de participação por menina e ação.
    group = Group(name="Grupo Fictício")
    girl = Girl(email="eva@exemplo.test", name="Eva")
    db_session.add_all([group, girl])
    await db_session.flush()

    action = Action(
        group_id=group.id,
        name="Oficina fictícia",
        type=ActionType.OFICINA,
        starts_on=date(2026, 3, 10),
        ends_on=date(2026, 3, 10),
        format=ActionFormat.ONLINE,
        visibility=ActionVisibility.CLOSED,
    )
    db_session.add(action)
    await db_session.flush()

    db_session.add(Participation(girl_id=girl.id, action_id=action.id))
    await db_session.flush()

    db_session.add(Participation(girl_id=girl.id, action_id=action.id))
    with pytest.raises(IntegrityError):
        await db_session.flush()
