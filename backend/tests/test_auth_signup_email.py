"""Critérios de aceite do cadastro por e-mail (#51, #99).

O banco é uma sessão falsa, como nos outros testes. Nela, as consultas do
cadastro chegam nesta ordem: session.get(City) para a cidade e, em
session.scalar, o convite (só se veio um código), a usuária e o registro da
menina pelo e-mail. Dados fictícios.
"""

import logging
from datetime import UTC, date, datetime, timedelta
from typing import Any
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.main import app
from app.modules.cities.models import City
from app.modules.girls import utils as girls_utils
from app.modules.girls.models import Girl
from app.modules.groups.models import Group, Invite
from app.users.models import Role, User
from tests.helpers import chamar_rota

URL = "/api/auth/signup/email"
HOJE = date(2026, 11, 14)
MACEIO = City(id=2704302, name="Maceió", state="AL", search_name="maceio, al")
RENDEIRAS = Group(id=7, name="Rendeiras")

CADASTRO: dict[str, Any] = {
    "name": "Alana Ficticia",
    "email": "alana@exemplo.com",
    "password": "senha-ficticia",
    "birthDate": "2009-03-02",
    "cityId": "2704302",
}


@pytest.fixture(autouse=True)
def hoje_fixo(monkeypatch: pytest.MonkeyPatch) -> None:
    # A idade é calculada sobre "hoje em Maceió"; aqui hoje é sempre HOJE.
    monkeypatch.setattr(girls_utils, "today_in_maceio", lambda: HOJE)


