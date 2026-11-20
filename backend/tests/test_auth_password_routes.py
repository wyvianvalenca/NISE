"""Rotas de recuperar o acesso (A16 e A16b, #331, RF-S2.04).

Dados fictícios. O banco é uma sessão falsa e o envio de e-mail é trocado por
uma função que só guarda o que seria enviado.
"""

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock

import pytest
from httpx2 import Response
from sqlalchemy.exc import OperationalError

from app.auth import reset_email
from app.auth.models import PasswordResetToken
from app.auth.permissions import SESSION_COOKIE
from app.auth.utils import decode_access_token, hash_reset_token, verify_password
from app.config import settings
from app.main import app
from app.users.models import Role, User
from tests.helpers import chamar_rota, sessao_para_busca, token_do_cookie

TOKEN = "token-ficticio-do-link"


def katia() -> User:
    return User(
        id=1,
        email="katia@exemplo.com",
        name="Katia Ficticia",
        password_hash=None,
        role=Role.COORDINATOR,
    )


def link(
    expira_em: timedelta = timedelta(minutes=30), used_at: datetime | None = None
) -> PasswordResetToken:
    return PasswordResetToken(
        id=1,
        user_id=1,
        token_hash=hash_reset_token(TOKEN),
        expires_at=datetime.now(UTC) + expira_em,
        used_at=used_at,
    )


def sessao_com_link(
    token: PasswordResetToken | None, dona: User | None = None
) -> AsyncMock:
    # session.scalar acha o link pelo hash; session.get acha a dona dele.
    sessao_falsa = sessao_para_busca(None)
    sessao_falsa.scalar.return_value = token
    sessao_falsa.get.return_value = dona or katia()
    return sessao_falsa


@pytest.fixture
def enviados(monkeypatch: pytest.MonkeyPatch) -> list[tuple[str, str, str]]:
    caixa: list[tuple[str, str, str]] = []

    def enviar(to: str, subject: str, body: str) -> None:
        caixa.append((to, subject, body))

    monkeypatch.setattr(reset_email, "send_email", enviar)
    return caixa


LINKS_QUE_NAO_VALEM = [
    pytest.param(None, id="desconhecido"),
    pytest.param(link(expira_em=timedelta(minutes=-1)), id="vencido"),
    pytest.param(link(used_at=datetime.now(UTC)), id="usado"),
]


# Pedir o link (A16)


def banco_da_tarefa(monkeypatch: pytest.MonkeyPatch, sessao: AsyncMock) -> None:
    # A tarefa de fundo abre a própria sessão (SessionLocal), fora da rota.
    @asynccontextmanager
    async def abrir() -> AsyncIterator[AsyncMock]:
        yield sessao

    monkeypatch.setattr(reset_email, "SessionLocal", abrir)


async def pedir_link(email: str, sessao_da_rota: AsyncMock | None = None) -> Response:
    return await chamar_rota(
        app,
        "POST",
        "/api/auth/password/forgot",
        sessao_da_rota or sessao_para_busca(None),
        corpo={"email": email},
    )


