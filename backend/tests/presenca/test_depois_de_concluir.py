"""Marcar ou adicionar alguém depois de concluir (#350): RF-F3.09, RF-F3.03,
RF-F4.01, RF-F4.02, RN-15, RN-29, D-80, D-81, RNF-F4.01, RNF-G.03.

Runs on a real Postgres. The e-mails go to a recorder. Names and e-mails are
fictional.
"""

import logging
import smtplib
from datetime import timedelta

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.actions.models import Action, Participation
from app.modules.attendance.emails import (
    EVALUATION_SUBJECT,
    INVITE_SUBJECT,
    send_attendance_emails,
)
from app.modules.attendance.models import AttendanceEmail
from app.modules.girls.models import Girl
from app.users.models import User
from tests.presenca.dados import (
    EVENT_DAY,
    Api,
    CorreioFalso,
    make_action,
    make_girl,
    make_group,
    register,
)

CONCLUDE = "/api/actions/{}/attendance/conclude"
PRESENT = "/api/actions/{}/attendance/present/{}"
GIRLS = "/api/actions/{}/attendance/girls"
PAGE = "/api/actions/{}/attendance"
EVALUATION = EVALUATION_SUBJECT.format(action="Introdução à robótica")


async def _concluded(
    banco: AsyncSession, api: Api, correio: CorreioFalso
) -> tuple[User, Action, Participation, Participation, Participation]:
    """A concluded action: `ana` came, `bia` (no account) and `carol` (with an
    account) were absent. The e-mails of the conclusion are forgotten."""
    group, coordinator = await make_group(banco)
    action = await make_action(banco, group)
    ana = await register(banco, action, await make_girl(banco, name="Ana Fictícia"))
    bia = await register(banco, action, await make_girl(banco, name="Bia Fictícia"))
    carol = await register(
        banco, action, await make_girl(banco, name="Carol Fictícia", with_account=True)
    )
    response = await api(coordinator).post(
        CONCLUDE.format(action.id), json={"present_ids": [ana.id]}
    )
    assert response.status_code == 200
    correio.sent.clear()
    return coordinator, action, ana, bia, carol


async def _email_of(banco: AsyncSession, participation: Participation) -> str:
    girl = await banco.get(Girl, participation.girl_id)
    assert girl is not None
    return girl.email


# --- "Marcar presença" in "Faltaram" (RF-F3.09) -------------------------------


async def test_marcar_em_faltaram_passa_para_presentes(
    banco: AsyncSession, api: Api, correio: CorreioFalso
) -> None:
    coordinator, action, _, bia, _ = await _concluded(banco, api, correio)
    concluded_on = (await api(coordinator).get(PAGE.format(action.id))).json()[
        "concluded_on"
    ]

    response = await api(coordinator).post(PRESENT.format(action.id, bia.id))

    assert response.status_code == 200
    body = response.json()
    assert body["present_count"] == 2
    assert body["registered_count"] == 3
    assert {g["id"] for g in body["girls"] if g["present"]} == {
        g["id"] for g in body["girls"] if g["name"] in ("Ana Fictícia", "Bia Fictícia")
    }
    # The date of the step "Presença" does not change (#350).
    assert body["concluded_on"] == concluded_on
    assert body["status"] == "concluded"
    assert body["can_delete"] is False


async def test_ela_recebe_a_avaliacao_na_hora_e_nenhum_convite_novo(
    banco: AsyncSession, api: Api, correio: CorreioFalso
) -> None:
    coordinator, action, _, bia, _ = await _concluded(banco, api, correio)

    body = (await api(coordinator).post(PRESENT.format(action.id, bia.id))).json()

    # She got the invite at the conclusion; now only the evaluation (RN-29).
    assert correio.to(await _email_of(banco, bia)) == [EVALUATION]
    assert body["evaluations_sent"] == 2
    assert body["invites_sent"] == 2


async def test_quem_tem_conta_tambem_recebe_so_a_avaliacao(
    banco: AsyncSession, api: Api, correio: CorreioFalso
) -> None:
    coordinator, action, _, _, carol = await _concluded(banco, api, correio)

    await api(coordinator).post(PRESENT.format(action.id, carol.id))

    assert correio.to(await _email_of(banco, carol)) == [EVALUATION]


