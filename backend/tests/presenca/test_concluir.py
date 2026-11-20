"""Concluir presença (#348): RF-F3.05, RF-F3.07, RF-F4.01, RF-F4.02, RN-15,
RN-29, RN-32, D-34, D-81, RNF-F4.01, RNF-G.03.

Runs on a real Postgres. The e-mails go to a recorder (CorreioFalso), never to
anyone. Names and e-mails are fictional.
"""

import logging
import smtplib
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.modules.actions.models import Action, Participation
from app.modules.actions.service import today_in_maceio
from app.modules.answers.models import Answer, AnswerStage
from app.modules.attendance import cron as attendance_cron
from app.modules.attendance.emails import (
    EVALUATION_SUBJECT,
    INVITE_SUBJECT,
    send_attendance_emails,
)
from app.modules.attendance.models import AttendanceEmail, AttendanceEmailKind
from app.modules.girls.models import Girl
from app.modules.groups.models import Invite
from app.users.models import Role, User
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
PAGE = "/api/actions/{}/attendance"
EVALUATION = EVALUATION_SUBJECT.format(action="Introdução à robótica")


class Cenario:
    """An action on its day with four registered girls:

    - `ana`: no account, will be present;
    - `bia`: no account, will be absent;
    - `carol`: has an account, will be present;
    - `duda`: has an account, will be absent.
    """

    coordinator: User
    action: Action
    ana: Participation
    bia: Participation
    carol: Participation
    duda: Participation
    girls: dict[str, Girl]


async def _cenario(banco: AsyncSession) -> Cenario:
    c = Cenario()
    group, c.coordinator = await make_group(banco)
    c.action = await make_action(banco, group)
    c.girls = {}
    for name, account in (
        ("ana", False),
        ("bia", False),
        ("carol", True),
        ("duda", True),
    ):
        girl = await make_girl(
            banco, name=f"{name.title()} Fictícia", with_account=account
        )
        c.girls[name] = girl
        setattr(c, name, await register(banco, c.action, girl))
    return c


async def _emails(banco: AsyncSession, action_id: int) -> list[AttendanceEmail]:
    return list(
        (
            await banco.scalars(
                select(AttendanceEmail)
                .where(AttendanceEmail.action_id == action_id)
                .execution_options(populate_existing=True)
            )
        ).all()
    )


async def test_concluir_marca_a_presenca_e_conclui_a_acao(
    banco: AsyncSession, api: Api
) -> None:
    c = await _cenario(banco)

    response = await api(c.coordinator).post(
        CONCLUDE.format(c.action.id), json={"present_ids": [c.ana.id, c.carol.id]}
    )

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "concluded"
    assert body["can_delete"] is False
    # The day "Concluir presença" was tapped, in Maceió time.
    assert body["concluded_on"] == str(today_in_maceio())
    assert body["present_count"] == 2
    assert body["registered_count"] == 4
    present = {girl["id"]: girl["present"] for girl in body["girls"]}
    assert present == {
        c.ana.id: True,
        c.bia.id: False,
        c.carol.id: True,
        c.duda.id: False,
    }


async def test_convite_a_quem_nao_tem_conta_e_avaliacao_a_quem_veio(
    banco: AsyncSession, api: Api, correio: CorreioFalso
) -> None:
    c = await _cenario(banco)

    body = (
        await api(c.coordinator).post(
            CONCLUDE.format(c.action.id), json={"present_ids": [c.ana.id, c.carol.id]}
        )
    ).json()

    g = c.girls
    # Invite: every registered girl without an account, present or absent.
    # Evaluation: every present girl, with or without an account.
    assert sorted(correio.to(g["ana"].email)) == sorted([INVITE_SUBJECT, EVALUATION])
    assert correio.to(g["bia"].email) == [INVITE_SUBJECT]
    assert correio.to(g["carol"].email) == [EVALUATION]
    assert correio.to(g["duda"].email) == []
    # The card "Depois da ação" counts only what really went out (D-81).
    assert body["invites_sent"] == 2
    assert body["evaluations_sent"] == 2


