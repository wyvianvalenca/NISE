from datetime import date
from unittest.mock import MagicMock

import pytest
from sqlalchemy.exc import IntegrityError

from app.auth import service
from app.auth.schemas import EmailSignupIn, LoginIn
from app.auth.service import authenticate_user, signup_with_email
from app.auth.utils import hash_password, verify_password
from app.modules.girls.models import Girl
from app.users.models import Role, User
from app.users.service import get_user_by_email, normalize_email
from tests.helpers import sessao_para_busca

# Calculado uma vez: cada hash Argon2 leva uma fração de segundo.
HASH_DA_ALANA = hash_password("senha-ficticia")


def alana(password_hash: str | None = HASH_DA_ALANA) -> User:
    return User(
        id=1,
        email="alana@exemplo.com",
        name="Alana Ficticia",
        password_hash=password_hash,
        role=Role.GIRL,
    )


def cadastro(email: str = "alana@exemplo.com") -> EmailSignupIn:
    return EmailSignupIn(
        name="Alana Ficticia",
        email=email,
        password="senha-ficticia",
        birth_date=date(2009, 3, 2),
        city_id=2704302,
    )


def login(
    email: str = "alana@exemplo.com", password: str = "senha-ficticia"
) -> LoginIn:
    return LoginIn(email=email, password=password)


@pytest.mark.parametrize(
    "email",
    ["alana@exemplo.com", "Alana@Exemplo.com", "  ALANA@EXEMPLO.COM "],
)
def test_normalize_email(email: str) -> None:
    assert normalize_email(email) == "alana@exemplo.com"


async def test_busca_por_email_usa_o_email_normalizado() -> None:
    sessao_falsa = sessao_para_busca(alana())

    assert await get_user_by_email(sessao_falsa, "Alana@Exemplo.com") is not None

    consulta = sessao_falsa.scalar.await_args.args[0]
    sql = str(consulta.compile(compile_kwargs={"literal_binds": True}))
    assert "'alana@exemplo.com'" in sql


async def test_cadastro_cria_menina_com_senha_em_hash() -> None:
    sessao_falsa = sessao_para_busca(None)

    user = await signup_with_email(sessao_falsa, cadastro("Alana@Exemplo.com"))

    assert user is not None
    assert user.role == Role.GIRL
    assert user.email == "alana@exemplo.com"
    assert user.password_hash is not None
    assert user.password_hash.startswith("$argon2id$")
    assert verify_password("senha-ficticia", user.password_hash)

    # Grava a usuária e o registro da menina, ligado a ela.
    gravados = [chamada.args[0] for chamada in sessao_falsa.add.call_args_list]
    assert user in gravados
    girl = next(item for item in gravados if isinstance(item, Girl))
    assert girl.user_id == user.id
    assert girl.email == "alana@exemplo.com"
    sessao_falsa.commit.assert_awaited_once()


async def test_cadastro_com_email_existente_nao_cria() -> None:
    sessao_falsa = sessao_para_busca(alana())

    assert await signup_with_email(sessao_falsa, cadastro()) is None
    sessao_falsa.add.assert_not_called()
    sessao_falsa.commit.assert_not_awaited()


async def test_cadastro_na_corrida_vira_none() -> None:
    # Duas requisições passam juntas pela pré-checagem; o índice único do banco
    # barra a segunda no commit.
    sessao_falsa = sessao_para_busca(None)
    sessao_falsa.commit.side_effect = IntegrityError(
        "INSERT INTO users ...", {}, Exception("e-mail duplicado")
    )

    assert await signup_with_email(sessao_falsa, cadastro()) is None
    sessao_falsa.rollback.assert_awaited_once()


async def test_login_com_senha_certa_devolve_a_usuaria() -> None:
    usuaria = alana()

    assert await authenticate_user(sessao_para_busca(usuaria), login()) is usuaria


async def test_login_com_senha_errada_devolve_none() -> None:
    sessao_falsa = sessao_para_busca(alana())

    assert await authenticate_user(sessao_falsa, login(password="senha-errada")) is None


@pytest.mark.parametrize(
    "usuaria",
    [None, alana(password_hash=None)],
    ids=["email-inexistente", "conta-so-do-google"],
)
async def test_login_sem_senha_para_conferir_gasta_o_hash_falso(
    usuaria: User | None, monkeypatch: pytest.MonkeyPatch
) -> None:
    # Sem o hash falso, esses casos responderiam mais rápido que a senha errada,
    # e o tempo revelaria quais e-mails têm conta.
    espiao = MagicMock(wraps=verify_password)
    monkeypatch.setattr(service, "verify_password", espiao)

    assert await authenticate_user(sessao_para_busca(usuaria), login()) is None
    espiao.assert_called_once_with("senha-ficticia", service._DUMMY_HASH)
