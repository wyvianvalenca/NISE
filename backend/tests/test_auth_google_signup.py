"""Cadastro pelo Google depois do callback (#52, #100): A02b e A02c.

O cadastro pendente vive no cookie httpOnly que o callback grava. Aqui ele é
montado com create_pending_signup_token. O banco é uma sessão falsa, como nos
outros testes. Ao completar o cadastro, as consultas chegam nesta ordem:
session.get(City) para a cidade e, em session.scalar, o convite (só se houver
um), a conta pelo Google, a conta pelo e-mail e o registro da menina pelo
e-mail. Dados fictícios.
"""

import logging
from collections.abc import AsyncGenerator, Mapping
from datetime import UTC, date, datetime, timedelta
from typing import Any
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import FastAPI
from httpx2 import ASGITransport, AsyncClient, Response
from sqlalchemy.exc import IntegrityError

from app.auth.google import GoogleProfile
from app.auth.permissions import PENDING_SIGNUP_COOKIE, SESSION_COOKIE, GirlDep
from app.auth.utils import (
    PendingSignup,
    create_access_token,
    create_pending_signup_token,
    decode_access_token,
)
from app.db.engine import get_session
from app.main import app
from app.modules.cities.models import City
from app.modules.girls import utils as girls_utils
from app.modules.girls.models import Girl
from app.modules.groups.models import Group, Invite
from app.users.models import OAuthAccount, Provider, Role, User

# Com maiúsculas, para conferir que a conta grava o e-mail normalizado.
PERFIL = GoogleProfile(
    subject="google-123", email="Alana@Exemplo.com", name="Alana Ficticia"
)
PENDENTE = create_pending_signup_token(
    PendingSignup(profile=PERFIL, invite="convite-ficticio")
)
PENDENTE_SEM_CONVITE = create_pending_signup_token(PendingSignup(profile=PERFIL))

COMPLETAR = "/api/auth/signup/complete"
HOJE = date(2026, 11, 14)
MACEIO = City(id=2704302, name="Maceió", state="AL", search_name="maceio, al")
RENDEIRAS = Group(id=7, name="Rendeiras")
DADOS: dict[str, Any] = {"birthDate": "2009-03-02", "cityId": "2704302"}


@pytest.fixture(autouse=True)
def hoje_fixo(monkeypatch: pytest.MonkeyPatch) -> None:
    # A idade é calculada sobre "hoje em Maceió"; aqui hoje é sempre HOJE.
    monkeypatch.setattr(girls_utils, "today_in_maceio", lambda: HOJE)


async def chamar(
    metodo: str,
    url: str,
    pendente: str | None = PENDENTE,
    sessao: AsyncMock | None = None,
    corpo: Mapping[str, object] | None = None,
) -> Response:
    # Troca a sessão real por uma falsa, para o teste não depender do Postgres.
    async def trocar_sessao() -> AsyncGenerator[AsyncMock, None]:
        yield sessao or sessao_falsa([])

    app.dependency_overrides[get_session] = trocar_sessao
    cookies = {PENDING_SIGNUP_COOKIE: pendente} if pendente else {}
    try:
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://teste", cookies=cookies
        ) as client:
            return await client.request(metodo, url, json=corpo)
    finally:
        app.dependency_overrides.clear()


def convite(expira_em: datetime) -> Invite:
    return Invite(
        id=1,
        code="convite-ficticio",
        group_id=7,
        expires_at=expira_em,
        group=RENDEIRAS,
    )


def _dar_id(objeto: object) -> None:
    # O banco daria o id no flush; aqui damos no add, para o token e o vínculo.
    if isinstance(objeto, User):
        objeto.id = 1


def sessao_falsa(
    achados: list[object | None], cidade: City | None = MACEIO
) -> AsyncMock:
    sessao = AsyncMock()
    sessao.get.return_value = cidade
    sessao.scalar.side_effect = achados
    sessao.add = MagicMock(side_effect=_dar_id)
    return sessao


def gravados(sessao: AsyncMock) -> list[object]:
    return [chamada.args[0] for chamada in sessao.add.call_args_list]


def gravado(sessao: AsyncMock, tipo: type[Any]) -> Any:
    return next(item for item in gravados(sessao) if isinstance(item, tipo))


def assert_nada_gravado(sessao: AsyncMock) -> None:
    sessao.add.assert_not_called()
    sessao.flush.assert_not_awaited()
    sessao.commit.assert_not_awaited()


def cookies_gravados(response: Response) -> dict[str, str]:
    # Nome do cookie -> o cabeçalho Set-Cookie inteiro dele.
    return {
        cabecalho.split("=", 1)[0]: cabecalho
        for cabecalho in response.headers.get_list("set-cookie")
    }