async def test_segundo_toque_nao_muda_nada_nem_reenvia(
    banco: AsyncSession, api: Api, correio: CorreioFalso
) -> None:
    coordinator, action, _, bia, _ = await _concluded(banco, api, correio)
    client = api(coordinator)
    await client.post(PRESENT.format(action.id, bia.id))
    attended_at = await banco.scalar(
        select(Participation.attended_at).where(Participation.id == bia.id)
    )

    second = await client.post(PRESENT.format(action.id, bia.id))

    assert second.status_code == 200
    assert second.json()["present_count"] == 2
    assert len(correio.sent) == 1
    assert (
        await banco.scalar(
            select(Participation.attended_at)
            .where(Participation.id == bia.id)
            .execution_options(populate_existing=True)
        )
        == attended_at
    )


async def test_quem_ja_estava_presente_continua_e_nada_sai(
    banco: AsyncSession, api: Api, correio: CorreioFalso
) -> None:
    coordinator, action, ana, _, _ = await _concluded(banco, api, correio)

    response = await api(coordinator).post(PRESENT.format(action.id, ana.id))

    assert response.status_code == 200
    assert correio.sent == []


async def test_nao_ha_como_desmarcar_depois_de_concluir(
    banco: AsyncSession, api: Api, correio: CorreioFalso
) -> None:
    # D-80: after concluding, people are only added. Saving marks (which could
    # unmark) and concluding again are refused or change nothing.
    coordinator, action, ana, _, _ = await _concluded(banco, api, correio)
    client = api(coordinator)
    # The refused PUT rolls the shared session back, so keep the ids first.
    action_id, ana_id = action.id, ana.id

    saved = await client.put(
        f"/api/actions/{action_id}/attendance/marks", json={"present_ids": []}
    )
    again = await client.post(CONCLUDE.format(action_id), json={"present_ids": []})

    assert saved.status_code == 409
    assert saved.json() == {"error": "already_concluded"}
    assert again.json()["present_count"] == 1
    assert next(g for g in again.json()["girls"] if g["id"] == ana_id)["present"]


async def test_antes_de_concluir_marcar_uma_e_recusado(
    banco: AsyncSession, api: Api
) -> None:
    group, coordinator = await make_group(banco)
    action = await make_action(banco, group)
    registration = await register(banco, action, await make_girl(banco))

    response = await api(coordinator).post(PRESENT.format(action.id, registration.id))

    assert response.status_code == 409
    assert response.json() == {"error": "not_concluded"}


async def test_inscricao_de_outra_acao_e_recusada(
    banco: AsyncSession, api: Api, correio: CorreioFalso
) -> None:
    coordinator, action, _, _, _ = await _concluded(banco, api, correio)
    group, _ = await make_group(banco)
    other = await make_action(banco, group)
    foreign = await register(banco, other, await make_girl(banco))
    action_id = action.id

    response = await api(coordinator).post(PRESENT.format(action_id, foreign.id))

    assert response.status_code == 422
    assert response.json() == {"error": "unknown_registration"}
    assert correio.sent == []


async def test_coordenadora_de_outro_grupo_nao_marca(
    banco: AsyncSession, api: Api, correio: CorreioFalso
) -> None:
    _, action, _, bia, _ = await _concluded(banco, api, correio)
    _, other_coordinator = await make_group(banco)

    response = await api(other_coordinator).post(PRESENT.format(action.id, bia.id))

    assert response.status_code == 404
    attended = await banco.scalar(
        select(Participation.attended_at).where(Participation.id == bia.id)
    )
    assert attended is None
    assert correio.sent == []


async def test_falha_no_envio_mantem_marcada_e_tenta_de_novo(
    banco: AsyncSession, api: Api, correio: CorreioFalso
) -> None:
    coordinator, action, _, bia, _ = await _concluded(banco, api, correio)
    correio.failures = [smtplib.SMTPResponseException(451, b"later")]

    body = (await api(coordinator).post(PRESENT.format(action.id, bia.id))).json()

    assert body["present_count"] == 2
    assert correio.sent == []
    await send_attendance_emails(banco, connect=correio.connect)
    assert correio.to(await _email_of(banco, bia)) == [EVALUATION]


# --- "Veio sem inscrição?" after concluding (RF-F3.03) ------------------------


