from unittest.mock import AsyncMock

from fastapi.testclient import TestClient

from app.auth.utils import create_access_token
from app.main import app
from app.modules.girls.models import StudyStage, Topic
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