def corrida() -> IntegrityError:
    return IntegrityError("INSERT INTO ...", {}, Exception("valor duplicado"))


# GET /api/auth/signup/pending


async def test_pendente_devolve_nome_e_email_do_google() -> None:
    response = await chamar("GET", "/api/auth/signup/pending")

    assert response.status_code == 200
    # Só o que ela já viu no Google: o convite não sai do cookie.
    assert response.json() == {"name": "Alana Ficticia", "email": "alana@exemplo.com"}


async def test_sem_cookie_nao_ha_cadastro_pendente() -> None:
    response = await chamar("GET", "/api/auth/signup/pending", pendente=None)

    assert response.status_code == 404


async def test_cookie_adulterado_nao_vale() -> None:
    response = await chamar("GET", "/api/auth/signup/pending", PENDENTE + "x")

    assert response.status_code == 404


async def test_token_de_sessao_nao_vale_como_cadastro_pendente() -> None:
    response = await chamar("GET", "/api/auth/signup/pending", create_access_token(1))

    assert response.status_code == 404


# POST /api/auth/signup/discard


async def test_descartar_apaga_o_cookie_pendente() -> None:
    response = await chamar("POST", "/api/auth/signup/discard")

    assert response.status_code == 204
    cookie = response.headers["set-cookie"]
    assert cookie.startswith(f'{PENDING_SIGNUP_COOKIE}="";')
    assert "Max-Age=0" in cookie
    # No mesmo Path em que o callback gravou, senão o navegador não apaga.
    assert "Path=/;" in cookie


async def test_descartar_sem_cadastro_pendente_tambem_responde_204() -> None:
    response = await chamar("POST", "/api/auth/signup/discard", pendente=None)

    assert response.status_code == 204


# POST /api/auth/signup/complete: conta nova


async def test_completar_cria_a_conta_ligada_ao_google() -> None:
    # Sem convite no token: a conta pelo Google, pelo e-mail e a menina não existem.
    sessao = sessao_falsa([None, None, None])

    response = await chamar(
        "POST", COMPLETAR, PENDENTE_SEM_CONVITE, sessao, corpo=DADOS
    )

    assert response.status_code == 201
    assert response.json()["nextStep"] == "terms"

    usuaria = gravado(sessao, User)
    assert usuaria.name == "Alana Ficticia"
    assert usuaria.email == "alana@exemplo.com"
    # Conta só do Google: sem senha.
    assert usuaria.password_hash is None
    assert usuaria.role == Role.GIRL

    ligacao = gravado(sessao, OAuthAccount)
    assert ligacao.user_id == 1
    assert ligacao.provider == Provider.GOOGLE
    assert ligacao.provider_user_id == "google-123"

    girl = gravado(sessao, Girl)
    assert girl.email == "alana@exemplo.com"
    assert girl.user_id == 1
    assert girl.name == "Alana Ficticia"
    assert girl.birth_date == date(2009, 3, 2)
    assert girl.city_ibge_code == 2704302
    assert girl.origin_group_id is None
    sessao.commit.assert_awaited_once()


async def test_completar_abre_a_sessao_e_apaga_o_cadastro_pendente() -> None:
    sessao = sessao_falsa([None, None, None])

    response = await chamar(
        "POST", COMPLETAR, PENDENTE_SEM_CONVITE, sessao, corpo=DADOS
    )

    cookies = cookies_gravados(response)
    assert "HttpOnly" in cookies[SESSION_COOKIE]
    token = cookies[SESSION_COOKIE].split(";", 1)[0].split("=", 1)[1]
    assert decode_access_token(token) == 1
    assert "Max-Age=0" in cookies[PENDING_SIGNUP_COOKIE]


async def test_completar_pega_o_id_com_flush_antes_da_ligacao() -> None:
    # Sem o flush, a usuária ainda não teria id para a ligação com o Google.
    sessao = sessao_falsa([None, None, None])

    await chamar("POST", COMPLETAR, PENDENTE_SEM_CONVITE, sessao, corpo=DADOS)

    chamadas = [
        nome for nome, _, _ in sessao.mock_calls if nome in ("add", "flush", "commit")
    ]
    assert chamadas == ["add", "add", "flush", "add", "commit"]


# Origem: o convite que atravessou o Google (RN-29)


async def test_com_convite_a_origem_e_o_grupo_do_convite() -> None:
    valido = convite(datetime.now(UTC) + timedelta(days=1))
    sessao = sessao_falsa([valido, None, None, None])

    response = await chamar("POST", COMPLETAR, PENDENTE, sessao, corpo=DADOS)

    assert response.status_code == 201
    assert gravado(sessao, Girl).origin_group_id == 7


