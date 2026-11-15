from datetime import date
from unittest.mock import AsyncMock, MagicMock

from fastapi.testclient import TestClient

from app.auth.utils import create_access_token
from app.main import app
from app.modules.answers.service import get_pending_rating
from app.users.models import Role, User
from tests.helpers import chamar_rota, sessao_com

# Dados fictícios.

# O que a consulta da ação para avaliar devolve: id, nome da ação, grupo, data
# e cidade.
ROBOTICA = (7, "Introdução à robótica", "Rendeiras do Código", date(2026, 10, 11))


def alana(role: Role = Role.GIRL) -> User:
    return User(id=1, email="alana@exemplo.com", name="Alana Ficticia", role=role)


def sessao_da_avaliacao(
    usuaria: User,
    acao: tuple[object, ...] | None,
    aceite: int | None = 10,
) -> AsyncMock:
    # session.scalar procura o aceite dos termos (o id dele, ou None; por
    # padrão ela já aceitou). session.execute(...).first() devolve a ação para
    # avaliar, ou None.
    sessao_falsa = sessao_com(usuaria)
    sessao_falsa.scalar.return_value = aceite
    resultado = MagicMock()
    resultado.first.return_value = acao
    sessao_falsa.execute.return_value = resultado
    return sessao_falsa


# --- GET /api/ratings/pending ------------------------------------------------


async def test_menina_com_presenca_recebe_a_acao_para_avaliar() -> None:
    # M1: grupo, ação, data e cidade, para a A03 (#58).
    response = await chamar_rota(
        app,
        "GET",
        "/api/ratings/pending",
        sessao_da_avaliacao(alana(), (*ROBOTICA, "Maceió")),
        token=create_access_token(1),
    )

    assert response.status_code == 200
    assert response.json() == {
        "actionId": 7,
        "actionName": "Introdução à robótica",
        "groupName": "Rendeiras do Código",
        "startsOn": "2026-10-11",
        "cityName": "Maceió",
    }


async def test_acao_online_vem_sem_cidade() -> None:
    response = await chamar_rota(
        app,
        "GET",
        "/api/ratings/pending",
        sessao_da_avaliacao(alana(), (*ROBOTICA, None)),
        token=create_access_token(1),
    )

    assert response.status_code == 200
    assert response.json()["cityName"] is None


async def test_menina_sem_participacao_nao_tem_o_que_avaliar() -> None:
    # M2: ela chegou sozinha, e o front pula a A03.
    response = await chamar_rota(
        app,
        "GET",
        "/api/ratings/pending",
        sessao_da_avaliacao(alana(), None),
        token=create_access_token(1),
    )

    assert response.status_code == 200
    assert response.json() is None


async def test_acao_para_avaliar_sem_sessao_responde_401() -> None:
    response = await chamar_rota(
        app, "GET", "/api/ratings/pending", sessao_da_avaliacao(alana(), None)
    )

    assert response.status_code == 401


async def test_acao_para_avaliar_e_so_para_menina() -> None:
    sessao_falsa = sessao_da_avaliacao(alana(role=Role.COORDINATOR), ROBOTICA)

    response = await chamar_rota(
        app,
        "GET",
        "/api/ratings/pending",
        sessao_falsa,
        token=create_access_token(1),
    )

    assert response.status_code == 403
    sessao_falsa.execute.assert_not_called()


async def test_acao_para_avaliar_exige_o_aceite_dos_termos() -> None:
    sessao_falsa = sessao_da_avaliacao(alana(), ROBOTICA, aceite=None)

    response = await chamar_rota(
        app,
        "GET",
        "/api/ratings/pending",
        sessao_falsa,
        token=create_access_token(1),
    )

    assert response.status_code == 403
    assert response.json() == {"error": "terms_not_accepted"}
    sessao_falsa.execute.assert_not_called()


async def test_acao_para_avaliar_e_procurada_entre_as_presencas_da_menina() -> None:
    # Só participação da menina da sessão, com presença e sem avaliação.
    sessao_falsa = AsyncMock()
    sessao_falsa.execute.return_value = MagicMock(first=MagicMock(return_value=None))

    await get_pending_rating(sessao_falsa, 1)

    consulta = sessao_falsa.execute.call_args.args[0]
    sql = str(consulta.compile(compile_kwargs={"literal_binds": True}))
    assert "girls.user_id = 1" in sql
    assert "participations.attended_at IS NOT NULL" in sql
    assert "NOT (EXISTS" in sql
    assert "answers.stage = 'RATING'" in sql
    assert "ORDER BY actions.starts_on DESC" in sql


def test_openapi_mostra_a_acao_para_avaliar_em_camel_case(client: TestClient) -> None:
    schemas = client.get("/openapi.json").json()["components"]["schemas"]

    assert list(schemas["PendingRatingOut"]["properties"]) == [
        "actionId",
        "actionName",
        "groupName",
        "startsOn",
        "cityName",
    ]
