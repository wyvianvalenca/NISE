"""Registering a girl in an action by her e-mail (C2, #232)."""

import logging
from datetime import date, timedelta

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.actions.models import Participation
from app.modules.girls.models import Girl, StudyStage
from app.modules.registrations.exceptions import ActionNotInGroupError
from app.modules.registrations.service import (
    RegistrationData,
    can_reopen,
    infer_study_stage,
    parse_study_stage,
    register_girl,
    registrations_are_open,
)
from app.users.models import User
from tests.inscricoes.dados import (
    EVENT_DAY,
    make_action,
    make_girl,
    make_group,
    register,
)


async def count(session: AsyncSession, model: type) -> int:
    return await session.scalar(select(func.count()).select_from(model)) or 0


async def test_new_email_creates_an_imported_record(banco: AsyncSession) -> None:
    group, _ = await make_group(banco)
    action = await make_action(banco, group)

    result = await register_girl(
        banco,
        action,
        [group.id],
        RegistrationData(
            name="Ana Fictícia",
            email="ana@exemplo.com",
            whatsapp="82 99999-0000",
            school_year="8º ano",
        ),
    )

    assert not result.record_existed
    assert not result.already_registered
    assert result.girl.user_id is None
    assert result.girl.name == "Ana Fictícia"
    assert result.girl.study_stage is StudyStage.FUNDAMENTAL
    assert result.participation.action_id == action.id
    assert result.participation.name == "Ana Fictícia"
    assert result.participation.whatsapp == "82 99999-0000"
    assert result.participation.school_year == "8º ano"
    assert result.participation.study_stage is StudyStage.FUNDAMENTAL


async def test_email_with_account_links_the_record_and_changes_nothing(
    banco: AsyncSession,
) -> None:
    group, _ = await make_group(banco)
    action = await make_action(banco, group)
    girl = await make_girl(banco, "Nome Da Conta", with_account=True)
    girls_before = await count(banco, Girl)

    result = await register_girl(
        banco,
        action,
        [group.id],
        RegistrationData(name="Outro Nome", email=girl.email),
    )

    assert result.record_existed
    assert result.girl.id == girl.id
    assert result.girl.user_id == girl.user_id
    assert result.girl.name == "Nome Da Conta"
    assert result.participation.name == "Outro Nome"
    assert await count(banco, Girl) == girls_before


async def test_email_imported_by_another_group_is_linked_not_copied(
    banco: AsyncSession,
) -> None:
    group, _ = await make_group(banco)
    other_group, _ = await make_group(banco)
    other_action = await make_action(banco, other_group)
    girl = await make_girl(banco, "Digitada Pelo Outro Grupo")
    await register(banco, other_action, girl)
    action = await make_action(banco, group)

    result = await register_girl(
        banco, action, [group.id], RegistrationData(name="Nome Daqui", email=girl.email)
    )

    assert result.record_existed
    assert result.girl.id == girl.id
    # The record is never changed, and what this registration shows is its own.
    assert result.girl.name == "Digitada Pelo Outro Grupo"
    assert result.participation.name == "Nome Daqui"


async def test_same_email_twice_in_one_action_changes_nothing(
    banco: AsyncSession,
) -> None:
    group, _ = await make_group(banco)
    action = await make_action(banco, group)
    first = await register_girl(
        banco,
        action,
        [group.id],
        RegistrationData(name="Primeira", email="dupla@exemplo.com", whatsapp="1"),
    )

    second = await register_girl(
        banco,
        action,
        [group.id],
        RegistrationData(name="Segunda", email="dupla@exemplo.com", whatsapp="2"),
    )

    assert second.already_registered
    assert second.record_existed
    assert second.participation.id == first.participation.id
    assert second.participation.name == "Primeira"
    assert second.participation.whatsapp == "1"
    assert await count(banco, Participation) == 1


async def test_email_ignores_case_and_spaces(banco: AsyncSession) -> None:
    group, _ = await make_group(banco)
    action = await make_action(banco, group)
    girl = await make_girl(banco)

    result = await register_girl(
        banco,
        action,
        [group.id],
        RegistrationData(name="Ana", email=f"  {girl.email.upper()} "),
    )

    assert result.record_existed
    assert result.girl.id == girl.id
    again = await register_girl(
        banco, action, [group.id], RegistrationData(name="Ana", email=girl.email)
    )
    assert again.already_registered


@pytest.mark.parametrize(
    ("school_year", "stage"),
    [
        ("8º ano", StudyStage.FUNDAMENTAL),
        ("1ª série", StudyStage.MEDIO),
        ("2º ano do médio", StudyStage.MEDIO),
        ("3º ano EM", StudyStage.MEDIO),
        ("2º módulo técnico", StudyStage.TECNICO),
        ("4º período", StudyStage.GRADUACAO),
        ("8ª série", StudyStage.FUNDAMENTAL),
        ("9º ano do fundamental", StudyStage.FUNDAMENTAL),
        ("6 ano", StudyStage.FUNDAMENTAL),
        ("1º ano", StudyStage.MEDIO),
        ("3º ano", StudyStage.MEDIO),
        ("2ª série", StudyStage.MEDIO),
        ("ano que vem", None),
        ("sei lá", None),
    ],
)
async def test_school_year_infers_the_stage(
    banco: AsyncSession, school_year: str, stage: StudyStage | None
) -> None:
    group, _ = await make_group(banco)
    action = await make_action(banco, group)

    result = await register_girl(
        banco,
        action,
        [group.id],
        RegistrationData(name="Ana", email="ano@exemplo.com", school_year=school_year),
    )

    assert result.participation.study_stage is stage
    assert result.girl.study_stage is stage


