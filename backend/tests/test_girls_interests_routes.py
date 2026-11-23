from unittest.mock import AsyncMock

import pytest
from fastapi.testclient import TestClient
from httpx2 import Response

from app.auth.utils import create_access_token
from app.main import app
from app.modules.girls.models import Girl, GirlTopic, StudyStage, Topic
from app.modules.girls.utils import STUDY_STAGE_LABELS, TOPIC_LABELS
from app.users.models import Role, User
from tests.helpers import chamar_rota, sessao_com

# Dados fictícios.


def alana(role: Role = Role.GIRL) -> User:
    return User(id=1, email="alana@exemplo.com", name="Alana Ficticia", role=role)


def sessao_da_menina(usuaria: User, aceite: int | None = 10) -> AsyncMock:
    # session.get(User, id) acha a usuária da sessão. session.scalar procura o
    # aceite dos termos (o id dele, ou None; por padrão ela já aceitou).
    sessao_falsa = sessao_com(usuaria)
    sessao_falsa.scalar.return_value = aceite
    return sessao_falsa


# --- GET /api/profile/interest-options ---------------------------------------


async def test_listas_de_temas_e_etapas_vem_na_ordem_da_tela() -> None:
    response = await chamar_rota(
        app,
        "GET",
        "/api/profile/interest-options",
        sessao_da_menina(alana()),
        token=create_access_token(1),
    )

    assert response.status_code == 200
    assert response.json() == {
        "topics": [
            {"code": "programacao", "label": "Programação"},
            {"code": "robotica", "label": "Robótica"},
            {"code": "ia", "label": "Inteligência artificial"},
            {"code": "dados", "label": "Dados"},
            {"code": "ciberseguranca", "label": "Cibersegurança"},
            {"code": "jogos", "label": "Jogos"},
            {"code": "sites", "label": "Sites e apps"},
            {"code": "design", "label": "Design e criação"},
        ],
        "stages": [
            {"code": "fundamental", "label": "Ensino fundamental"},
            {"code": "medio", "label": "Ensino médio"},
            {"code": "tecnico", "label": "Curso técnico"},
            {"code": "graduacao", "label": "Graduação"},
            {"code": "formada", "label": "Já me formei"},
        ],
    }


def test_todo_tema_e_toda_etapa_tem_nome_na_tela() -> None:
    # Um código novo no enum sem nome aqui ficaria fora da A05.
    assert set(TOPIC_LABELS) == set(Topic)
    assert set(STUDY_STAGE_LABELS) == set(StudyStage)


async def test_listas_sem_sessao_responde_401() -> None:
    response = await chamar_rota(
        app, "GET", "/api/profile/interest-options", sessao_da_menina(alana())
    )

    assert response.status_code == 401


async def test_listas_sao_so_para_menina() -> None:
    response = await chamar_rota(
        app,
        "GET",
        "/api/profile/interest-options",
        sessao_da_menina(alana(role=Role.COORDINATOR)),
        token=create_access_token(1),
    )

    assert response.status_code == 403


async def test_listas_exigem_o_aceite_dos_termos() -> None:
    response = await chamar_rota(
        app,
        "GET",
        "/api/profile/interest-options",
        sessao_da_menina(alana(), aceite=None),
        token=create_access_token(1),
    )

    assert response.status_code == 403
    assert response.json() == {"error": "terms_not_accepted"}


def test_openapi_mostra_as_listas(client: TestClient) -> None:
    openapi = client.get("/openapi.json").json()

    assert "/api/profile/interest-options" in openapi["paths"]
    assert list(
        openapi["components"]["schemas"]["InterestOptionsOut"]["properties"]
    ) == [
        "topics",
        "stages",
    ]


# --- PUT /api/profile/interests ----------------------------------------------

UM_TEMA = {"topics": ["robotica"], "everything": False, "stage": "medio"}


def registro_da_menina(temas: list[Topic] | None = None) -> Girl:
    return Girl(
        id=3,
        email="alana@exemplo.com",
        name="Alana Ficticia",
        user_id=1,
        topics=[GirlTopic(topic=tema) for tema in temas or []],
        all_topics=False,
    )


def temas_de(registro: Girl) -> list[Topic]:
    return [item.topic for item in registro.topics]


def sessao_da_gravacao(
    usuaria: User, registro: Girl | None, aceite: int | None = 10
) -> AsyncMock:
    # session.scalar responde, em ordem: o aceite dos termos (o id dele, ou
    # None) e o registro da menina, com os temas já carregados (ou None).
    sessao_falsa = sessao_com(usuaria)
    sessao_falsa.scalar.side_effect = [aceite, registro]
    return sessao_falsa


