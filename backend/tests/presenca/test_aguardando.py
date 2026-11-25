"""K11 "Aguardando presença" (#338, RF-F3.08, RN-37, RN-15, RNF-G.03).

Runs on a real Postgres (tests/presenca/conftest.py). Names and e-mails are
fictional.
"""

import logging
from datetime import UTC, datetime, time, timedelta

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.actions.models import ActionFormat, ActionVisibility
from app.modules.cities.models import City
from app.modules.girls.models import StudyStage
from app.users.models import Role
from tests.presenca.dados import (
    EVENT_DAY,
    Api,
    at,
    make_action,
    make_girl,
    make_group,
    make_user,
    register,
)

URL = "/api/actions/{}/attendance"


async def test_no_dia_do_evento_a_acao_aguarda_a_presenca(
    banco: AsyncSession, api: Api
) -> None:
    group, coordinator = await make_group(banco)
    action = await make_action(banco, group)
    await register(banco, action, await make_girl(banco))

    response = await api(coordinator, today=EVENT_DAY).get(URL.format(action.id))

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "awaiting_attendance"
    assert body["today"] == "2026-10-24"
    assert body["registered_count"] == 1
    # Deleting is still possible: the attendance was not concluded (RN-15).
    assert body["can_delete"] is True


async def test_na_vespera_ela_ainda_aguarda_o_evento(
    banco: AsyncSession, api: Api
) -> None:
    group, coordinator = await make_group(banco)
    action = await make_action(banco, group)
    await register(banco, action, await make_girl(banco))

    response = await api(coordinator, today=EVENT_DAY - timedelta(days=1)).get(
        URL.format(action.id)
    )

    assert response.json()["status"] == "awaiting_event"
    assert response.json()["registrations_open"] is True


async def test_sem_inscritas_no_dia_tambem_aguarda_a_presenca(
    banco: AsyncSession, api: Api
) -> None:
    group, coordinator = await make_group(banco)
    action = await make_action(banco, group)

    body = (await api(coordinator).get(URL.format(action.id))).json()

    assert body["status"] == "awaiting_attendance"
    assert body["registered_count"] == 0
    assert body["girls"] == []
    assert body["last_registered_on"] is None


async def test_acao_de_varios_dias_aguarda_desde_o_primeiro(
    banco: AsyncSession, api: Api
) -> None:
    # Open question 1 of #338: for now, from the first day.
    group, coordinator = await make_group(banco)
    action = await make_action(banco, group, ends_on=EVENT_DAY + timedelta(days=2))

    body = (await api(coordinator, today=EVENT_DAY).get(URL.format(action.id))).json()

    assert body["status"] == "awaiting_attendance"


async def test_as_inscricoes_fecham_sozinhas_no_dia(
    banco: AsyncSession, api: Api
) -> None:
    group, coordinator = await make_group(banco)
    action = await make_action(banco, group)
    assert action.registrations_open is True

    body = (await api(coordinator).get(URL.format(action.id))).json()

    assert body["registrations_open"] is False


async def test_mostra_o_cabecalho_e_os_passos(banco: AsyncSession, api: Api) -> None:
    group, coordinator = await make_group(banco)
    banco.add(City(id=9_999_001, name="Maceió", state="AL", search_name="maceio, al"))
    await banco.commit()
    action = await make_action(
        banco,
        group,
        format=ActionFormat.IN_PERSON,
        city_ibge_code=9_999_001,
        visibility=ActionVisibility.OPEN,
        registration_url="https://exemplo.com/formulario",
        starts_at_time=time(14),
        ends_at_time=time(17),
    )
    action.created_at = at(EVENT_DAY - timedelta(days=8))
    first = await register(banco, action, await make_girl(banco))
    first.created_at = at(EVENT_DAY - timedelta(days=9))
    last = await register(banco, action, await make_girl(banco))
    # 01:00 UTC on the 17th is still the 16th in Maceió.
    last.created_at = datetime(2026, 10, 17, 1, tzinfo=UTC)
    await banco.commit()

    body = (await api(coordinator).get(URL.format(action.id))).json()

    assert body["action"] == {
        "id": action.id,
        "name": "Introdução à robótica",
        "type": "oficina",
        "starts_on": "2026-10-24",
        "ends_on": "2026-10-24",
        "starts_at_time": "14:00:00",
        "ends_at_time": "17:00:00",
        "format": "in_person",
        "city_name": "Maceió",
        "visibility": "open",
        "created_on": "2026-10-16",
    }
    assert body["last_registered_on"] == "2026-10-16"


