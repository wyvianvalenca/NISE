from unittest.mock import AsyncMock

from sqlalchemy.exc import IntegrityError

from app.auth.google import GoogleProfile
from app.auth.service import find_oauth_user
from app.db.engine import engine
from app.users.models import OAuthAccount, Provider, Role, User
from tests.helpers import sessao_para_busca

PERFIL = GoogleProfile(
    subject="google-123", email="Alana@Exemplo.com", name="Alana Ficticia"
)


def alana(password_hash: str | None = "hash-ficticio") -> User:
    return User(
        id=1,
        email="alana@exemplo.com",
        name="Alana Ficticia",
        password_hash=password_hash,
        role=Role.GIRL,
    )


def sessao_que_acha(*resultados: User | None) -> AsyncMock:
    # Cada session.scalar devolve o próximo da lista:
    # 1º a busca pelo sub, 2º a busca pelo e-mail, 3º a busca depois da corrida.
    sessao_falsa = sessao_para_busca(None)
    sessao_falsa.scalar.side_effect = list(resultados)
    return sessao_falsa


def sql_da_busca(sessao_falsa: AsyncMock, numero: int) -> str:
    # Compila a consulta da n-ésima chamada a session.scalar, sem conectar.
    consulta = sessao_falsa.scalar.await_args_list[numero].args[0]
    return str(
        consulta.compile(dialect=engine.dialect, compile_kwargs={"literal_binds": True})
    )


def corrida() -> IntegrityError:
    return IntegrityError("INSERT INTO ...", {}, Exception("valor duplicado"))


def objetos_adicionados(sessao_falsa: AsyncMock) -> list[object]:
    return [chamada.args[0] for chamada in sessao_falsa.add.call_args_list]


# Achar a conta


async def test_achada_pelo_sub_entra_sem_mexer_no_banco() -> None:
    # O caminho de todo login depois do primeiro.
    usuaria = alana()
    sessao_falsa = sessao_que_acha(usuaria)

    assert await find_oauth_user(sessao_falsa, PERFIL) is usuaria

    assert sessao_falsa.scalar.await_count == 1
    sessao_falsa.add.assert_not_called()
    sessao_falsa.commit.assert_not_awaited()


async def test_busca_pelo_sub_usa_a_ligacao_com_o_google() -> None:
    sessao_falsa = sessao_que_acha(alana())

    await find_oauth_user(sessao_falsa, PERFIL)

    sql = sql_da_busca(sessao_falsa, 0)
    assert "JOIN oauth_accounts ON oauth_accounts.user_id = users.id" in sql
    assert "oauth_accounts.provider_user_id = 'google-123'" in sql


async def test_achada_pelo_email_grava_a_ligacao() -> None:
    # Primeiro login com Google de quem já tinha conta com senha.
    usuaria = alana()
    sessao_falsa = sessao_que_acha(None, usuaria)

    assert await find_oauth_user(sessao_falsa, PERFIL) is usuaria

    [ligacao] = objetos_adicionados(sessao_falsa)
    assert isinstance(ligacao, OAuthAccount)
    assert ligacao.user_id == 1
    assert ligacao.provider == Provider.GOOGLE
    assert ligacao.provider_user_id == "google-123"
    sessao_falsa.commit.assert_awaited_once()


async def test_busca_pelo_email_usa_o_email_normalizado() -> None:
    sessao_falsa = sessao_que_acha(None, alana())

    await find_oauth_user(sessao_falsa, PERFIL)

    assert "'alana@exemplo.com'" in sql_da_busca(sessao_falsa, 1)


async def test_ligacao_mantem_a_senha() -> None:
    # Decisão atual: a senha fica até existir verificação de e-mail.
    usuaria = alana()

    await find_oauth_user(sessao_que_acha(None, usuaria), PERFIL)

    assert usuaria.password_hash == "hash-ficticio"


async def test_conta_so_do_google_tambem_e_ligada() -> None:
    # Ex.: coordenadora criada por script, sem senha.
    usuaria = alana(password_hash=None)
    sessao_falsa = sessao_que_acha(None, usuaria)

    assert await find_oauth_user(sessao_falsa, PERFIL) is usuaria
    sessao_falsa.commit.assert_awaited_once()


async def test_pessoa_nova_devolve_none_sem_gravar_nada() -> None:
    # Nada vai para o banco antes de saber a idade (RN-03).
    sessao_falsa = sessao_que_acha(None, None)

    assert await find_oauth_user(sessao_falsa, PERFIL) is None

    sessao_falsa.add.assert_not_called()
    sessao_falsa.commit.assert_not_awaited()


async def test_ligacao_na_corrida_devolve_a_usuaria() -> None:
    # Duas abas ligam a mesma conta: a segunda esbarra na regra de unicidade e
    # acha a ligação que a primeira acabou de gravar.
    usuaria = alana()
    sessao_falsa = sessao_que_acha(None, usuaria, usuaria)
    sessao_falsa.commit.side_effect = corrida()

    assert await find_oauth_user(sessao_falsa, PERFIL) is usuaria

    sessao_falsa.rollback.assert_awaited_once()
    # Busca de novo pelo sub, em vez de ler o objeto expirado pelo rollback.
    assert sessao_falsa.scalar.await_count == 3
    assert "oauth_accounts" in sql_da_busca(sessao_falsa, 2)
