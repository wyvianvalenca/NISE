"""Salvar e continuar depois (#340, RF-F3.04, D-81, RN-37, RNF-G.03).

Runs on a real Postgres. Names and e-mails are fictional.
"""

from datetime import timedelta

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.actions.models import Action, Participation
from app.modules.answers.models import Answer
from app.modules.groups.models import Group
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

URL = "/api/actions/{}/attendance/marks"
PAGE = "/api/actions/{}/attendance"


async def _action_with_girls(
    banco: AsyncSession, total: int = 3
) -> tuple[User, Action, list[Participation]]:
    group, coordinator = await make_group(banco)
    action = await make_action(banco, group)
    registrations = [
        await register(banco, action, await make_girl(banco)) for _ in range(total)
    ]
    return coordinator, action, registrations


async def test_salva_as_marcacoes_e_elas_voltam_na_pagina(
    banco: AsyncSession, api: Api
) -> None:
    coordinator, action, (a, b, c) = await _action_with_girls(banco)
    client = api(coordinator)

    response = await client.put(
        URL.format(action.id), json={"present_ids": [a.id, c.id]}
    )

    assert response.status_code == 200
    body = response.json()
    assert body["saved_count"] == 2
    assert body["registered_count"] == 3
    # The action stays "Aguardando presença" (RN-37).
    assert body["status"] == "awaiting_attendance"
    saved = {girl["id"]: girl["saved_present"] for girl in body["girls"]}
    assert saved == {a.id: True, b.id: False, c.id: True}

    again = (await client.get(PAGE.format(action.id))).json()
    assert again["saved_count"] == 2


async def test_salvar_de_novo_substitui_inclusive_quem_foi_desmarcada(
    banco: AsyncSession, api: Api
) -> None:
    coordinator, action, (a, b, c) = await _action_with_girls(banco)
    client = api(coordinator)
    await client.put(URL.format(action.id), json={"present_ids": [a.id, b.id]})

    body = (
        await client.put(URL.format(action.id), json={"present_ids": [c.id]})
    ).json()

    saved = {girl["id"]: girl["saved_present"] for girl in body["girls"]}
    assert saved == {a.id: False, b.id: False, c.id: True}


async def test_salvar_vazio_desmarca_todas(banco: AsyncSession, api: Api) -> None:
    coordinator, action, (a, _, _) = await _action_with_girls(banco)
    client = api(coordinator)
    await client.put(URL.format(action.id), json={"present_ids": [a.id]})

    body = (await client.put(URL.format(action.id), json={"present_ids": []})).json()

    assert body["saved_count"] == 0


async def test_o_mesmo_id_duas_vezes_conta_uma(banco: AsyncSession, api: Api) -> None:
    coordinator, action, (a, _, _) = await _action_with_girls(banco)

    body = (
        await api(coordinator).put(
            URL.format(action.id), json={"present_ids": [a.id, a.id]}
        )
    ).json()

    assert body["saved_count"] == 1


async def test_salvar_nao_e_presenca_nem_conclui(banco: AsyncSession, api: Api) -> None:
    coordinator, action, (a, b, _) = await _action_with_girls(banco)

    await api(coordinator).put(
        URL.format(action.id), json={"present_ids": [a.id, b.id]}
    )

    await banco.refresh(action)
    assert action.attendance_registered_at is None
    # Nobody has attendance, so nobody can rate the action (#58) and no number
    # of present girls counts them (D-81).
    attended = await banco.scalar(
        select(func.count())
        .select_from(Participation)
        .where(
            Participation.action_id == action.id,
            Participation.attended_at.is_not(None),
        )
    )
    assert attended == 0
    assert await banco.scalar(select(func.count()).select_from(Answer)) == 0


async def test_nao_mexe_nas_marcacoes_de_outra_acao(
    banco: AsyncSession, api: Api
) -> None:
    coordinator, action, (a, _, _) = await _action_with_girls(banco)
    group = await banco.get(Group, action.group_id)
    assert group is not None
    other = await make_action(banco, group, name="Outra")
    other_registration = await register(banco, other, await make_girl(banco))
    other_registration.saved_present = True
    await banco.commit()

    await api(coordinator).put(URL.format(action.id), json={"present_ids": [a.id]})

    await banco.refresh(other_registration)
    assert other_registration.saved_present is True


async def test_id_de_outra_acao_e_recusado(banco: AsyncSession, api: Api) -> None:
    coordinator, action, (a, _, _) = await _action_with_girls(banco)
    _, _, (foreign, *_) = await _action_with_girls(banco, total=1)

    response = await api(coordinator).put(
        URL.format(action.id), json={"present_ids": [a.id, foreign.id]}
    )

    assert response.status_code == 422
    assert response.json() == {"error": "unknown_registration"}
    await banco.refresh(a)
    assert a.saved_present is False


async def test_antes_do_dia_o_servidor_recusa(banco: AsyncSession, api: Api) -> None:
    coordinator, action, (a, _, _) = await _action_with_girls(banco)

    response = await api(coordinator, today=EVENT_DAY - timedelta(days=1)).put(
        URL.format(action.id), json={"present_ids": [a.id]}
    )

    assert response.status_code == 409
    assert response.json() == {"error": "too_early"}
    await banco.refresh(a)
    assert a.saved_present is False


async def test_depois_de_concluida_o_servidor_recusa(
    banco: AsyncSession, api: Api
) -> None:
    coordinator, action, (a, _, _) = await _action_with_girls(banco)
    action.attendance_registered_at = at(EVENT_DAY)
    await banco.commit()

    response = await api(coordinator).put(
        URL.format(action.id), json={"present_ids": [a.id]}
    )

    assert response.status_code == 409
    assert response.json() == {"error": "already_concluded"}


async def test_coordenadora_de_outro_grupo_leva_404(
    banco: AsyncSession, api: Api
) -> None:
    _, action, (a, _, _) = await _action_with_girls(banco)
    _, other_coordinator = await make_group(banco)

    response = await api(other_coordinator).put(
        URL.format(action.id), json={"present_ids": [a.id]}
    )

    assert response.status_code == 404
    await banco.refresh(a)
    assert a.saved_present is False


@pytest.mark.parametrize("body", [{}, {"present_ids": "1"}, {"present_ids": [None]}])
async def test_corpo_invalido_leva_422(
    banco: AsyncSession, api: Api, body: dict[str, object]
) -> None:
    coordinator, action, _ = await _action_with_girls(banco, total=1)

    response = await api(coordinator).put(URL.format(action.id), json=body)

    assert response.status_code == 422
