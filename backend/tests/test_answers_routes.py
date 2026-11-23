from datetime import date
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi.testclient import TestClient
from httpx2 import Response
from sqlalchemy.exc import IntegrityError

from app.auth.utils import create_access_token
from app.main import app
from app.modules.answers.models import Answer, AnswerStage
from app.modules.answers.service import get_pending_rating, record_rating
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


# --- POST /api/ratings -------------------------------------------------------


def sessao_do_envio(
    usuaria: User,
    menina: int | None = 3,
    avaliacao_existente: int | None = None,
    aceite: int | None = 10,
) -> AsyncMock:
    # session.scalar responde, em ordem: o aceite dos termos (o id dele, ou
    # None), a menina com presença na ação (o id do registro dela, ou None) e a
    # avaliação que ela já fez dessa ação (o id, ou None).
    sessao_falsa = sessao_com(usuaria)
    sessao_falsa.scalar.side_effect = [aceite, menina, avaliacao_existente]
    # session.add é síncrono: com AsyncMock, viraria uma corrotina nunca aguardada.
    sessao_falsa.add = MagicMock()
    return sessao_falsa


async def enviar(sessao_falsa: AsyncMock, corpo: dict[str, object]) -> Response:
    return await chamar_rota(
        app,
        "POST",
        "/api/ratings",
        sessao_falsa,
        token=create_access_token(1),
        corpo=corpo,
    )


async def test_avaliacao_sem_comentario_e_gravada() -> None:
    # Alana dá nota 4 e não escreve nada (RF-F4.03a).
    sessao_falsa = sessao_do_envio(alana())

    response = await enviar(sessao_falsa, {"actionId": 7, "score": 4})

    assert response.status_code == 204
    resposta = sessao_falsa.add.call_args.args[0]
    assert isinstance(resposta, Answer)
    # RF-F4.07: ligada à menina, à ação e à etapa "avaliação".
    assert resposta.girl_id == 3
    assert resposta.action_id == 7
    assert resposta.stage is AnswerStage.RATING
    assert resposta.score == 4
    assert resposta.comment is None
    sessao_falsa.commit.assert_awaited_once()


async def test_comentario_vai_junto_com_a_nota() -> None:
    sessao_falsa = sessao_do_envio(alana())

    response = await enviar(
        sessao_falsa,
        {"actionId": 7, "score": 5, "comment": "  Montar o robô foi o melhor.  "},
    )

    assert response.status_code == 204
    assert sessao_falsa.add.call_args.args[0].comment == "Montar o robô foi o melhor."


async def test_comentario_so_com_espacos_conta_como_nenhum() -> None:
    sessao_falsa = sessao_do_envio(alana())

    response = await enviar(sessao_falsa, {"actionId": 7, "score": 3, "comment": " "})

    assert response.status_code == 204
    assert sessao_falsa.add.call_args.args[0].comment is None


async def test_menina_sem_participacao_nao_avalia() -> None:
    # Ela não foi à ação, ou a presença dela não foi registrada.
    sessao_falsa = sessao_do_envio(alana(), menina=None)

    response = await enviar(sessao_falsa, {"actionId": 7, "score": 4})

    assert response.status_code == 404
    assert response.json() == {"error": "nothing_to_rate"}
    sessao_falsa.add.assert_not_called()
    sessao_falsa.commit.assert_not_awaited()


async def test_segunda_avaliacao_da_mesma_acao_e_recusada() -> None:
    sessao_falsa = sessao_do_envio(alana(), avaliacao_existente=20)

    response = await enviar(sessao_falsa, {"actionId": 7, "score": 2})

    assert response.status_code == 409
    assert response.json() == {"error": "already_rated"}
    sessao_falsa.add.assert_not_called()
    sessao_falsa.commit.assert_not_awaited()


async def test_avaliacao_enviada_duas_vezes_ao_mesmo_tempo_e_recusada() -> None:
    # Os dois envios passam pela checagem; o banco recusa o segundo.
    sessao_falsa = sessao_do_envio(alana())
    sessao_falsa.commit.side_effect = IntegrityError("INSERT", {}, Exception())

    response = await enviar(sessao_falsa, {"actionId": 7, "score": 4})

    assert response.status_code == 409
    assert response.json() == {"error": "already_rated"}
    sessao_falsa.rollback.assert_awaited_once()


async def test_avaliacao_procura_a_presenca_da_menina_da_sessao() -> None:
    sessao_falsa = AsyncMock()
    sessao_falsa.scalar.return_value = None

    await record_rating(sessao_falsa, 1, 7, 4, None)

    consulta = sessao_falsa.scalar.call_args.args[0]
    sql = str(consulta.compile(compile_kwargs={"literal_binds": True}))
    assert "girls.user_id = 1" in sql
    assert "participations.action_id = 7" in sql
    assert "participations.attended_at IS NOT NULL" in sql


@pytest.mark.parametrize(
    "corpo",
    [
        {"actionId": 7},
        {"actionId": 7, "score": 0},
        {"actionId": 7, "score": 6},
        {"actionId": 7, "score": "4"},
        {"actionId": 7, "score": 4.5},
        {"score": 4},
        {"actionId": 7, "score": 4, "comment": "a" * 501},
    ],
)
async def test_avaliacao_invalida_e_recusada_sem_gravar(
    corpo: dict[str, object],
) -> None:
    sessao_falsa = sessao_do_envio(alana())

    response = await enviar(sessao_falsa, corpo)

    assert response.status_code == 422
    sessao_falsa.add.assert_not_called()


async def test_avaliacao_sem_sessao_responde_401() -> None:
    sessao_falsa = sessao_do_envio(alana())

    response = await chamar_rota(
        app, "POST", "/api/ratings", sessao_falsa, corpo={"actionId": 7, "score": 4}
    )

    assert response.status_code == 401
    sessao_falsa.add.assert_not_called()


async def test_avaliacao_e_so_para_menina() -> None:
    sessao_falsa = sessao_do_envio(alana(role=Role.COORDINATOR))

    response = await enviar(sessao_falsa, {"actionId": 7, "score": 4})

    assert response.status_code == 403
    sessao_falsa.add.assert_not_called()


async def test_avaliacao_exige_o_aceite_dos_termos() -> None:
    sessao_falsa = sessao_do_envio(alana(), aceite=None)

    response = await enviar(sessao_falsa, {"actionId": 7, "score": 4})

    assert response.status_code == 403
    assert response.json() == {"error": "terms_not_accepted"}
    sessao_falsa.add.assert_not_called()
