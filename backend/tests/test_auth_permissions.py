import pytest
from fastapi import Depends, FastAPI, HTTPException

from app.auth.permissions import CoordinatorDep, require_role
from app.auth.utils import create_access_token
from app.users.models import Role, User
from tests.helpers import chamar_rota, sessao_com


def usuaria_com_papel(papel: Role) -> User:
    return User(id=1, email="usuaria@exemplo.com", name="Usuaria Ficticia", role=papel)


# App só de teste: ainda não há rotas protegidas de verdade, e uma rota de
# teste no app real iria para produção e para o OpenAPI.
app_teste = FastAPI()


@app_teste.get("/so-coordenadora")
async def so_coordenadora(user: CoordinatorDep) -> dict[str, int]:
    return {"id": user.id}


@app_teste.get(
    "/coordenadora-ou-equipe",
    dependencies=[Depends(require_role(Role.COORDINATOR, Role.NISE_TEAM))],
)
async def coordenadora_ou_equipe() -> dict[str, bool]:
    return {"ok": True}


async def test_papel_aceito_devolve_a_usuaria() -> None:
    checar = require_role(Role.COORDINATOR)
    katia = usuaria_com_papel(Role.COORDINATOR)

    assert await checar(katia) is katia


async def test_papel_recusado_levanta_403() -> None:
    checar = require_role(Role.COORDINATOR)

    with pytest.raises(HTTPException) as erro:
        await checar(usuaria_com_papel(Role.GIRL))

    assert erro.value.status_code == 403
    assert erro.value.detail == "Sem permissão"


def test_require_role_sem_papeis_falha_ao_montar() -> None:
    with pytest.raises(ValueError):
        require_role()


@pytest.mark.parametrize("url", ["/so-coordenadora", "/coordenadora-ou-equipe"])
async def test_rota_protegida_sem_login_responde_401(url: str) -> None:
    sessao_falsa = sessao_com(None)

    response = await chamar_rota(app_teste, "GET", url, sessao_falsa)

    # 401 vem antes do 403: sem saber quem é, nem se olha o papel.
    assert response.status_code == 401
    sessao_falsa.get.assert_not_awaited()


@pytest.mark.parametrize(
    ("papel", "esperado"),
    [
        (Role.GIRL, 403),
        (Role.COORDINATOR, 200),
        # Sem hierarquia: a equipe NISE não herda o que a coordenadora pode
        # (ex.: só a coordenadora exporta, RF-F24.06).
        (Role.NISE_TEAM, 403),
    ],
    ids=["menina", "coordenadora", "equipe-nise"],
)
async def test_rota_so_de_coordenadora(papel: Role, esperado: int) -> None:
    response = await chamar_rota(
        app_teste,
        "GET",
        "/so-coordenadora",
        sessao_com(usuaria_com_papel(papel)),
        token=create_access_token(1),
    )

    assert response.status_code == esperado


@pytest.mark.parametrize(
    ("papel", "esperado"),
    [(Role.GIRL, 403), (Role.COORDINATOR, 200), (Role.NISE_TEAM, 200)],
    ids=["menina", "coordenadora", "equipe-nise"],
)
async def test_rota_de_coordenadora_ou_equipe(papel: Role, esperado: int) -> None:
    response = await chamar_rota(
        app_teste,
        "GET",
        "/coordenadora-ou-equipe",
        sessao_com(usuaria_com_papel(papel)),
        token=create_access_token(1),
    )

    assert response.status_code == esperado