@pytest.mark.parametrize(
    "achado",
    [None, convite(datetime.now(UTC) - timedelta(days=1))],
    ids=["codigo-que-nao-existe", "convite-vencido"],
)
async def test_convite_invalido_ou_vencido_e_recusado(achado: Invite | None) -> None:
    sessao = sessao_falsa([achado])

    response = await chamar("POST", COMPLETAR, PENDENTE, sessao, corpo=DADOS)

    assert response.status_code == 422
    assert response.json() == {"error": "invalid_invite"}
    assert_nada_gravado(sessao)
    # O cadastro pendente fica: a tela avisa e ela segue sem o convite.
    assert "set-cookie" not in response.headers


async def test_sem_o_convite_vencido_ela_segue_como_quem_chegou_sozinha() -> None:
    # Nem consulta o convite: a primeira busca já é a conta pelo Google.
    sessao = sessao_falsa([None, None, None])

    response = await chamar(
        "POST",
        COMPLETAR,
        PENDENTE,
        sessao,
        corpo={**DADOS, "withoutInvite": True},
    )

    assert response.status_code == 201
    assert gravado(sessao, Girl).origin_group_id is None
    assert sessao.scalar.await_count == 3


# Registro importado e conta existente


async def test_email_importado_ativa_o_registro_sem_criar_outro() -> None:
    importada = Girl(id=5, email="alana@exemplo.com", name="Nome Da Lista")
    sessao = sessao_falsa([None, None, importada])

    response = await chamar(
        "POST", COMPLETAR, PENDENTE_SEM_CONVITE, sessao, corpo=DADOS
    )

    assert response.status_code == 201
    # Só a usuária e a ligação são novas; a menina é a importada (RF-F2.02).
    assert [type(item) for item in gravados(sessao)] == [User, OAuthAccount]
    assert importada.user_id == 1
    # O nome do Google vale mais que o da lista.
    assert importada.name == "Alana Ficticia"
    assert importada.birth_date == date(2009, 3, 2)
    assert importada.city_ibge_code == 2704302


@pytest.mark.parametrize(
    "achados",
    [
        [User(id=3, email="alana@exemplo.com", name="Alana", role=Role.GIRL)],
        [None, User(id=3, email="alana@exemplo.com", name="Alana", role=Role.GIRL)],
        [None, None, Girl(id=5, email="alana@exemplo.com", name="Alana", user_id=3)],
    ],
    ids=["ja-ligada-ao-google", "email-com-conta", "registro-de-outra-conta"],
)
async def test_conta_que_ja_existe_responde_409_sem_criar_outra(
    achados: list[object | None],
) -> None:
    # Ex.: ela completou o cadastro em outra aba.
    sessao = sessao_falsa(achados)

    response = await chamar(
        "POST", COMPLETAR, PENDENTE_SEM_CONVITE, sessao, corpo=DADOS
    )

    assert response.status_code == 409
    assert SESSION_COOKIE not in cookies_gravados(response)
    assert_nada_gravado(sessao)


@pytest.mark.parametrize("etapa", ["flush", "commit"])
async def test_corrida_entre_duas_abas_responde_409(etapa: str) -> None:
    # O índice único do e-mail barra no flush; o da ligação, no commit.
    sessao = sessao_falsa([None, None, None])
    getattr(sessao, etapa).side_effect = corrida()

    response = await chamar(
        "POST", COMPLETAR, PENDENTE_SEM_CONVITE, sessao, corpo=DADOS
    )

    assert response.status_code == 409
    sessao.rollback.assert_awaited_once()
    assert SESSION_COOKIE not in cookies_gravados(response)


# Validação no servidor


async def test_cidade_fora_da_lista_do_ibge_e_recusada() -> None:
    sessao = sessao_falsa([], cidade=None)

    response = await chamar(
        "POST", COMPLETAR, PENDENTE, sessao, corpo={**DADOS, "cityId": "9999999"}
    )

    assert response.status_code == 422
    assert response.json() == {"error": "invalid_city"}
    assert_nada_gravado(sessao)


async def test_sem_cadastro_pendente_responde_404() -> None:
    sessao = sessao_falsa([])

    response = await chamar("POST", COMPLETAR, None, sessao, corpo=DADOS)

    assert response.status_code == 404
    sessao.get.assert_not_awaited()
    assert_nada_gravado(sessao)


# Idade (RN-03, RF-F7.01)


async def test_quem_faz_13_anos_hoje_cria_conta() -> None:
    sessao = sessao_falsa([None, None, None])

    response = await chamar(
        "POST",
        COMPLETAR,
        PENDENTE_SEM_CONVITE,
        sessao,
        corpo={**DADOS, "birthDate": "2013-11-14"},
    )

    assert response.status_code == 201


