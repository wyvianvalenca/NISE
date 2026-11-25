"""Eventos de que ela participou (A10, #391): GET /api/profile/events. Dados fictícios."""

import logging
from datetime import date
from unittest.mock import AsyncMock, MagicMock

import pytest
from httpx2 import Response

from app.auth.utils import create_access_token
from app.main import app
from app.users.models import Role, User
from tests.helpers import chamar_rota, sessao_com


def alana(id: int = 1, role: Role = Role.GIRL) -> User:
    return User(
        id=id,
        email="alana@exemplo.com",
        name="Alana Ficticia",
        role=role,
        password_hash="hash-ficticio",
    )


def sessao_dos_eventos(
    conta: User,
    linhas: list[tuple[str, date]] | None = None,
    menina: int | None = 11,
    aceite: int | None = 10,
) -> AsyncMock:
    # session.scalar responde em ordem: o aceite dos termos e o id da menina.
    # session.execute devolve as linhas (nome, dia) da consulta de eventos.
    sessao_falsa = sessao_com(conta)
    sessao_falsa.scalar.side_effect = [aceite, menina]
    resultado = MagicMock()
    resultado.all.return_value = linhas or []
    sessao_falsa.execute.return_value = resultado
    return sessao_falsa


def sql_de(consulta: object) -> str:
    return str(consulta.compile(compile_kwargs={"literal_binds": True}))  # type: ignore[attr-defined]


async def ler(
    sessao_falsa: AsyncMock, user_id: int = 1, url: str = "/api/profile/events"
) -> Response:
    return await chamar_rota(
        app, "GET", url, sessao_falsa, token=create_access_token(user_id)
    )


# --- E1: quem pode ler --------------------------------------------------------


async def test_sem_sessao_responde_401() -> None:
    response = await chamar_rota(
        app, "GET", "/api/profile/events", sessao_dos_eventos(alana())
    )

    assert response.status_code == 401


async def test_coordenadora_responde_403() -> None:
    # E1
    response = await ler(sessao_dos_eventos(alana(role=Role.COORDINATOR)))

    assert response.status_code == 403


async def test_sem_aceite_dos_termos_responde_403() -> None:
    # E1
    sessao_falsa = sessao_dos_eventos(alana(), aceite=None)

    response = await ler(sessao_falsa)

    assert response.status_code == 403
    assert response.json() == {"error": "terms_not_accepted"}
    sessao_falsa.execute.assert_not_called()


async def test_conta_que_nao_existe_mais_responde_401() -> None:
    response = await ler(sessao_com(None))

    assert response.status_code == 401


async def test_conta_sem_registro_de_menina_responde_404() -> None:
    # E1: o mesmo 404 de GET /api/profile/details.
    sessao_falsa = sessao_dos_eventos(alana(), menina=None)

    response = await ler(sessao_falsa)

    assert response.status_code == 404
    assert response.json() == {"error": "profile_not_found"}
    sessao_falsa.execute.assert_not_called()


# --- E2: só os dela, só com presença, de todos os grupos ------------------------


async def test_a_consulta_e_da_usuaria_da_sessao_e_so_de_quem_foi() -> None:
    # E1, E2: a sessão falsa ignora o WHERE, então o SQL é conferido aqui. A
    # menina 2 (girls.id 11) manda ids de outra pessoa pela URL: a rota ignora.
    sessao_falsa = sessao_dos_eventos(alana(id=2))

    response = await ler(
        sessao_falsa, user_id=2, url="/api/profile/events?user_id=1&girl_id=99"
    )

    assert response.status_code == 200
    sql = sql_de(sessao_falsa.execute.call_args.args[0])
    assert "participations.girl_id = 11" in sql
    assert "participations.girl_id = 99" not in sql
    assert "JOIN participations ON participations.action_id = actions.id" in sql
    assert "participations.attended_at IS NOT NULL" in sql
    # Sem filtro por grupo: vale a presença em ações de qualquer grupo.
    assert "group_id" not in sql
    # O 404 também olha a menina da sessão, não a da URL.
    achar_menina = sql_de(sessao_falsa.scalar.call_args_list[1].args[0])
    assert "girls.user_id = 2" in achar_menina
    assert "girls.user_id = 1" not in achar_menina


# --- E3: ordem e limite --------------------------------------------------------


async def test_ordem_pela_data_e_depois_pelo_id_e_no_maximo_5() -> None:
    sessao_falsa = sessao_dos_eventos(alana())

    await ler(sessao_falsa)

    sql = sql_de(sessao_falsa.execute.call_args.args[0])
    assert "ORDER BY actions.starts_on DESC, actions.id DESC" in sql
    assert "LIMIT 5" in sql


# --- E4: o que a resposta traz -------------------------------------------------


async def test_a_consulta_le_so_o_nome_da_acao_e_o_dia_em_que_comecou() -> None:
    # E4: a sessão falsa devolve as linhas prontas; só o SQL mostra de onde vêm.
    # Nome e e-mail da menina (girls.*, users.*) e attended_at ficam de fora.
    sessao_falsa = sessao_dos_eventos(alana())

    await ler(sessao_falsa)

    sql = sql_de(sessao_falsa.execute.call_args.args[0])
    colunas = sql.split("FROM")[0]
    assert colunas.split() == [
        "SELECT",
        "actions.name,",
        "actions.starts_on",
    ]


async def test_resposta_traz_so_nome_e_data_na_ordem_da_consulta() -> None:
    sessao_falsa = sessao_dos_eventos(
        alana(),
        linhas=[
            ("Oficina de Python", date(2026, 10, 11)),
            ("Roda de conversa", date(2026, 9, 2)),
        ],
    )

    response = await ler(sessao_falsa)

    assert response.status_code == 200
    assert response.json() == {
        "events": [
            {"name": "Oficina de Python", "date": "2026-10-11"},
            {"name": "Roda de conversa", "date": "2026-09-02"},
        ]
    }


async def test_sem_eventos_devolve_lista_vazia() -> None:
    response = await ler(sessao_dos_eventos(alana()))

    assert response.status_code == 200
    assert response.json() == {"events": []}


# --- E7: privacidade e o resto do perfil ---------------------------------------


async def test_nada_de_dado_pessoal_nos_logs_nem_na_resposta(
    caplog: pytest.LogCaptureFixture,
) -> None:
    caplog.set_level(logging.DEBUG)
    sessao_falsa = sessao_dos_eventos(
        alana(), linhas=[("Oficina de Python", date(2026, 10, 11))]
    )

    response = await ler(sessao_falsa)

    assert "alana@exemplo.com" not in response.text
    assert "Alana" not in response.text
    assert "alana@exemplo.com" not in caplog.text
    assert "Alana" not in caplog.text


async def test_openapi_traz_a_rota_e_as_outras_do_perfil_seguem() -> None:
    response = await chamar_rota(app, "GET", "/openapi.json", AsyncMock())

    caminhos = response.json()["paths"]
    assert set(caminhos["/api/profile/events"]) == {"get"}
    assert "/api/profile/details" in caminhos
    assert "/api/profile" in caminhos
    esquemas = response.json()["components"]["schemas"]
    assert set(esquemas["ProfileEventsOut"]["properties"]) == {"events"}
    assert set(esquemas["ProfileEventOut"]["properties"]) == {"name", "date"}