async def test_o_convite_leva_um_link_pessoal_de_30_dias(
    banco: AsyncSession, api: Api, correio: CorreioFalso
) -> None:
    c = await _cenario(banco)
    before = datetime.now(UTC)

    await api(c.coordinator).post(
        CONCLUDE.format(c.action.id), json={"present_ids": []}
    )

    bia = c.girls["bia"]
    invite = await banco.scalar(select(Invite).where(Invite.girl_id == bia.id))
    assert invite is not None
    assert invite.group_id == c.action.group_id
    assert (
        timedelta(days=29, hours=23)
        < invite.expires_at - before
        < timedelta(days=30, minutes=1)
    )
    (body,) = [body for to, _, body in correio.sent if to == bia.email]
    assert f"{settings.app_url.rstrip('/')}/convite/{invite.code}" in body
    assert "30 dias" in body
    # The link opens the invite screen like the group's link (A01b), with no data
    # of hers.
    response = await api(None).get(f"/api/invites/{invite.code}")
    assert response.status_code == 200
    assert set(response.json()) == {"groupName"}


async def test_o_link_pessoal_vence_em_30_dias(
    banco: AsyncSession, api: Api, correio: CorreioFalso
) -> None:
    c = await _cenario(banco)
    await api(c.coordinator).post(
        CONCLUDE.format(c.action.id), json={"present_ids": []}
    )
    invite = await banco.scalar(
        select(Invite).where(Invite.girl_id == c.girls["bia"].id)
    )
    assert invite is not None
    invite.expires_at = datetime.now(UTC) - timedelta(seconds=1)
    await banco.commit()

    response = await api(None).get(f"/api/invites/{invite.code}")

    assert response.status_code == 410


async def test_concluir_de_novo_nao_muda_nada_nem_reenvia(
    banco: AsyncSession, api: Api, correio: CorreioFalso
) -> None:
    c = await _cenario(banco)
    client = api(c.coordinator)
    first = (
        await client.post(
            CONCLUDE.format(c.action.id), json={"present_ids": [c.ana.id]}
        )
    ).json()
    sent = len(correio.sent)

    second = await client.post(
        CONCLUDE.format(c.action.id), json={"present_ids": [c.bia.id, c.duda.id]}
    )

    assert second.status_code == 200
    assert second.json()["present_count"] == first["present_count"] == 1
    assert second.json()["concluded_on"] == first["concluded_on"]
    assert len(correio.sent) == sent
    assert len(await _emails(banco, c.action.id)) == 3


async def test_quem_ja_recebeu_convite_em_outra_acao_nao_recebe_outro(
    banco: AsyncSession, api: Api, correio: CorreioFalso
) -> None:
    # RN-29: a single invite to create an account, whatever the group.
    c = await _cenario(banco)
    other_group, other_coordinator = await make_group(banco)
    earlier = await make_action(
        banco, other_group, starts_on=EVENT_DAY - timedelta(days=20)
    )
    await register(banco, earlier, c.girls["bia"])
    await api(other_coordinator).post(
        CONCLUDE.format(earlier.id), json={"present_ids": []}
    )
    assert correio.to(c.girls["bia"].email) == [INVITE_SUBJECT]

    page = (await api(c.coordinator).get(PAGE.format(c.action.id))).json()
    assert page["invites_to_send"] == 1  # only ana now
    body = (
        await api(c.coordinator).post(
            CONCLUDE.format(c.action.id), json={"present_ids": []}
        )
    ).json()

    assert correio.to(c.girls["bia"].email) == [INVITE_SUBJECT]
    assert body["invites_sent"] == 1


async def test_conta_com_o_email_dela_conta_como_conta(
    banco: AsyncSession, api: Api, correio: CorreioFalso
) -> None:
    # Her record is not linked yet, but an account with her e-mail exists.
    c = await _cenario(banco)
    banco.add(User(email=c.girls["bia"].email, name="Bia", role=Role.GIRL))
    await banco.commit()

    await api(c.coordinator).post(
        CONCLUDE.format(c.action.id), json={"present_ids": []}
    )

    assert correio.to(c.girls["bia"].email) == []


async def test_antes_de_concluir_diz_quantos_convites_vao_sair(
    banco: AsyncSession, api: Api
) -> None:
    c = await _cenario(banco)

    body = (await api(c.coordinator).get(PAGE.format(c.action.id))).json()

    assert body["invites_to_send"] == 2
    assert body["invites_sent"] == 0
    assert body["evaluations_sent"] == 0


