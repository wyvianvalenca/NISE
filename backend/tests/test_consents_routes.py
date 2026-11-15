from unittest.mock import AsyncMock

from fastapi.testclient import TestClient

from app.auth.utils import create_access_token
from app.main import app
from app.modules.consents.service import CURRENT_TERMS_VERSION, get_origin_group_name
from app.users.models import Role, User
from tests.helpers import chamar_rota, sessao_com

# Dados fictícios.


def alana(role: Role = Role.GIRL) -> User:
    return User(id=1, email="alana@exemplo.com", name="Alana Ficticia", role=role)


def sessao_da_menina(usuaria: User, grupo_de_origem: str | None) -> AsyncMock:
    # session.get(User, id) acha a usuária da sessão; session.scalar devolve o
    # nome do grupo de origem, ou None se ela chegou sozinha.
    sessao_falsa = sessao_com(usuaria)
    sessao_falsa.scalar.return_value = grupo_de_origem
    return sessao_falsa


# --- GET /api/terms/summary --------------------------------------------------


async def test_menina_do_convite_recebe_a_versao_do_grupo() -> None:
    # M1: a liderança do grupo que convidou vê os dados dela (RN-01).
    response = await chamar_rota(
        app,
        "GET",
        "/api/terms/summary",
        sessao_da_menina(alana(), "Rendeiras do Código"),
        token=create_access_token(1),
    )

    assert response.status_code == 200
    assert response.json() == {
        "version": CURRENT_TERMS_VERSION,
        "origin": {"kind": "group", "groupName": "Rendeiras do Código"},
    }


async def test_menina_que_chegou_sozinha_recebe_a_versao_da_nise() -> None:
    # M2: os grupos só veem números gerais (RN-04).
    response = await chamar_rota(
        app,
        "GET",
        "/api/terms/summary",
        sessao_da_menina(alana(), None),
        token=create_access_token(1),
    )

    assert response.status_code == 200
    assert response.json() == {
        "version": CURRENT_TERMS_VERSION,
        "origin": {"kind": "self"},
    }


async def test_resumo_sem_sessao_responde_401() -> None:
    response = await chamar_rota(
        app, "GET", "/api/terms/summary", sessao_da_menina(alana(), None)
    )

    assert response.status_code == 401


async def test_resumo_e_so_para_menina() -> None:
    coordenadora = alana(role=Role.COORDINATOR)
    sessao_falsa = sessao_da_menina(coordenadora, None)

    response = await chamar_rota(
        app,
        "GET",
        "/api/terms/summary",
        sessao_falsa,
        token=create_access_token(1),
    )

    assert response.status_code == 403
    sessao_falsa.scalar.assert_not_called()


async def test_grupo_de_origem_e_procurado_pela_menina_da_sessao() -> None:
    sessao_falsa = AsyncMock()
    sessao_falsa.scalar.return_value = None

    await get_origin_group_name(sessao_falsa, 1)

    consulta = sessao_falsa.scalar.call_args.args[0]
    sql = str(consulta.compile(compile_kwargs={"literal_binds": True}))
    assert "girls.origin_group_id = groups.id" in sql
    assert "girls.user_id = 1" in sql


def test_openapi_mostra_a_origem_em_camel_case(client: TestClient) -> None:
    schemas = client.get("/openapi.json").json()["components"]["schemas"]

    assert list(schemas["GroupOrigin"]["properties"]) == ["kind", "groupName"]