async def test_menor_de_13_descarta_o_cadastro_pendente(
    caplog: pytest.LogCaptureFixture,
) -> None:
    sessao = sessao_falsa([])
    caplog.set_level(logging.DEBUG)

    response = await chamar(
        "POST", COMPLETAR, PENDENTE, sessao, corpo={**DADOS, "birthDate": "2013-11-15"}
    )

    assert response.status_code == 422
    assert response.json() == {"error": "under_13"}
    cookies = cookies_gravados(response)
    # O que veio do Google some já aqui, sem esperar o front (RN-03).
    assert "Max-Age=0" in cookies[PENDING_SIGNUP_COOKIE]
    assert SESSION_COOKIE not in cookies
    # Recusada antes de qualquer consulta ou gravação.
    sessao.get.assert_not_awaited()
    sessao.scalar.assert_not_awaited()
    assert_nada_gravado(sessao)
    for dado in ("Alana", "alana@exemplo.com", "2013-11-15"):
        assert dado not in caplog.text


async def test_data_impossivel_pede_correcao_sem_descartar_o_cadastro() -> None:
    # Data no futuro: ela corrige o campo sem perder o que veio do Google.
    sessao = sessao_falsa([])

    response = await chamar(
        "POST", COMPLETAR, PENDENTE, sessao, corpo={**DADOS, "birthDate": "2026-11-15"}
    )

    assert response.status_code == 422
    assert response.json() == {"error": "invalid_birth_date"}
    assert "set-cookie" not in response.headers
    assert_nada_gravado(sessao)


# Perfil incompleto: o cadastro pendente não é uma sessão (#52)

# App só de teste, como em test_auth_permissions.py: ainda não há rota real
# só da menina, e uma rota de teste no app real iria para o OpenAPI.
app_da_menina = FastAPI()


@app_da_menina.get("/so-menina")
async def so_menina(user: GirlDep) -> dict[str, int]:
    return {"id": user.id}


async def chamar_com_cookies(
    aplicacao: FastAPI, url: str, cookies: dict[str, str], sessao: AsyncMock
) -> Response:
    async def trocar_sessao() -> AsyncGenerator[AsyncMock, None]:
        yield sessao

    aplicacao.dependency_overrides[get_session] = trocar_sessao
    try:
        async with AsyncClient(
            transport=ASGITransport(app=aplicacao),
            base_url="http://teste",
            cookies=cookies,
        ) as client:
            return await client.get(url)
    finally:
        aplicacao.dependency_overrides.clear()


ROTAS_PROTEGIDAS = pytest.mark.parametrize(
    ("aplicacao", "url"),
    [(app, "/api/auth/me"), (app_da_menina, "/so-menina")],
    ids=["me", "rota-da-menina"],
)


@ROTAS_PROTEGIDAS
async def test_com_cadastro_pendente_as_rotas_pedem_para_completar(
    aplicacao: FastAPI, url: str
) -> None:
    # Até informar a data e a cidade, ela não tem conta nem sessão.
    sessao = sessao_falsa([])

    response = await chamar_com_cookies(
        aplicacao, url, {PENDING_SIGNUP_COOKIE: PENDENTE}, sessao
    )

    assert response.status_code == 401
    assert response.json() == {"detail": "Cadastro incompleto"}
    sessao.get.assert_not_awaited()


@ROTAS_PROTEGIDAS
@pytest.mark.parametrize(
    "cookies",
    [{SESSION_COOKIE: PENDENTE}, {PENDING_SIGNUP_COOKIE: PENDENTE + "x"}],
    ids=["pendente-no-lugar-da-sessao", "pendente-adulterado"],
)
async def test_cadastro_pendente_nao_vale_como_sessao(
    aplicacao: FastAPI, url: str, cookies: dict[str, str]
) -> None:
    sessao = sessao_falsa([])

    response = await chamar_com_cookies(aplicacao, url, cookies, sessao)

    assert response.status_code == 401
    assert response.json() == {"detail": "Não autenticada"}
    sessao.get.assert_not_awaited()


async def test_quem_tem_sessao_entra_mesmo_com_cadastro_pendente_antigo() -> None:
    # Ex.: ela entrou com outra conta e o cookie pendente ainda não venceu.
    usuaria = User(id=1, email="alana@exemplo.com", name="Alana", role=Role.GIRL)
    sessao = sessao_falsa([])
    sessao.get.return_value = usuaria

    response = await chamar_com_cookies(
        app_da_menina,
        "/so-menina",
        {SESSION_COOKIE: create_access_token(1), PENDING_SIGNUP_COOKIE: PENDENTE},
        sessao,
    )

    assert response.status_code == 200
    assert response.json() == {"id": 1}
