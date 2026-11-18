from unittest.mock import AsyncMock

from fastapi import FastAPI

from app.auth.utils import create_access_token
from app.main import app
from app.modules.consents.permissions import AcceptedGirlDep
from app.users.models import Role, User
from tests.helpers import chamar_rota, sessao_com

# As rotas do filé e do perfil ainda não existem. Este app de teste tem uma
# rota que usa AcceptedGirlDep como elas vão usar, com os mesmos tratadores de
# erro do app de verdade.
app_de_teste = FastAPI()
app_de_teste.exception_handlers.update(app.exception_handlers)


@app_de_teste.get("/file")
async def file_da_menina(user: AcceptedGirlDep) -> dict[str, int]:
    return {"user_id": user.id}


# Dados fictícios.
def alana(role: Role = Role.GIRL) -> User:
    return User(id=1, email="alana@exemplo.com", name="Alana Ficticia", role=role)


def sessao_com_aceite(usuaria: User, aceite: int | None) -> AsyncMock:
    # session.scalar procura o aceite da versão atual: o id dele, ou None.
    sessao_falsa = sessao_com(usuaria)
    sessao_falsa.scalar.return_value = aceite
    return sessao_falsa


async def test_sem_aceite_a_rota_responde_que_falta_o_aceite() -> None:
    response = await chamar_rota(
        app_de_teste,
        "GET",
        "/file",
        sessao_com_aceite(alana(), None),
        token=create_access_token(1),
    )

    assert response.status_code == 403
    assert response.json() == {"error": "terms_not_accepted"}


async def test_com_aceite_a_rota_responde() -> None:
    response = await chamar_rota(
        app_de_teste,
        "GET",
        "/file",
        sessao_com_aceite(alana(), 10),
        token=create_access_token(1),
    )

    assert response.status_code == 200
    assert response.json() == {"user_id": 1}


async def test_coordenadora_e_barrada_antes_de_olhar_o_aceite() -> None:
    sessao_falsa = sessao_com_aceite(alana(role=Role.COORDINATOR), 10)

    response = await chamar_rota(
        app_de_teste,
        "GET",
        "/file",
        sessao_falsa,
        token=create_access_token(1),
    )

    assert response.status_code == 403
    assert response.json() == {"detail": "Sem permissão"}
    sessao_falsa.scalar.assert_not_called()


async def test_sem_sessao_responde_401() -> None:
    response = await chamar_rota(
        app_de_teste, "GET", "/file", sessao_com_aceite(alana(), 10)
    )

    assert response.status_code == 401
