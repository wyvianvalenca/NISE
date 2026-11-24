"""Excluir minha conta e meus dados (RF-F7.09, #394).

Sem banco: a sessão é falsa e ignora o WHERE, então o filtro de dono é
conferido no SQL compilado. Os números dos painéis e "nada identificável
sobra" ficam em test_account_deletion_db.py, com o Postgres de verdade.
"""

from datetime import UTC, datetime

from sqlalchemy import DateTime

from app.auth.utils import create_access_token
from app.main import app
from app.users.models import Role, User
from tests.helpers import chamar_rota, sessao_com


def alana() -> User:
    return User(
        id=1,
        email="alana@exemplo.com",
        name="Alana Ficticia",
        password_hash="hash-ficticio",
        role=Role.GIRL,
    )


def alana_excluida() -> User:
    conta = alana()
    conta.deleted_at = datetime(2026, 11, 24, 12, 0, tzinfo=UTC)
    return conta


# C5: a data do pedido fica em users.deleted_at, nula por padrão.
def test_users_tem_deleted_at_com_fuso_e_nulo_por_padrao() -> None:
    coluna = User.__table__.c.deleted_at

    assert isinstance(coluna.type, DateTime)
    assert coluna.type.timezone is True
    assert coluna.nullable is True
    assert alana().deleted_at is None


# C3: o cookie antigo de uma conta excluída dá 401 em qualquer rota.
async def test_me_de_conta_excluida_responde_401() -> None:
    response = await chamar_rota(
        app,
        "GET",
        "/api/auth/me",
        sessao_com(alana_excluida()),
        token=create_access_token(1),
    )

    assert response.status_code == 401
    assert response.json() == {"detail": "Não autenticada"}


async def test_perfil_de_conta_excluida_responde_401() -> None:
    response = await chamar_rota(
        app,
        "GET",
        "/api/profile/details",
        sessao_com(alana_excluida()),
        token=create_access_token(1),
    )

    assert response.status_code == 401
    assert response.json() == {"detail": "Não autenticada"}
