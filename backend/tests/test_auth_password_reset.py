from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock

import pytest

from app.auth.models import PasswordResetToken
from app.auth.service import create_password_reset_token, reset_password
from app.auth.utils import hash_password, hash_reset_token, verify_password
from app.config import settings
from app.db.engine import engine
from app.users.models import Role, User
from tests.helpers import sessao_para_busca

# Calculado uma vez: cada hash Argon2 leva uma fração de segundo.
HASH_ANTIGO = hash_password("senha-antiga")
TOKEN = "token-ficticio-do-link"


def katia(password_hash: str | None = HASH_ANTIGO) -> User:
    return User(
        id=1,
        email="katia@exemplo.com",
        name="Katia Ficticia",
        password_hash=password_hash,
        role=Role.COORDINATOR,
    )


def token_salvo(
    expira_em: timedelta = timedelta(minutes=30), used_at: datetime | None = None
) -> PasswordResetToken:
    return PasswordResetToken(
        id=1,
        user_id=1,
        token_hash=hash_reset_token(TOKEN),
        expires_at=datetime.now(UTC) + expira_em,
        used_at=used_at,
    )


def sessao_com_token(
    token: PasswordResetToken | None, usuaria: User | None
) -> AsyncMock:
    # session.scalar acha o token pelo hash; session.get acha a dona do token.
    sessao_falsa = sessao_para_busca(None)
    sessao_falsa.scalar.return_value = token
    sessao_falsa.get.return_value = usuaria
    return sessao_falsa


# Criar o token


async def test_criar_salva_so_o_hash_do_token() -> None:
    sessao_falsa = sessao_para_busca(None)

    token = await create_password_reset_token(sessao_falsa, katia())

    salvo = sessao_falsa.add.call_args.args[0]
    assert salvo.user_id == 1
    assert salvo.token_hash == hash_reset_token(token)
    assert salvo.token_hash != token
    assert salvo.used_at is None
    sessao_falsa.commit.assert_awaited_once()


async def test_criar_usa_a_validade_do_config(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "password_reset_expire_minutes", 15)
    sessao_falsa = sessao_para_busca(None)

    antes = datetime.now(UTC)
    await create_password_reset_token(sessao_falsa, katia())
    depois = datetime.now(UTC)

    salvo = sessao_falsa.add.call_args.args[0]
    validade = timedelta(minutes=15)
    assert antes + validade <= salvo.expires_at <= depois + validade


async def test_cada_pedido_gera_um_token_diferente() -> None:
    token_1 = await create_password_reset_token(sessao_para_busca(None), katia())
    token_2 = await create_password_reset_token(sessao_para_busca(None), katia())

    assert token_1 != token_2
    # 32 bytes aleatórios viram 43 caracteres: não dá para adivinhar.
    assert len(token_1) == 43


async def test_criar_invalida_os_tokens_abertos_antes_de_salvar_o_novo() -> None:
    sessao_falsa = sessao_para_busca(None)

    await create_password_reset_token(sessao_falsa, katia())

    sql = str(sessao_falsa.execute.await_args.args[0].compile())
    assert "UPDATE password_reset_tokens SET used_at" in sql
    assert "used_at IS NULL" in sql
    # Na ordem inversa, o UPDATE também invalidaria o token novo.
    chamadas = [nome for nome, _, _ in sessao_falsa.mock_calls]
    assert chamadas.index("execute") < chamadas.index("add")


# Trocar a senha


async def test_token_valido_troca_a_senha_e_queima_o_token() -> None:
    usuaria = katia()
    reset = token_salvo()
    sessao_falsa = sessao_com_token(reset, usuaria)

    assert await reset_password(sessao_falsa, TOKEN, "senha-nova") is usuaria

    assert usuaria.password_hash is not None
    assert verify_password("senha-nova", usuaria.password_hash)
    assert reset.used_at is not None
    sessao_falsa.execute.assert_awaited_once()  # invalida os outros tokens
    sessao_falsa.commit.assert_awaited_once()


async def test_conta_so_do_google_ganha_uma_senha() -> None:
    usuaria = katia(password_hash=None)

    await reset_password(sessao_com_token(token_salvo(), usuaria), TOKEN, "senha-nova")

    assert usuaria.password_hash is not None
    assert verify_password("senha-nova", usuaria.password_hash)


async def test_busca_pelo_hash_e_com_trava() -> None:
    sessao_falsa = sessao_com_token(token_salvo(), katia())

    await reset_password(sessao_falsa, TOKEN, "senha-nova")

    consulta = sessao_falsa.scalar.await_args.args[0]
    # Compila com o dialeto do app, sem conectar, para ver o SQL do Postgres.
    sql = str(
        consulta.compile(dialect=engine.dialect, compile_kwargs={"literal_binds": True})
    )
    assert hash_reset_token(TOKEN) in sql
    assert TOKEN not in sql
    # Sem a trava, duas abas com o mesmo link trocariam a senha duas vezes.
    assert "FOR UPDATE" in sql


@pytest.mark.parametrize(
    "reset",
    [
        None,
        token_salvo(expira_em=timedelta(minutes=-1)),
        token_salvo(used_at=datetime.now(UTC) - timedelta(minutes=5)),
    ],
    ids=["inexistente", "expirado", "ja-usado"],
)
async def test_token_recusado_nao_muda_a_senha(
    reset: PasswordResetToken | None,
) -> None:
    usuaria = katia()
    sessao_falsa = sessao_com_token(reset, usuaria)

    assert await reset_password(sessao_falsa, TOKEN, "senha-nova") is None

    assert usuaria.password_hash == HASH_ANTIGO
    sessao_falsa.rollback.assert_awaited_once()
    sessao_falsa.commit.assert_not_awaited()


async def test_token_sem_dona_e_recusado() -> None:
    sessao_falsa = sessao_com_token(token_salvo(), None)

    assert await reset_password(sessao_falsa, TOKEN, "senha-nova") is None
    sessao_falsa.rollback.assert_awaited_once()
    sessao_falsa.commit.assert_not_awaited()