async def test_pedido_de_conta_existente_manda_o_link(
    enviados: list[tuple[str, str, str]], monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(settings, "app_url", "https://nise.exemplo.com/")
    sessao_falsa = sessao_para_busca(katia())
    banco_da_tarefa(monkeypatch, sessao_falsa)

    response = await pedir_link(" Katia@Exemplo.com ")

    assert response.status_code == 204
    salvo = sessao_falsa.add.call_args.args[0]
    assert isinstance(salvo, PasswordResetToken)

    [(para, assunto, corpo)] = enviados
    assert para == "katia@exemplo.com"
    assert assunto == reset_email.SUBJECT
    # O link leva à A16b com o token cujo hash foi salvo.
    prefixo = "https://nise.exemplo.com/entrar/nova-senha?token="
    linha = next(linha for linha in corpo.splitlines() if prefixo in linha)
    token = linha.split("token=")[1]
    assert hash_reset_token(token) == salvo.token_hash


async def test_pedido_de_email_sem_conta_responde_igual_e_nao_manda_nada(
    enviados: list[tuple[str, str, str]], monkeypatch: pytest.MonkeyPatch
) -> None:
    sessao_falsa = sessao_para_busca(None)
    banco_da_tarefa(monkeypatch, sessao_falsa)

    response = await pedir_link("ninguem@exemplo.com")

    # A mesma resposta da conta existente: a A16 não diz quem tem conta.
    assert response.status_code == 204
    assert response.content == b""
    sessao_falsa.add.assert_not_called()
    assert enviados == []


async def test_a_rota_nao_consulta_o_banco_antes_de_responder(
    enviados: list[tuple[str, str, str]], monkeypatch: pytest.MonkeyPatch
) -> None:
    # Revisão do #332: com a busca e o token antes da resposta, ela demorava
    # mais quando a conta existia, e o tempo dizia quem tem conta. Agora a
    # rota não usa a sessão dela; tudo fica na tarefa de fundo.
    sessao_da_rota = sessao_para_busca(katia())
    banco_da_tarefa(monkeypatch, sessao_para_busca(katia()))

    await pedir_link("katia@exemplo.com", sessao_da_rota)

    sessao_da_rota.scalar.assert_not_awaited()
    sessao_da_rota.execute.assert_not_awaited()
    sessao_da_rota.commit.assert_not_awaited()
    assert len(enviados) == 1


async def test_falha_no_envio_nao_aparece_na_resposta_nem_no_log(
    monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    # Sem trocar o send_email: até o #287 entrar, o envio não existe.
    caplog.set_level(logging.WARNING)
    banco_da_tarefa(monkeypatch, sessao_para_busca(katia()))

    response = await pedir_link("katia@exemplo.com")

    assert response.status_code == 204
    assert "EmailNotConfiguredError" in caplog.text
    assert "katia" not in caplog.text
    assert "token=" not in caplog.text


async def test_falha_no_banco_nao_aparece_na_resposta_nem_no_log(
    enviados: list[tuple[str, str, str]],
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
) -> None:
    caplog.set_level(logging.WARNING)
    sessao_falsa = sessao_para_busca(None)
    # O erro do SQLAlchemy traz os parâmetros da consulta, com o e-mail.
    sessao_falsa.scalar.side_effect = OperationalError(
        "select", {"email": "katia@exemplo.com"}, Exception("conexão caiu")
    )
    banco_da_tarefa(monkeypatch, sessao_falsa)

    response = await pedir_link("katia@exemplo.com")

    assert response.status_code == 204
    assert "OperationalError" in caplog.text
    assert "katia" not in caplog.text
    assert enviados == []


# Conferir o link (A16b)


async def test_link_valido_devolve_o_email_da_conta() -> None:
    response = await chamar_rota(
        app,
        "POST",
        "/api/auth/password/reset/check",
        sessao_com_link(link()),
        corpo={"token": TOKEN},
    )

    assert response.status_code == 200
    assert response.json() == {"email": "katia@exemplo.com"}


@pytest.mark.parametrize("token", LINKS_QUE_NAO_VALEM)
async def test_link_que_nao_vale_e_recusado(token: PasswordResetToken | None) -> None:
    response = await chamar_rota(
        app,
        "POST",
        "/api/auth/password/reset/check",
        sessao_com_link(token),
        corpo={"token": TOKEN},
    )

    assert response.status_code == 422
    assert response.json() == {"error": "invalid_token"}


async def test_conferir_nao_gasta_o_link() -> None:
    token = link()
    sessao_falsa = sessao_com_link(token)

    await chamar_rota(
        app,
        "POST",
        "/api/auth/password/reset/check",
        sessao_falsa,
        corpo={"token": TOKEN},
    )

    assert token.used_at is None
    sessao_falsa.commit.assert_not_awaited()


# Salvar e entrar (A16b)


async def test_nova_senha_troca_a_senha_e_ja_entra() -> None:
    usuaria = katia()
    token = link()
    sessao_falsa = sessao_com_link(token, usuaria)

    response = await chamar_rota(
        app,
        "POST",
        "/api/auth/password/reset",
        sessao_falsa,
        corpo={"token": TOKEN, "password": "senha-nova-ficticia"},
    )

    assert response.status_code == 200
    assert response.json()["nextPath"] == "/coordenacao/acoes"
    assert "HttpOnly" in response.headers["set-cookie"]
    assert decode_access_token(token_do_cookie(response)) == 1
    assert usuaria.password_hash is not None
    assert verify_password("senha-nova-ficticia", usuaria.password_hash)
    assert token.used_at is not None


async def test_nova_senha_curta_nem_consulta_o_link() -> None:
    sessao_falsa = sessao_com_link(link())

    response = await chamar_rota(
        app,
        "POST",
        "/api/auth/password/reset",
        sessao_falsa,
        corpo={"token": TOKEN, "password": "curta"},
    )

    assert response.status_code == 422
    assert response.json() == {"error": "password_too_short"}
    sessao_falsa.scalar.assert_not_awaited()


@pytest.mark.parametrize("token", LINKS_QUE_NAO_VALEM)
async def test_nova_senha_com_link_que_nao_vale_nao_entra(
    token: PasswordResetToken | None,
) -> None:
    response = await chamar_rota(
        app,
        "POST",
        "/api/auth/password/reset",
        sessao_com_link(token),
        corpo={"token": TOKEN, "password": "senha-nova-ficticia"},
    )

    assert response.status_code == 422
    assert response.json() == {"error": "invalid_token"}
    assert SESSION_COOKIE not in response.headers.get("set-cookie", "")
