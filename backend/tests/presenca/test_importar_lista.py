"""Importar lista de presença (#349, RF-F3.02, RN-27, RF-F3.04, RN-37, RNF-G.03).

The route only answers who the list marks: it saves nothing. Runs on a real
Postgres. Names and e-mails are fictional.
"""

import logging
from datetime import timedelta

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.actions.models import Action, Participation
from app.modules.attendance.models import AttendanceEmail
from app.modules.girls.models import Girl
from app.users.models import User
from tests.presenca.dados import (
    EVENT_DAY,
    Api,
    CorreioFalso,
    at,
    make_action,
    make_girl,
    make_group,
    register,
)

URL = "/api/actions/{}/attendance/import"
PAGE = "/api/actions/{}/attendance"


async def _action_with_girls(
    banco: AsyncSession, total: int = 3
) -> tuple[User, Action, list[Participation], list[Girl]]:
    group, coordinator = await make_group(banco)
    action = await make_action(banco, group)
    girls = [await make_girl(banco) for _ in range(total)]
    registrations = [await register(banco, action, girl) for girl in girls]
    return coordinator, action, registrations, girls


async def _count(banco: AsyncSession, model: type) -> int:
    return await banco.scalar(select(func.count()).select_from(model)) or 0


async def test_acha_as_inscritas_pelo_email(banco: AsyncSession, api: Api) -> None:
    coordinator, action, (a, _, c), (girl_a, _, girl_c) = await _action_with_girls(
        banco
    )

    response = await api(coordinator).post(
        URL.format(action.id), json={"emails": [girl_a.email, girl_c.email]}
    )

    assert response.status_code == 200
    assert response.json() == {
        "present_ids": sorted([a.id, c.id]),
        "line_count": 2,
        "not_found_count": 0,
    }


async def test_ignora_maiusculas_e_espacos_em_volta(
    banco: AsyncSession, api: Api
) -> None:
    coordinator, action, (a, b, _), (girl_a, girl_b, _) = await _action_with_girls(
        banco
    )

    response = await api(coordinator).post(
        URL.format(action.id),
        json={"emails": [f"  {girl_a.email.upper()} ", f"\t{girl_b.email.title()}\n"]},
    )

    body = response.json()
    assert body["present_ids"] == sorted([a.id, b.id])
    assert body["not_found_count"] == 0


async def test_linha_que_nao_e_inscrita_so_e_contada(
    banco: AsyncSession, api: Api
) -> None:
    coordinator, action, (a, _, _), (girl_a, _, _) = await _action_with_girls(banco)
    stranger = await make_girl(banco)  # has a record, but is not in this action
    girls_before = await _count(banco, Girl)
    registrations_before = await _count(banco, Participation)

    response = await api(coordinator).post(
        URL.format(action.id),
        json={
            "emails": [
                girl_a.email,
                stranger.email,
                "ninguem@exemplo.com",
                "",
                "isso nao e e-mail",
            ]
        },
    )

    body = response.json()
    assert body["present_ids"] == [a.id]
    assert body["line_count"] == 5
    assert body["not_found_count"] == 4
    # Nobody was created: no girl, no registration, no account.
    assert await _count(banco, Girl) == girls_before
    assert await _count(banco, Participation) == registrations_before
    # The answer does not tell which lines were not found.
    assert "ninguem@exemplo.com" not in response.text
    assert stranger.email not in response.text


async def test_mesma_menina_duas_vezes_conta_uma_so(
    banco: AsyncSession, api: Api
) -> None:
    coordinator, action, (a, _, _), (girl_a, _, _) = await _action_with_girls(banco)

    body = (
        await api(coordinator).post(
            URL.format(action.id),
            json={"emails": [girl_a.email, f" {girl_a.email.upper()}"]},
        )
    ).json()

    assert body["present_ids"] == [a.id]
    assert body["not_found_count"] == 0


async def test_nao_grava_nada_nem_envia_mensagem(
    banco: AsyncSession, api: Api, correio: CorreioFalso
) -> None:
    coordinator, action, (a, _, _), (girl_a, _, _) = await _action_with_girls(banco)
    # Someone already marked by hand stays marked, and nobody is unmarked.
    a.saved_present = True
    await banco.commit()
    client = api(coordinator)

    await client.post(URL.format(action.id), json={"emails": [girl_a.email]})

    page = (await client.get(PAGE.format(action.id))).json()
    assert page["saved_count"] == 1
    assert page["present_count"] == 0
    assert page["status"] == "awaiting_attendance"
    assert await _count(banco, AttendanceEmail) == 0
    assert correio.sent == []