async def test_study_stage_wins_over_school_year(banco: AsyncSession) -> None:
    group, _ = await make_group(banco)
    action = await make_action(banco, group)

    result = await register_girl(
        banco,
        action,
        [group.id],
        RegistrationData(
            name="Ana",
            email="nivel@exemplo.com",
            study_stage=StudyStage.GRADUACAO,
            school_year="8º ano",
        ),
    )

    assert result.participation.study_stage is StudyStage.GRADUACAO


async def test_action_of_another_group_is_refused(banco: AsyncSession) -> None:
    group, _ = await make_group(banco)
    other_group, _ = await make_group(banco)
    other_action = await make_action(banco, other_group)

    with pytest.raises(ActionNotInGroupError):
        await register_girl(
            banco,
            other_action,
            [group.id],
            RegistrationData(name="Ana", email="x@exemplo.com"),
        )

    assert await count(banco, Participation) == 0
    assert await banco.scalar(select(Girl).where(Girl.email == "x@exemplo.com")) is None


async def test_closed_registrations_do_not_block(banco: AsyncSession) -> None:
    group, _ = await make_group(banco)
    action = await make_action(banco, group, registrations_open=False)

    result = await register_girl(
        banco, action, [group.id], RegistrationData(name="Ana", email="a@exemplo.com")
    )

    assert not result.already_registered


async def test_no_user_is_created(banco: AsyncSession) -> None:
    group, _ = await make_group(banco)
    action = await make_action(banco, group)
    users_before = await count(banco, User)

    result = await register_girl(
        banco, action, [group.id], RegistrationData(name="Ana", email="a@exemplo.com")
    )

    assert await count(banco, User) == users_before
    assert result.girl.user_id is None


async def test_nothing_about_the_girl_is_logged(
    banco: AsyncSession, caplog: pytest.LogCaptureFixture
) -> None:
    group, _ = await make_group(banco)
    action = await make_action(banco, group)

    with caplog.at_level(logging.DEBUG):
        await register_girl(
            banco,
            action,
            [group.id],
            RegistrationData(
                name="Zuleica Sigilosa",
                email="sigilosa@exemplo.com",
                whatsapp="82 98888-7777",
            ),
        )

    assert "Sigilosa" not in caplog.text
    assert "sigilosa@" not in caplog.text
    assert "98888" not in caplog.text


@pytest.mark.parametrize(
    ("text", "stage"),
    [
        ("Ensino Fundamental", StudyStage.FUNDAMENTAL),
        ("ENSINO MÉDIO", StudyStage.MEDIO),
        ("Curso técnico", StudyStage.TECNICO),
        ("Graduação", StudyStage.GRADUACAO),
        ("Faculdade", StudyStage.GRADUACAO),
        ("Universitária", StudyStage.GRADUACAO),
        ("Já me formei", StudyStage.FORMADA),
        ("Pós-graduação", StudyStage.FORMADA),
        ("medio", StudyStage.MEDIO),
        ("formada", StudyStage.FORMADA),
        ("não sei", None),
        ("", None),
        (None, None),
    ],
)
def test_parse_study_stage(text: str | None, stage: StudyStage | None) -> None:
    assert parse_study_stage(text) is stage


def test_infer_study_stage_level_wins_and_year_fills() -> None:
    assert infer_study_stage(StudyStage.TECNICO, "8º ano") is StudyStage.TECNICO
    assert infer_study_stage(None, "8º ano") is StudyStage.FUNDAMENTAL
    assert infer_study_stage(None, None) is None
    assert infer_study_stage(None, "xyz") is None


class _FakeAction:
    def __init__(self, registrations_open: bool) -> None:
        self.registrations_open = registrations_open
        self.starts_on = EVENT_DAY


def test_registrations_are_open_until_the_day_of_the_event() -> None:
    action = _FakeAction(True)
    before = EVENT_DAY - timedelta(days=1)

    assert registrations_are_open(action, before)  # type: ignore[arg-type]
    assert not registrations_are_open(action, EVENT_DAY)  # type: ignore[arg-type]
    assert not registrations_are_open(_FakeAction(False), before)  # type: ignore[arg-type]


def test_can_reopen_only_when_closed_and_before_the_event() -> None:
    before: date = EVENT_DAY - timedelta(days=1)

    assert can_reopen(_FakeAction(False), before)  # type: ignore[arg-type]
    assert not can_reopen(_FakeAction(False), EVENT_DAY)  # type: ignore[arg-type]
    assert not can_reopen(_FakeAction(True), before)  # type: ignore[arg-type]