async def test_email_invalido_e_pulado_e_nao_conta(
    banco: AsyncSession, api: Api, correio: CorreioFalso
) -> None:
    c = await _cenario(banco)
    broken = Girl(email="sem-arroba-ficticio", name="Endereço Quebrado")
    banco.add(broken)
    await banco.commit()
    registration = await register(banco, c.action, broken)

    page = (await api(c.coordinator).get(PAGE.format(c.action.id))).json()
    assert page["invites_to_send"] == 2

    body = (
        await api(c.coordinator).post(
            CONCLUDE.format(c.action.id), json={"present_ids": [registration.id]}
        )
    ).json()

    assert correio.to("sem-arroba-ficticio") == []
    assert body["invites_sent"] == 2
    assert body["evaluations_sent"] == 0
    assert body["present_count"] == 1


async def test_concluir_sem_ninguem_marcado(
    banco: AsyncSession, api: Api, correio: CorreioFalso
) -> None:
    # Open question 1 of #348: assumed allowed.
    c = await _cenario(banco)

    body = (
        await api(c.coordinator).post(
            CONCLUDE.format(c.action.id), json={"present_ids": []}
        )
    ).json()

    assert body["status"] == "concluded"
    assert body["present_count"] == 0
    assert body["evaluations_sent"] == 0
    assert body["invites_sent"] == 2


async def test_as_marcacoes_salvas_nao_contam_so_as_enviadas_ao_concluir(
    banco: AsyncSession, api: Api, correio: CorreioFalso
) -> None:
    c = await _cenario(banco)
    client = api(c.coordinator)
    await client.put(
        f"/api/actions/{c.action.id}/attendance/marks", json={"present_ids": [c.bia.id]}
    )

    body = (
        await client.post(
            CONCLUDE.format(c.action.id), json={"present_ids": [c.ana.id]}
        )
    ).json()

    present = {girl["id"] for girl in body["girls"] if girl["present"]}
    assert present == {c.ana.id}
    assert all(girl["saved_present"] is False for girl in body["girls"])
    assert EVALUATION not in correio.to(c.girls["bia"].email)


async def test_a_avaliacao_passa_a_ficar_pendente_para_quem_veio(
    banco: AsyncSession, api: Api
) -> None:
    # Only who has attendance rates the action (#58): the A03 now finds it.
    c = await _cenario(banco)
    await api(c.coordinator).post(
        CONCLUDE.format(c.action.id), json={"present_ids": [c.carol.id]}
    )

    attended = await banco.scalar(
        select(Participation.attended_at).where(Participation.id == c.carol.id)
    )
    absent = await banco.scalar(
        select(Participation.attended_at).where(Participation.id == c.duda.id)
    )
    assert attended is not None
    assert absent is None


# --- When sending fails (D-81) ------------------------------------------------


async def test_sem_smtp_conclui_e_os_emails_esperam_na_fila(
    banco: AsyncSession, api: Api, correio: CorreioFalso
) -> None:
    c = await _cenario(banco)
    correio.configured = False

    body = (
        await api(c.coordinator).post(
            CONCLUDE.format(c.action.id), json={"present_ids": [c.ana.id]}
        )
    ).json()

    assert body["status"] == "concluded"
    emails = await _emails(banco, c.action.id)
    assert len(emails) == 3
    assert all(email.sent_at is None for email in emails)
    # Waiting in the queue still counts as sent for the card.
    assert body["invites_sent"] == 2

    correio.configured = True
    result = await send_attendance_emails(banco, connect=correio.connect)

    assert result.sent == 3
    assert len(correio.sent) == 3


async def test_falha_temporaria_volta_para_a_fila_e_sai_depois(
    banco: AsyncSession, api: Api, correio: CorreioFalso
) -> None:
    c = await _cenario(banco)
    correio.failures = [smtplib.SMTPResponseException(421, b"try later")]

    await api(c.coordinator).post(
        CONCLUDE.format(c.action.id), json={"present_ids": []}
    )

    assert correio.sent == []
    assert all(email.sent_at is None for email in await _emails(banco, c.action.id))

    result = await send_attendance_emails(banco, connect=correio.connect)

    assert result.sent == 2
    # The link of the failed try was never sent; the one sent works.
    assert len(correio.sent) == 2