@pytest.mark.parametrize("emails", [[], [""], ["  ", ""]])
async def test_lista_vazia_diz_o_que_esta_errado(
    banco: AsyncSession, api: Api, emails: list[str]
) -> None:
    # Sem linha, ou só com a coluna de e-mail em branco: arquivo vazio.
    coordinator, action, _, _ = await _action_with_girls(banco)

    response = await api(coordinator).post(
        URL.format(action.id), json={"emails": emails}
    )

    assert response.status_code == 422
    assert response.json() == {"error": "empty_file"}


@pytest.mark.parametrize("body", [{}, {"emails": "a@b.com"}, {"emails": [1]}, None])
async def test_corpo_invalido_leva_422(
    banco: AsyncSession, api: Api, body: object
) -> None:
    coordinator, action, _, _ = await _action_with_girls(banco)

    response = await api(coordinator).post(URL.format(action.id), json=body)

    assert response.status_code == 422


async def test_lista_grande_demais_leva_422(banco: AsyncSession, api: Api) -> None:
    coordinator, action, _, _ = await _action_with_girls(banco)

    response = await api(coordinator).post(
        URL.format(action.id), json={"emails": ["a@exemplo.com"] * 2001}
    )

    assert response.status_code == 422


async def test_antes_do_dia_do_evento_e_recusado(banco: AsyncSession, api: Api) -> None:
    coordinator, action, _, (girl_a, _, _) = await _action_with_girls(banco)

    response = await api(coordinator, today=EVENT_DAY - timedelta(days=1)).post(
        URL.format(action.id), json={"emails": [girl_a.email]}
    )

    assert response.status_code == 409
    assert response.json() == {"error": "too_early"}


async def test_depois_de_concluir_e_recusado(banco: AsyncSession, api: Api) -> None:
    coordinator, action, _, (girl_a, _, _) = await _action_with_girls(banco)
    action.attendance_registered_at = at(EVENT_DAY)
    await banco.commit()

    response = await api(coordinator).post(
        URL.format(action.id), json={"emails": [girl_a.email]}
    )

    assert response.status_code == 409
    assert response.json() == {"error": "already_concluded"}


async def test_coordenadora_de_outro_grupo_leva_404(
    banco: AsyncSession, api: Api
) -> None:
    _, action, _, (girl_a, _, _) = await _action_with_girls(banco)
    _, other_coordinator = await make_group(banco)

    response = await api(other_coordinator).post(
        URL.format(action.id), json={"emails": [girl_a.email]}
    )

    assert response.status_code == 404


async def test_outro_grupo_leva_404_mesmo_antes_do_dia(
    banco: AsyncSession, api: Api
) -> None:
    # The group is checked before the day: another group learns nothing about it.
    _, action, _, (girl_a, _, _) = await _action_with_girls(banco)
    _, other_coordinator = await make_group(banco)

    response = await api(other_coordinator, today=EVENT_DAY - timedelta(days=3)).post(
        URL.format(action.id), json={"emails": [girl_a.email]}
    )

    assert response.status_code == 404


async def test_so_coordenadora_importa(banco: AsyncSession, api: Api) -> None:
    _, action, _, (girl_a, _, _) = await _action_with_girls(banco)

    response = await api(None).post(
        URL.format(action.id), json={"emails": [girl_a.email]}
    )

    assert response.status_code == 401


async def test_nada_vai_para_os_logs(
    banco: AsyncSession, api: Api, caplog: pytest.LogCaptureFixture
) -> None:
    coordinator, action, _, (girl_a, _, _) = await _action_with_girls(banco)

    with caplog.at_level(logging.DEBUG):
        await api(coordinator).post(
            URL.format(action.id),
            json={"emails": [girl_a.email, "ninguem@exemplo.com"]},
        )
        await api(coordinator).post(
            URL.format(action.id), json={"emails": [girl_a.email, 5]}
        )

    assert girl_a.email not in caplog.text
    assert girl_a.name not in caplog.text
    assert "ninguem@exemplo.com" not in caplog.text
