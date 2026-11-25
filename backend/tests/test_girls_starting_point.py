"""A05a "Antes de começar" no cadastro (RF-F10.26, D-64, #303). Dados fictícios."""

from unittest.mock import AsyncMock

import pytest
from fastapi.testclient import TestClient
from httpx2 import Response

from app.auth.utils import create_access_token
from app.main import app
from app.modules.followup.models import ComputingView, FutureSelf
from app.modules.girls.models import Girl, StudyStage
from app.users.models import Role, User
from tests.helpers import chamar_rota, sessao_com

ROTA = "/api/profile/starting-point"


def alana(role: Role = Role.GIRL) -> User:
    return User(id=1, email="alana@exemplo.com", name="Alana Ficticia", role=role)


def registro_da_menina(
    visao: ComputingView | None = None,
    futuro: FutureSelf | None = None,
    etapa: StudyStage | None = None,
) -> Girl:
    return Girl(
        id=3,
        email="alana@exemplo.com",
        name="Alana Ficticia",
        user_id=1,
        signup_computing_view=visao,
        signup_future_self=futuro,
        study_stage=etapa,
    )


def sessao_do_perfil(
    usuaria: User, registro: Girl | None, aceite: int | None = 10
) -> AsyncMock:
    # session.get(User, id) acha a usuária da sessão. session.scalar responde,
    # em ordem: o aceite dos termos (o id dele, ou None) e o registro da menina.
    sessao_falsa = sessao_com(usuaria)
    sessao_falsa.scalar.side_effect = [aceite, registro]
    return sessao_falsa


# --- GET /api/profile/starting-point ------------------------------------------


async def abrir(sessao_falsa: AsyncMock) -> Response:
    return await chamar_rota(
        app, "GET", ROTA, sessao_falsa, token=create_access_token(1)
    )


async def test_tela_mostra_o_primeiro_nome_e_as_opcoes_do_questionario() -> None:
    response = await abrir(sessao_do_perfil(alana(), registro_da_menina()))

    assert response.status_code == 200
    # As mesmas opções, na mesma ordem, das perguntas 1 e 2 da A18 (#293).
    assert response.json() == {
        "firstName": "Alana",
        "open": True,
        "computingViews": [
            {"code": "want_to_follow", "label": "Algo que quero seguir"},
            {"code": "like_but_unsure", "label": "Gosto, mas não sei se quero seguir"},
            {"code": "less_interested", "label": "Já não me interessa tanto"},
            {"code": "not_for_me", "label": "Não é pra mim"},
        ],
        "futureSelves": [
            {"code": "sure", "label": "Com certeza"},
            {"code": "maybe", "label": "Talvez"},
            {"code": "probably_not", "label": "Acho que não"},
        ],
    }


@pytest.mark.parametrize(
    "registro",
    [
        # Já respondeu, mesmo que só uma das perguntas.
        registro_da_menina(visao=ComputingView.LIKE_BUT_UNSURE),
        registro_da_menina(futuro=FutureSelf.MAYBE),
        # Já passou dos interesses (A05): o cadastro acabou.
        registro_da_menina(etapa=StudyStage.MEDIO),
    ],
)
async def test_tela_fechada_depois_de_responder_ou_do_cadastro(
    registro: Girl,
) -> None:
    response = await abrir(sessao_do_perfil(alana(), registro))

    assert response.status_code == 200
    assert response.json()["open"] is False


async def test_tela_de_conta_sem_registro_de_menina_responde_404() -> None:
    response = await abrir(sessao_do_perfil(alana(), None))

    assert response.status_code == 404
    assert response.json() == {"error": "profile_not_found"}


async def test_tela_sem_sessao_responde_401() -> None:
    response = await chamar_rota(
        app, "GET", ROTA, sessao_do_perfil(alana(), registro_da_menina())
    )

    assert response.status_code == 401


async def test_tela_e_so_para_menina() -> None:
    response = await abrir(
        sessao_do_perfil(alana(role=Role.COORDINATOR), registro_da_menina())
    )

    assert response.status_code == 403


async def test_tela_exige_o_aceite_dos_termos() -> None:
    response = await abrir(sessao_do_perfil(alana(), registro_da_menina(), aceite=None))

    assert response.status_code == 403
    assert response.json() == {"error": "terms_not_accepted"}


# --- POST /api/profile/starting-point -----------------------------------------

AS_DUAS: dict[str, object] = {"computingView": "like_but_unsure", "futureSelf": "maybe"}


async def responder(sessao_falsa: AsyncMock, corpo: dict[str, object]) -> Response:
    return await chamar_rota(
        app,
        "POST",
        ROTA,
        sessao_falsa,
        token=create_access_token(1),
        corpo=corpo,
    )