async def test_lista_as_inscritas_em_ordem_e_so_as_colunas_com_dado(
    banco: AsyncSession, api: Api
) -> None:
    group, coordinator = await make_group(banco)
    action = await make_action(banco, group)
    bia = await make_girl(banco, name="Beatriz Fictícia")
    ana = await make_girl(banco, name="Ana Fictícia")
    bia_registration = await register(banco, action, bia)
    await register(banco, action, ana)

    body = (await api(coordinator).get(URL.format(action.id))).json()

    assert [girl["name"] for girl in body["girls"]] == [
        "Ana Fictícia",
        "Beatriz Fictícia",
    ]
    assert body["girls"][0]["email"] == ana.email
    # Nobody has a study level: no column for it (RF-F1.14).
    assert body["columns"] == []

    # What the registration gave (C2, #232): the columns follow it, not the record.
    bia_registration.study_stage = StudyStage.MEDIO
    bia_registration.whatsapp = "82999990000"
    await banco.commit()
    body = (await api(coordinator).get(URL.format(action.id))).json()

    assert body["columns"] == ["whatsapp", "study_stage"]
    assert body["girls"][1]["study_stage"] == "medio"
    assert body["girls"][1]["whatsapp"] == "82999990000"
    assert body["girls"][0]["study_stage"] is None
    assert body["girls"][0]["school_year"] is None


async def test_mostra_o_nome_e_a_serie_que_a_inscricao_deu(
    banco: AsyncSession, api: Api
) -> None:
    # C2 (#232): the registration may give another name than the record, which
    # may have been typed by another group (RN-01). The list shows the former,
    # and orders by it.
    group, coordinator = await make_group(banco)
    action = await make_action(banco, group)
    zeca = await make_girl(banco, name="Zuleica Registro")
    ana = await make_girl(banco, name="Ana Fictícia")
    registration = await register(banco, action, zeca)
    await register(banco, action, ana)
    registration.name = "Bianca Digitada"
    registration.school_year = "2º ano"
    await banco.commit()

    body = (await api(coordinator).get(URL.format(action.id))).json()

    assert [girl["name"] for girl in body["girls"]] == [
        "Ana Fictícia",
        "Bianca Digitada",
    ]
    assert body["columns"] == ["school_year"]
    assert body["girls"][1]["school_year"] == "2º ano"


async def test_nao_mostra_inscritas_de_outra_acao(
    banco: AsyncSession, api: Api
) -> None:
    group, coordinator = await make_group(banco)
    action = await make_action(banco, group)
    other = await make_action(banco, group, name="Outra")
    await register(banco, other, await make_girl(banco))

    body = (await api(coordinator).get(URL.format(action.id))).json()

    assert body["girls"] == []


async def test_concluida_nao_pode_mais_ser_excluida(
    banco: AsyncSession, api: Api
) -> None:
    group, coordinator = await make_group(banco)
    action = await make_action(banco, group, attendance_registered_at=at(EVENT_DAY))

    body = (await api(coordinator).get(URL.format(action.id))).json()

    assert body["status"] == "concluded"
    assert body["can_delete"] is False


# --- Permissions (RNF-G.03) ---------------------------------------------------


async def test_acao_de_outro_grupo_responde_404(banco: AsyncSession, api: Api) -> None:
    group, _ = await make_group(banco)
    _, other_coordinator = await make_group(banco)
    action = await make_action(banco, group)

    response = await api(other_coordinator).get(URL.format(action.id))

    assert response.status_code == 404


async def test_acao_que_nao_existe_responde_404(banco: AsyncSession, api: Api) -> None:
    _, coordinator = await make_group(banco)

    response = await api(coordinator).get(URL.format(999_999))

    assert response.status_code == 404


@pytest.mark.parametrize("role", [Role.GIRL, Role.NISE_TEAM])
async def test_quem_nao_e_coordenadora_leva_403(
    banco: AsyncSession, api: Api, role: Role
) -> None:
    group, _ = await make_group(banco)
    action = await make_action(banco, group)
    user = await make_user(banco, role)

    response = await api(user).get(URL.format(action.id))

    assert response.status_code == 403


async def test_sem_sessao_leva_401(banco: AsyncSession, api: Api) -> None:
    group, _ = await make_group(banco)
    action = await make_action(banco, group)

    response = await api(None).get(URL.format(action.id))

    assert response.status_code == 401


async def test_nenhum_dado_da_menina_vai_para_os_logs(
    banco: AsyncSession, api: Api, caplog: pytest.LogCaptureFixture
) -> None:
    group, coordinator = await make_group(banco)
    action = await make_action(banco, group)
    girl = await make_girl(banco, name="Nome Que Não Pode Vazar")
    await register(banco, action, girl)

    with caplog.at_level(logging.DEBUG):
        await api(coordinator).get(URL.format(action.id))

    assert girl.email not in caplog.text
    assert girl.name not in caplog.text