def convite(expira_em: datetime) -> Invite:
    return Invite(
        id=1, code="codigo-ficticio", group_id=7, expires_at=expira_em, group=RENDEIRAS
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


def menina_gravada(sessao: AsyncMock) -> Girl:
    return next(item for item in gravados(sessao) if isinstance(item, Girl))


def assert_nada_gravado(sessao: AsyncMock) -> None:
    sessao.add.assert_not_called()
    sessao.flush.assert_not_awaited()
    sessao.commit.assert_not_awaited()


# --- Origem: com convite ou chegou sozinha ----------------------------------


async def test_sem_convite_a_origem_e_chegou_sozinha() -> None:
    # Sem código, não há consulta de convite: usuária e menina não existem.
    sessao = sessao_falsa([None, None])

    response = await chamar_rota(app, "POST", URL, sessao, corpo=CADASTRO)

    assert response.status_code == 201
    assert response.json()["nextStep"] == "terms"
    assert "HttpOnly" in response.headers["set-cookie"]

    girl = menina_gravada(sessao)
    assert girl.origin_group_id is None
    assert girl.user_id == 1
    assert girl.name == "Alana Ficticia"
    assert girl.birth_date == date(2009, 3, 2)
    assert girl.city_ibge_code == 2704302
    sessao.commit.assert_awaited_once()


async def test_com_convite_a_origem_e_o_grupo_do_convite() -> None:
    valido = convite(datetime.now(UTC) + timedelta(days=1))
    sessao = sessao_falsa([valido, None, None])

    response = await chamar_rota(
        app, "POST", URL, sessao, corpo={**CADASTRO, "invite": "codigo-ficticio"}
    )

    assert response.status_code == 201
    assert menina_gravada(sessao).origin_group_id == 7


@pytest.mark.parametrize(
    "achado",
    [None, convite(datetime.now(UTC) - timedelta(days=1))],
    ids=["codigo-que-nao-existe", "convite-vencido"],
)
async def test_convite_invalido_ou_vencido_e_recusado(achado: Invite | None) -> None:
    sessao = sessao_falsa([achado])

    response = await chamar_rota(
        app, "POST", URL, sessao, corpo={**CADASTRO, "invite": "codigo-ficticio"}
    )

    assert response.status_code == 422
    assert response.json() == {"error": "invalid_invite"}
    assert_nada_gravado(sessao)


# --- Registro importado e conta existente ------------------------------------


async def test_email_importado_ativa_o_registro_sem_criar_outro() -> None:
    importada = Girl(id=5, email="alana@exemplo.com", name="Nome Da Lista")
    sessao = sessao_falsa([None, importada])

    response = await chamar_rota(
        app,
        "POST",
        URL,
        sessao,
        corpo={**CADASTRO, "email": "Alana@Exemplo.com"},
    )

    assert response.status_code == 201
    # Só a usuária é nova; a menina é a importada, agora ligada à conta.
    novos = gravados(sessao)
    assert len(novos) == 1
    assert isinstance(novos[0], User)
    assert importada.user_id == 1
    assert importada.name == "Alana Ficticia"
    assert importada.birth_date == date(2009, 3, 2)
    assert importada.city_ibge_code == 2704302


async def test_email_com_conta_responde_409_sem_criar_outra() -> None:
    existente = User(
        id=3, email="alana@exemplo.com", name="Alana Ficticia", role=Role.GIRL
    )
    sessao = sessao_falsa([existente])

    response = await chamar_rota(app, "POST", URL, sessao, corpo=CADASTRO)

    assert response.status_code == 409
    assert "set-cookie" not in response.headers
    assert_nada_gravado(sessao)


async def test_registro_ja_ligado_a_outra_conta_responde_409() -> None:
    ligada = Girl(id=5, email="alana@exemplo.com", name="Alana Ficticia", user_id=3)
    sessao = sessao_falsa([None, ligada])

    response = await chamar_rota(app, "POST", URL, sessao, corpo=CADASTRO)

    assert response.status_code == 409
    assert_nada_gravado(sessao)


# --- Validação no servidor ---------------------------------------------------


async def test_cidade_fora_da_lista_do_ibge_e_recusada() -> None:
    sessao = sessao_falsa([], cidade=None)

    response = await chamar_rota(
        app, "POST", URL, sessao, corpo={**CADASTRO, "cityId": "9999999"}
    )

    assert response.status_code == 422
    assert response.json() == {"error": "invalid_city"}
    assert_nada_gravado(sessao)


@pytest.mark.parametrize(
    ("campo", "valor", "erro"),
    [
        ("email", "alana@gmail", "invalid_email"),
        ("email", "alana.exemplo.com", "invalid_email"),
        ("password", "1234567", "password_too_short"),
    ],
    ids=["email-sem-dominio", "email-sem-arroba", "senha-curta"],
)
async def test_dado_recusado_nem_consulta_o_banco(
    campo: str, valor: str, erro: str
) -> None:
    sessao = sessao_falsa([])

    response = await chamar_rota(
        app, "POST", URL, sessao, corpo={**CADASTRO, campo: valor}
    )

    assert response.status_code == 422
    assert response.json() == {"error": erro}
    sessao.get.assert_not_awaited()
    sessao.scalar.assert_not_awaited()
    assert_nada_gravado(sessao)


# --- Idade (RN-03, RF-F7.01) -------------------------------------------------


async def test_quem_faz_13_anos_hoje_cria_conta() -> None:
    sessao = sessao_falsa([None, None])

    response = await chamar_rota(
        app, "POST", URL, sessao, corpo={**CADASTRO, "birthDate": "2013-11-14"}
    )

    assert response.status_code == 201


@pytest.mark.parametrize(
    ("nascimento", "erro"),
    [("2013-11-15", "under_13"), ("2026-11-15", "invalid_birth_date")],
    ids=["12-anos-e-364-dias", "data-no-futuro"],
)
async def test_idade_recusada_nao_deixa_nada_no_banco_nem_nos_logs(
    nascimento: str, erro: str, caplog: pytest.LogCaptureFixture
) -> None:
    sessao = sessao_falsa([])
    caplog.set_level(logging.DEBUG)

    response = await chamar_rota(
        app, "POST", URL, sessao, corpo={**CADASTRO, "birthDate": nascimento}
    )

    assert response.status_code == 422
    # Só o código volta: nada do que ela preencheu.
    assert response.json() == {"error": erro}
    assert "set-cookie" not in response.headers
    # Recusada antes de qualquer consulta ou gravação.
    sessao.get.assert_not_awaited()
    sessao.scalar.assert_not_awaited()
    assert_nada_gravado(sessao)
    # E nenhum dado dela foi parar nos logs.
    for dado in ("Alana", "alana@exemplo.com", nascimento):
        assert dado not in caplog.text