async def test_adicionar_depois_entra_ja_presente_e_recebe_os_dois(
    banco: AsyncSession, api: Api, correio: CorreioFalso
) -> None:
    coordinator, action, _, _, _ = await _concluded(banco, api, correio)

    response = await api(coordinator).post(
        GIRLS.format(action.id),
        json={"name": "Nova Fictícia", "email": "nova@exemplo.com"},
    )

    assert response.status_code == 200
    assert response.json()["girl"]["present"] is True
    assert sorted(correio.to("nova@exemplo.com")) == sorted(
        [INVITE_SUBJECT, EVALUATION]
    )
    page = (await api(coordinator).get(PAGE.format(action.id))).json()
    assert (page["present_count"], page["registered_count"]) == (2, 4)
    assert page["invites_sent"] == 3
    assert page["evaluations_sent"] == 2


async def test_adicionar_depois_quem_tem_conta_recebe_so_a_avaliacao(
    banco: AsyncSession, api: Api, correio: CorreioFalso
) -> None:
    coordinator, action, _, _, _ = await _concluded(banco, api, correio)
    girl = await make_girl(banco, with_account=True)

    await api(coordinator).post(
        GIRLS.format(action.id), json={"name": "Menina", "email": girl.email}
    )

    assert correio.to(girl.email) == [EVALUATION]


async def test_adicionar_depois_quem_ja_estava_inscrita_so_e_marcada(
    banco: AsyncSession, api: Api, correio: CorreioFalso
) -> None:
    coordinator, action, _, bia, _ = await _concluded(banco, api, correio)
    email = await _email_of(banco, bia)

    body = (
        await api(coordinator).post(
            GIRLS.format(action.id), json={"name": "Bia", "email": email}
        )
    ).json()

    assert body["already_registered"] is True
    assert body["girl"]["id"] == bia.id
    assert body["girl"]["present"] is True
    # The invite went at the conclusion: only the evaluation now.
    assert correio.to(email) == [EVALUATION]
    total = await banco.scalar(
        select(func.count())
        .select_from(Participation)
        .where(Participation.action_id == action.id)
    )
    assert total == 3


async def test_adicionar_depois_duas_vezes_nao_reenvia(
    banco: AsyncSession, api: Api, correio: CorreioFalso
) -> None:
    coordinator, action, _, _, _ = await _concluded(banco, api, correio)
    client = api(coordinator)
    body = {"name": "Nova", "email": "nova@exemplo.com"}

    await client.post(GIRLS.format(action.id), json=body)
    await client.post(GIRLS.format(action.id), json=body)

    assert len(correio.to("nova@exemplo.com")) == 2
    queued = await banco.scalar(
        select(func.count())
        .select_from(AttendanceEmail)
        .join(Girl, Girl.id == AttendanceEmail.girl_id)
        .where(Girl.email == "nova@exemplo.com")
    )
    assert queued == 2


async def test_adicionar_depois_nunca_cria_conta(
    banco: AsyncSession, api: Api, correio: CorreioFalso
) -> None:
    coordinator, action, _, _, _ = await _concluded(banco, api, correio)
    users = await banco.scalar(select(func.count()).select_from(User))

    await api(coordinator).post(
        GIRLS.format(action.id), json={"name": "Nova", "email": "nova@exemplo.com"}
    )

    assert await banco.scalar(select(func.count()).select_from(User)) == users


async def test_adicionar_antes_do_dia_continua_recusado(
    banco: AsyncSession, api: Api
) -> None:
    group, coordinator = await make_group(banco)
    action = await make_action(banco, group)

    response = await api(coordinator, today=EVENT_DAY - timedelta(days=1)).post(
        GIRLS.format(action.id), json={"name": "Nova", "email": "nova@exemplo.com"}
    )

    assert response.status_code == 409


async def test_nada_dela_vai_para_os_logs(
    banco: AsyncSession,
    api: Api,
    correio: CorreioFalso,
    caplog: pytest.LogCaptureFixture,
) -> None:
    coordinator, action, _, bia, _ = await _concluded(banco, api, correio)
    email = await _email_of(banco, bia)
    correio.failures = [smtplib.SMTPRecipientsRefused({email: (550, email.encode())})]

    with caplog.at_level(logging.DEBUG):
        await api(coordinator).post(PRESENT.format(action.id, bia.id))
        await api(coordinator).post(
            GIRLS.format(action.id),
            json={"name": "Nome Secreto", "email": "secreto@exemplo.com"},
        )

    for secret in (email, "Bia Fictícia", "secreto@exemplo.com", "Nome Secreto"):
        assert secret not in caplog.text
