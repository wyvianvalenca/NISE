"""Veio sem inscrição? Adicionar participante (#346, RF-F3.03, RN-27, RN-29).

Runs on a real Postgres. Names and e-mails are fictional.
"""

import logging
from datetime import timedelta

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.actions.models import Participation
from app.modules.girls.models import Girl, StudyStage
from app.users.models import User
from tests.presenca.dados import (
    EVENT_DAY,
    Api,
    at,
    make_action,
    make_girl,
    make_group,
    register,
)

URL = "/api/actions/{}/attendance/girls"
PAGE = "/api/actions/{}/attendance"


async def _count(banco: AsyncSession, model: type) -> int:
    return await banco.scalar(select(func.count()).select_from(model)) or 0


async def test_cria_o_registro_e_inscreve_na_acao(
    banco: AsyncSession, api: Api
) -> None:
    group, coordinator = await make_group(banco)
    action = await make_action(banco, group)
    users_before = await _count(banco, User)

    response = await api(coordinator).post(
        URL.format(action.id),
        json={
            "name": "  Larissa Fictícia ",
            "email": " Larissa.Ficticia@Exemplo.COM ",
            "study_stage": "medio",
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["already_registered"] is False
    assert body["girl"]["name"] == "Larissa Fictícia"
    assert body["girl"]["email"] == "larissa.ficticia@exemplo.com"
    assert body["girl"]["study_stage"] == "medio"
    # Registered, but not marked by the server: the page marks her.
    assert body["girl"]["saved_present"] is False
    girl = await banco.scalar(
        select(Girl).where(Girl.email == "larissa.ficticia@exemplo.com")
    )
    assert girl is not None and girl.user_id is None
    # No account is created (RN-27).
    assert await _count(banco, User) == users_before

    page = (await api(coordinator).get(PAGE.format(action.id))).json()
    assert page["registered_count"] == 1
    assert page["girls"][0]["id"] == body["girl"]["id"]


async def test_o_mesmo_email_na_acao_nao_duplica(banco: AsyncSession, api: Api) -> None:
    group, coordinator = await make_group(banco)
    action = await make_action(banco, group)
    girl = await make_girl(banco, name="Clara Fictícia")
    registration = await register(banco, action, girl)

    response = await api(coordinator).post(
        URL.format(action.id),
        json={"name": "Outro Nome", "email": girl.email.upper()},
    )

    body = response.json()
    assert body["already_registered"] is True
    assert body["girl"]["id"] == registration.id
    assert await _count(banco, Participation) == 1


async def test_quem_ja_tem_conta_continua_com_um_registro_so(
    banco: AsyncSession, api: Api
) -> None:
    # RN-29: linked to her record by the e-mail; nothing of it is changed.
    group, coordinator = await make_group(banco)
    action = await make_action(banco, group)
    girl = await make_girl(
        banco, name="Nome Dela", with_account=True, study_stage=StudyStage.GRADUACAO
    )
    girls_before = await _count(banco, Girl)

    body = (
        await api(coordinator).post(
            URL.format(action.id),
            json={"name": "Nome Digitado", "email": girl.email, "study_stage": "medio"},
        )
    ).json()

    assert body["already_registered"] is False
    assert await _count(banco, Girl) == girls_before
    await banco.refresh(girl)
    assert girl.name == "Nome Dela"
    assert girl.study_stage is StudyStage.GRADUACAO


async def test_menina_de_outro_grupo_e_ligada_sem_novo_registro(
    banco: AsyncSession, api: Api
) -> None:
    other_group, _ = await make_group(banco)
    other_action = await make_action(banco, other_group)
    girl = await make_girl(banco)
    await register(banco, other_action, girl)
    group, coordinator = await make_group(banco)
    action = await make_action(banco, group)

    await api(coordinator).post(
        URL.format(action.id), json={"name": "Menina", "email": girl.email}
    )

    assert await _count(banco, Girl) == 1
    assert await _count(banco, Participation) == 2


async def test_funciona_com_as_inscricoes_fechadas(
    banco: AsyncSession, api: Api
) -> None:
    group, coordinator = await make_group(banco)
    action = await make_action(banco, group, registrations_open=False)

    response = await api(coordinator).post(
        URL.format(action.id), json={"name": "Menina", "email": "m@exemplo.com"}
    )

    assert response.status_code == 200


async def test_dois_toques_seguidos_nao_duplicam(banco: AsyncSession, api: Api) -> None:
    group, coordinator = await make_group(banco)
    action = await make_action(banco, group)
    client = api(coordinator)
    body = {"name": "Menina", "email": "dupla@exemplo.com"}

    # Two taps at the same time, on two connections, are in test_concorrencia.py.
    first = await client.post(URL.format(action.id), json=body)
    second = await client.post(URL.format(action.id), json=body)

    assert {first.status_code, second.status_code} == {200}
    assert second.json()["already_registered"] is True
    assert await _count(banco, Girl) == 1
    assert await _count(banco, Participation) == 1


@pytest.mark.parametrize(
    "body",
    [
        {"email": "m@exemplo.com"},
        {"name": "   ", "email": "m@exemplo.com"},
        {"name": "Menina"},
        {"name": "Menina", "email": "sem-arroba"},
        {"name": "Menina", "email": "m@exemplo.com", "study_stage": "primario"},
        {"name": "x" * 201, "email": "m@exemplo.com"},
    ],
)
async def test_campos_invalidos_nao_salvam_nada(
    banco: AsyncSession, api: Api, body: dict[str, object]
) -> None:
    group, coordinator = await make_group(banco)
    action = await make_action(banco, group)

    response = await api(coordinator).post(URL.format(action.id), json=body)

    assert response.status_code == 422
    assert await _count(banco, Girl) == 0


async def test_antes_do_dia_e_recusado(banco: AsyncSession, api: Api) -> None:
    group, coordinator = await make_group(banco)
    action = await make_action(banco, group)

    response = await api(coordinator, today=EVENT_DAY - timedelta(days=1)).post(
        URL.format(action.id), json={"name": "Menina", "email": "m@exemplo.com"}
    )

    assert response.status_code == 409
    assert response.json() == {"error": "too_early"}
    assert await _count(banco, Girl) == 0


async def test_de_outro_grupo_leva_404_e_nao_salva(
    banco: AsyncSession, api: Api
) -> None:
    group, _ = await make_group(banco)
    _, other_coordinator = await make_group(banco)
    action = await make_action(banco, group)

    response = await api(other_coordinator).post(
        URL.format(action.id), json={"name": "Menina", "email": "m@exemplo.com"}
    )

    assert response.status_code == 404
    assert await _count(banco, Girl) == 0


async def test_nada_da_menina_vai_para_os_logs(
    banco: AsyncSession, api: Api, caplog: pytest.LogCaptureFixture
) -> None:
    group, coordinator = await make_group(banco)
    action = await make_action(banco, group)

    with caplog.at_level(logging.DEBUG):
        await api(coordinator).post(
            URL.format(action.id),
            json={"name": "Nome Secreto", "email": "secreto@exemplo.com"},
        )

    assert "secreto@exemplo.com" not in caplog.text
    assert "Nome Secreto" not in caplog.text


async def test_concluida_ainda_nao_aceita_neste_passo(
    banco: AsyncSession, api: Api
) -> None:
    group, coordinator = await make_group(banco)
    action = await make_action(banco, group, attendance_registered_at=at(EVENT_DAY))

    response = await api(coordinator).post(
        URL.format(action.id), json={"name": "Menina", "email": "m@exemplo.com"}
    )

    assert response.status_code == 409
    assert response.json() == {"error": "already_concluded"}