async def gravar(sessao_falsa: AsyncMock, corpo: dict[str, object]) -> Response:
    return await chamar_rota(
        app,
        "PUT",
        "/api/profile/interests",
        sessao_falsa,
        token=create_access_token(1),
        corpo=corpo,
    )


async def test_um_tema_e_a_etapa_sao_gravados() -> None:
    registro = registro_da_menina()
    sessao_falsa = sessao_da_gravacao(alana(), registro)

    response = await gravar(sessao_falsa, UM_TEMA)

    assert response.status_code == 204
    assert temas_de(registro) == [Topic.ROBOTICA]
    assert registro.study_stage is StudyStage.MEDIO
    assert registro.all_topics is False
    sessao_falsa.commit.assert_awaited_once()


async def test_varios_temas_sao_gravados() -> None:
    registro = registro_da_menina()

    response = await gravar(
        sessao_da_gravacao(alana(), registro),
        {**UM_TEMA, "topics": ["programacao", "ia", "jogos"]},
    )

    assert response.status_code == 204
    assert temas_de(registro) == [Topic.PROGRAMACAO, Topic.IA, Topic.JOGOS]


async def test_me_mostra_de_tudo_sozinho_e_gravado() -> None:
    registro = registro_da_menina([Topic.DADOS])

    response = await gravar(
        sessao_da_gravacao(alana(), registro),
        {"topics": [], "everything": True, "stage": "tecnico"},
    )

    assert response.status_code == 204
    assert registro.topics == []
    assert registro.all_topics is True
    assert registro.study_stage is StudyStage.TECNICO


@pytest.mark.parametrize(
    "corpo",
    [
        # Não há "Pular por agora" (D-19).
        {**UM_TEMA, "topics": []},
        # "Me mostra de tudo" junto com um tema.
        {**UM_TEMA, "everything": True},
        # Códigos fora das listas.
        {**UM_TEMA, "topics": ["culinaria"]},
        {**UM_TEMA, "stage": "mestrado"},
        # A etapa é obrigatória.
        {"topics": ["robotica"], "everything": False},
    ],
)
async def test_escolha_invalida_e_recusada_sem_gravar(
    corpo: dict[str, object],
) -> None:
    registro = registro_da_menina([Topic.DADOS])
    sessao_falsa = sessao_da_gravacao(alana(), registro)

    response = await gravar(sessao_falsa, corpo)

    assert response.status_code == 422
    assert temas_de(registro) == [Topic.DADOS]
    sessao_falsa.commit.assert_not_called()


async def test_conta_sem_registro_de_menina_responde_404() -> None:
    sessao_falsa = sessao_da_gravacao(alana(), None)

    response = await gravar(sessao_falsa, UM_TEMA)

    assert response.status_code == 404
    assert response.json() == {"error": "profile_not_found"}
    sessao_falsa.commit.assert_not_called()


async def test_gravacao_sem_sessao_responde_401() -> None:
    sessao_falsa = sessao_da_gravacao(alana(), registro_da_menina())

    response = await chamar_rota(
        app, "PUT", "/api/profile/interests", sessao_falsa, corpo=UM_TEMA
    )

    assert response.status_code == 401
    sessao_falsa.commit.assert_not_called()


async def test_gravacao_e_so_para_menina() -> None:
    sessao_falsa = sessao_da_gravacao(
        alana(role=Role.COORDINATOR), registro_da_menina()
    )

    response = await gravar(sessao_falsa, UM_TEMA)

    assert response.status_code == 403
    sessao_falsa.commit.assert_not_called()


async def test_gravacao_exige_o_aceite_dos_termos() -> None:
    sessao_falsa = sessao_da_gravacao(alana(), registro_da_menina(), aceite=None)

    response = await gravar(sessao_falsa, UM_TEMA)

    assert response.status_code == 403
    assert response.json() == {"error": "terms_not_accepted"}
    sessao_falsa.commit.assert_not_called()


def test_openapi_mostra_a_gravacao(client: TestClient) -> None:
    openapi = client.get("/openapi.json").json()

    assert "put" in openapi["paths"]["/api/profile/interests"]
    assert list(openapi["components"]["schemas"]["InterestsIn"]["properties"]) == [
        "topics",
        "everything",
        "stage",
    ]