async def test_endereco_recusado_de_vez_e_descartado_e_nao_conta(
    banco: AsyncSession, api: Api, correio: CorreioFalso
) -> None:
    c = await _cenario(banco)
    correio.failures = [smtplib.SMTPRecipientsRefused({"x": (550, b"no such user")})]

    body = (
        await api(c.coordinator).post(
            CONCLUDE.format(c.action.id), json={"present_ids": []}
        )
    ).json()

    assert len(correio.sent) == 1
    assert body["invites_sent"] == 1
    dropped = [e for e in await _emails(banco, c.action.id) if e.dropped_at is not None]
    assert len(dropped) == 1


async def test_conexao_caida_no_meio_nao_reenvia(
    banco: AsyncSession, api: Api, correio: CorreioFalso
) -> None:
    # The server may have accepted it: in doubt, never twice (RNF-F4.01).
    c = await _cenario(banco)
    correio.failures = [smtplib.SMTPServerDisconnected()]

    await api(c.coordinator).post(
        CONCLUDE.format(c.action.id), json={"present_ids": []}
    )
    await send_attendance_emails(banco, connect=correio.connect)

    emails = await _emails(banco, c.action.id)
    assert all(email.sent_at is not None for email in emails)
    assert len(correio.sent) == 1


async def test_convite_de_quem_criou_conta_antes_do_envio_e_descartado(
    banco: AsyncSession, api: Api, correio: CorreioFalso
) -> None:
    c = await _cenario(banco)
    correio.configured = False
    await api(c.coordinator).post(
        CONCLUDE.format(c.action.id), json={"present_ids": []}
    )
    user = User(email=c.girls["bia"].email, name="Bia", role=Role.GIRL)
    banco.add(user)
    await banco.commit()
    c.girls["bia"].user_id = user.id
    await banco.commit()

    correio.configured = True
    result = await send_attendance_emails(banco, connect=correio.connect)

    assert correio.to(c.girls["bia"].email) == []
    assert result.dropped == 1


async def test_avaliacao_de_quem_ja_avaliou_e_descartada(
    banco: AsyncSession, api: Api, correio: CorreioFalso
) -> None:
    c = await _cenario(banco)
    correio.configured = False
    await api(c.coordinator).post(
        CONCLUDE.format(c.action.id), json={"present_ids": [c.carol.id]}
    )
    banco.add(
        Answer(
            girl_id=c.girls["carol"].id,
            action_id=c.action.id,
            stage=AnswerStage.RATING,
            score=5,
        )
    )
    await banco.commit()

    correio.configured = True
    await send_attendance_emails(banco, connect=correio.connect)

    assert correio.to(c.girls["carol"].email) == []


async def test_o_banco_nunca_aceita_o_mesmo_email_duas_vezes(
    banco: AsyncSession, api: Api
) -> None:
    c = await _cenario(banco)
    await api(c.coordinator).post(
        CONCLUDE.format(c.action.id), json={"present_ids": [c.ana.id]}
    )
    ana = c.girls["ana"]

    banco.add(
        AttendanceEmail(
            girl_id=ana.id, action_id=c.action.id, kind=AttendanceEmailKind.EVALUATION
        )
    )
    with pytest.raises(IntegrityError):
        await banco.flush()
    await banco.rollback()


async def test_um_convite_so_por_menina_mesmo_em_outra_acao(
    banco: AsyncSession, api: Api
) -> None:
    c = await _cenario(banco)
    await api(c.coordinator).post(
        CONCLUDE.format(c.action.id), json={"present_ids": []}
    )
    group, _ = await make_group(banco)
    other = await make_action(banco, group)

    banco.add(
        AttendanceEmail(
            girl_id=c.girls["bia"].id,
            action_id=other.id,
            kind=AttendanceEmailKind.INVITE,
        )
    )
    with pytest.raises(IntegrityError):
        await banco.flush()
    await banco.rollback()