async def test_continuar_grava_as_duas_respostas_no_perfil() -> None:
    registro = registro_da_menina()
    sessao_falsa = sessao_do_perfil(alana(), registro)

    response = await responder(sessao_falsa, AS_DUAS)

    assert response.status_code == 204
    assert registro.signup_computing_view is ComputingView.LIKE_BUT_UNSURE
    assert registro.signup_future_self is FutureSelf.MAYBE
    sessao_falsa.commit.assert_awaited_once()


@pytest.mark.parametrize(
    ("corpo", "visao", "futuro"),
    [
        ({"computingView": "want_to_follow"}, ComputingView.WANT_TO_FOLLOW, None),
        ({"futureSelf": "probably_not"}, None, FutureSelf.PROBABLY_NOT),
        (
            {"computingView": None, "futureSelf": "sure"},
            None,
            FutureSelf.SURE,
        ),
    ],
)
async def test_continuar_com_uma_pergunta_so(
    corpo: dict[str, object],
    visao: ComputingView | None,
    futuro: FutureSelf | None,
) -> None:
    registro = registro_da_menina()

    response = await responder(sessao_do_perfil(alana(), registro), corpo)

    assert response.status_code == 204
    assert registro.signup_computing_view is visao
    assert registro.signup_future_self is futuro


@pytest.mark.parametrize(
    "corpo",
    [
        # "Pular" não chama o back; sem nenhuma resposta não há o que gravar.
        {},
        {"computingView": None, "futureSelf": None},
        # Códigos fora das listas.
        {"computingView": "adoro"},
        {"futureSelf": "nunca"},
        # Campo desconhecido.
        {**AS_DUAS, "round": "three_months"},
    ],
)
async def test_resposta_invalida_e_recusada_sem_gravar(
    corpo: dict[str, object],
) -> None:
    registro = registro_da_menina()
    sessao_falsa = sessao_do_perfil(alana(), registro)

    response = await responder(sessao_falsa, corpo)

    assert response.status_code == 422
    assert registro.signup_computing_view is None
    assert registro.signup_future_self is None
    sessao_falsa.commit.assert_not_called()


async def test_responde_uma_vez_so() -> None:
    registro = registro_da_menina(visao=ComputingView.NOT_FOR_ME)
    sessao_falsa = sessao_do_perfil(alana(), registro)

    response = await responder(sessao_falsa, AS_DUAS)

    assert response.status_code == 409
    assert response.json() == {"error": "already_answered"}
    # A primeira resposta, o "antes" da comparação, não muda.
    assert registro.signup_computing_view is ComputingView.NOT_FOR_ME
    assert registro.signup_future_self is None
    sessao_falsa.commit.assert_not_called()


async def test_depois_dos_interesses_nao_responde_mais() -> None:
    registro = registro_da_menina(etapa=StudyStage.GRADUACAO)
    sessao_falsa = sessao_do_perfil(alana(), registro)

    response = await responder(sessao_falsa, AS_DUAS)

    assert response.status_code == 409
    assert response.json() == {"error": "signup_finished"}
    assert registro.signup_computing_view is None
    sessao_falsa.commit.assert_not_called()


async def test_resposta_de_conta_sem_registro_de_menina_responde_404() -> None:
    sessao_falsa = sessao_do_perfil(alana(), None)

    response = await responder(sessao_falsa, AS_DUAS)

    assert response.status_code == 404
    assert response.json() == {"error": "profile_not_found"}
    sessao_falsa.commit.assert_not_called()


async def test_resposta_sem_sessao_responde_401() -> None:
    sessao_falsa = sessao_do_perfil(alana(), registro_da_menina())

    response = await chamar_rota(app, "POST", ROTA, sessao_falsa, corpo=AS_DUAS)

    assert response.status_code == 401
    sessao_falsa.commit.assert_not_called()


async def test_resposta_e_so_para_menina() -> None:
    sessao_falsa = sessao_do_perfil(alana(role=Role.COORDINATOR), registro_da_menina())

    response = await responder(sessao_falsa, AS_DUAS)

    assert response.status_code == 403
    sessao_falsa.commit.assert_not_called()


async def test_resposta_exige_o_aceite_dos_termos() -> None:
    sessao_falsa = sessao_do_perfil(alana(), registro_da_menina(), aceite=None)

    response = await responder(sessao_falsa, AS_DUAS)

    assert response.status_code == 403
    assert response.json() == {"error": "terms_not_accepted"}
    sessao_falsa.commit.assert_not_called()


def test_openapi_mostra_a_tela_e_a_resposta(client: TestClient) -> None:
    openapi = client.get("/openapi.json").json()
    schemas = openapi["components"]["schemas"]

    assert set(openapi["paths"][ROTA]) == {"get", "post"}
    assert list(schemas["StartingPointOut"]["properties"]) == [
        "firstName",
        "open",
        "computingViews",
        "futureSelves",
    ]
    assert list(schemas["StartingPointIn"]["properties"]) == [
        "computingView",
        "futureSelf",
    ]
