"""Script da conta da equipe NISE (RF-S2.23, RN-41).

Rodam com `db_session` (Postgres de teste). Dados fictícios.
"""

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.utils import verify_password
from app.main import app
from app.users.models import Role, User
from scripts.criar_conta_equipe import TeamAccountError, create_team_account
from tests.helpers import chamar_rota

NOME = "Gabi Ficticia"
EMAIL = "gabi.equipe@exemplo.com"
SENHA = "senha-ficticia-123"


async def contas(sessao: AsyncSession) -> int:
    return await sessao.scalar(select(func.count()).select_from(User)) or 0


async def test_cria_conta_da_equipe_com_senha(db_session: AsyncSession) -> None:
    user = await create_team_account(db_session, f"  {NOME} ", EMAIL, SENHA)

    assert user.role is Role.NISE_TEAM
    assert user.name == NOME
    assert user.email == EMAIL
    assert user.password_hash is not None
    assert user.password_hash != SENHA
    assert verify_password(SENHA, user.password_hash)


async def test_email_e_normalizado_como_no_cadastro(db_session: AsyncSession) -> None:
    user = await create_team_account(
        db_session, NOME, " Gabi.Equipe@Exemplo.COM ", SENHA
    )

    assert user.email == EMAIL


# Uma conta de menina ou de coordenadora não vira conta da equipe por aqui.
@pytest.mark.parametrize("role", [Role.GIRL, Role.COORDINATOR, Role.NISE_TEAM])
async def test_email_com_conta_e_recusado(db_session: AsyncSession, role: Role) -> None:
    db_session.add(User(email=EMAIL, name="Outra Ficticia", role=role))
    await db_session.flush()
    antes = await contas(db_session)

    with pytest.raises(TeamAccountError, match="já tem conta"):
        await create_team_account(db_session, NOME, EMAIL.upper(), SENHA)

    assert await contas(db_session) == antes
    existente = await db_session.scalar(select(User).where(User.email == EMAIL))
    assert existente is not None
    assert existente.role is role


@pytest.mark.parametrize(
    ("nome", "email", "senha", "mensagem"),
    [
        ("  ", EMAIL, SENHA, "nome"),
        (NOME, "sem-arroba", SENHA, "e-mail"),
        (NOME, EMAIL, "curta", "8 caracteres"),
    ],
)
async def test_dados_ruins_sao_recusados(
    db_session: AsyncSession, nome: str, email: str, senha: str, mensagem: str
) -> None:
    antes = await contas(db_session)

    with pytest.raises(TeamAccountError, match=mensagem):
        await create_team_account(db_session, nome, email, senha)

    assert await contas(db_session) == antes


# RF-S2.23: com a conta, ela entra pelo login normal e cai no admin.
async def test_conta_criada_entra_e_cai_no_admin(db_session: AsyncSession) -> None:
    await create_team_account(db_session, NOME, EMAIL, SENHA)

    response = await chamar_rota(
        app,
        "POST",
        "/api/auth/login",
        db_session,
        corpo={"email": EMAIL, "password": SENHA},
    )

    assert response.status_code == 200
    assert response.json()["nextPath"] == "/admin/coordenadoras"