async def test_nome_da_acao_com_quebra_de_linha_nao_derruba_o_email(
    banco: AsyncSession, api: Api, correio: CorreioFalso
) -> None:
    group, coordinator = await make_group(banco)
    action = await make_action(banco, group, name="Robótica\r\nBcc: x@exemplo.com")
    girl = await make_girl(banco, with_account=True)
    registration = await register(banco, action, girl)

    await api(coordinator).post(
        CONCLUDE.format(action.id), json={"present_ids": [registration.id]}
    )

    ((_, subject, _),) = correio.sent
    assert "\n" not in subject and "\r" not in subject


# --- When and who (RN-37, RNF-G.03) -------------------------------------------


async def test_antes_do_dia_e_recusado_e_nada_sai(
    banco: AsyncSession, api: Api, correio: CorreioFalso
) -> None:
    c = await _cenario(banco)
    action_id = c.action.id

    response = await api(c.coordinator, today=EVENT_DAY - timedelta(days=1)).post(
        CONCLUDE.format(action_id), json={"present_ids": [c.ana.id]}
    )

    assert response.status_code == 409
    assert response.json() == {"error": "too_early"}
    assert await _emails(banco, action_id) == []
    assert correio.sent == []


async def test_id_de_outra_acao_nao_conclui(
    banco: AsyncSession, api: Api, correio: CorreioFalso
) -> None:
    c = await _cenario(banco)
    group, _ = await make_group(banco)
    other = await make_action(banco, group)
    foreign = await register(banco, other, await make_girl(banco))

    response = await api(c.coordinator).post(
        CONCLUDE.format(c.action.id), json={"present_ids": [c.ana.id, foreign.id]}
    )

    assert response.status_code == 422
    await banco.refresh(c.action)
    assert c.action.attendance_registered_at is None
    assert correio.sent == []


async def test_coordenadora_de_outro_grupo_nao_conclui(
    banco: AsyncSession, api: Api, correio: CorreioFalso
) -> None:
    c = await _cenario(banco)
    _, other_coordinator = await make_group(banco)

    response = await api(other_coordinator).post(
        CONCLUDE.format(c.action.id), json={"present_ids": []}
    )

    assert response.status_code == 404
    await banco.refresh(c.action)
    assert c.action.attendance_registered_at is None
    assert correio.sent == []


async def test_nenhum_nome_ou_endereco_vai_para_os_logs(
    banco: AsyncSession,
    api: Api,
    correio: CorreioFalso,
    caplog: pytest.LogCaptureFixture,
) -> None:
    c = await _cenario(banco)
    correio.failures = [
        smtplib.SMTPRecipientsRefused({c.girls["ana"].email: (550, b"x")}),
        smtplib.SMTPResponseException(421, c.girls["bia"].email.encode()),
    ]

    with caplog.at_level(logging.DEBUG):
        await api(c.coordinator).post(
            CONCLUDE.format(c.action.id), json={"present_ids": [c.ana.id]}
        )
        await send_attendance_emails(banco, connect=correio.connect)

    for girl in c.girls.values():
        assert girl.email not in caplog.text
        assert girl.name not in caplog.text


# --- The scheduled routine ----------------------------------------------------


async def test_rotina_sem_segredo_leva_401(banco: AsyncSession, api: Api) -> None:
    response = await api(None).get("/api/cron/attendance-emails")

    assert response.status_code == 401


async def test_rotina_envia_o_que_ficou_na_fila(
    banco: AsyncSession,
    api: Api,
    correio: CorreioFalso,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    c = await _cenario(banco)
    correio.configured = False
    await api(c.coordinator).post(
        CONCLUDE.format(c.action.id), json={"present_ids": []}
    )
    monkeypatch.setattr(settings, "cron_secret", "segredo-ficticio")
    # The routine opens the real SMTP connection: here it is the recorder.
    monkeypatch.setattr(attendance_cron, "SmtpConnection", correio.connect)
    headers = {"Authorization": "Bearer segredo-ficticio"}

    stopped = await api(None).get("/api/cron/attendance-emails", headers=headers)
    assert stopped.status_code == 502

    correio.configured = True
    response = await api(None).get("/api/cron/attendance-emails", headers=headers)

    assert response.status_code == 200
    assert response.json() == {"sent": 2, "dropped": 0}
    total = await banco.scalar(
        select(func.count())
        .select_from(AttendanceEmail)
        .where(AttendanceEmail.sent_at.is_not(None))
    )
    assert total == 2
