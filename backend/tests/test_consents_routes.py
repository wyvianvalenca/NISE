from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi.testclient import TestClient

from app.auth.utils import create_access_token
from app.main import app
from app.modules.consents.models import TermsAcceptance
from app.modules.consents.service import CURRENT_TERMS_VERSION, get_origin_group_name
from app.users.models import Role, User
from tests.helpers import chamar_rota, sessao_com

# Dados fictícios.


def alana(role: Role = Role.GIRL) -> User:
    return User(id=1, email="alana@exemplo.com", name="Alana Ficticia", role=role)


def sessao_da_menina(usuaria: User, grupo_de_origem: str | None) -> AsyncMock:
    # session.get(User, id) acha a usuária da sessão; session.scalar devolve o
    # nome do grupo de origem, ou None se ela chegou sozinha.
    sessao_falsa = sessao_com(usuaria)
    sessao_falsa.scalar.return_value = grupo_de_origem
    return sessao_falsa


# --- GET /api/terms/summary --------------------------------------------------


async def test_menina_do_convite_recebe_a_versao_do_grupo() -> None:
    # M1: a liderança do grupo que convidou vê os dados dela (RN-01).
    response = await chamar_rota(
        app,
        "GET",
        "/api/terms/summary",
        sessao_da_menina(alana(), "Rendeiras do Código"),
        token=create_access_token(1),
    )

    assert response.status_code == 200
    assert response.json() == {
        "version": CURRENT_TERMS_VERSION,
        "origin": {"kind": "group", "groupName": "Rendeiras do Código"},
    }


async def test_menina_que_chegou_sozinha_recebe_a_versao_da_nise() -> None:
    # M2: os grupos só veem números gerais (RN-04).
    response = await chamar_rota(
        app,
        "GET",
        "/api/terms/summary",
        sessao_da_menina(alana(), None),
        token=create_access_token(1),
    )

    assert response.status_code == 200
    assert response.json() == {
        "version": CURRENT_TERMS_VERSION,
        "origin": {"kind": "self"},
    }


async def test_resumo_sem_sessao_responde_401() -> None:
    response = await chamar_rota(
        app, "GET", "/api/terms/summary", sessao_da_menina(alana(), None)
    )

    assert response.status_code == 401


async def test_resumo_e_so_para_menina() -> None:
    coordenadora = alana(role=Role.COORDINATOR)
    sessao_falsa = sessao_da_menina(coordenadora, None)

    response = await chamar_rota(
        app,
        "GET",
        "/api/terms/summary",
        sessao_falsa,
        token=create_access_token(1),
    )

    assert response.status_code == 403
    sessao_falsa.scalar.assert_not_called()


async def test_grupo_de_origem_e_procurado_pela_menina_da_sessao() -> None:
    sessao_falsa = AsyncMock()
    sessao_falsa.scalar.return_value = None

    await get_origin_group_name(sessao_falsa, 1)

    consulta = sessao_falsa.scalar.call_args.args[0]
    sql = str(consulta.compile(compile_kwargs={"literal_binds": True}))
    assert "girls.origin_group_id = groups.id" in sql
    assert "girls.user_id = 1" in sql


def test_openapi_mostra_a_origem_em_camel_case(client: TestClient) -> None:
    schemas = client.get("/openapi.json").json()["components"]["schemas"]

    assert list(schemas["GroupOrigin"]["properties"]) == ["kind", "groupName"]


# --- POST /api/terms/acceptance ----------------------------------------------


def sessao_do_aceite(usuaria: User, aceite_existente: int | None) -> AsyncMock:
    # session.scalar procura o aceite da versão atual: o id dele, ou None.
    sessao_falsa = sessao_com(usuaria)
    sessao_falsa.scalar.return_value = aceite_existente
    # session.add é síncrono: com AsyncMock, viraria uma corrotina nunca aguardada.
    sessao_falsa.add = MagicMock()
    return sessao_falsa


async def test_aceite_da_versao_atual_e_gravado() -> None:
    # Alana, 15 anos, aceita sozinha, sem etapa de responsável (RF-F7.02).
    sessao_falsa = sessao_do_aceite(alana(), None)

    response = await chamar_rota(
        app,
        "POST",
        "/api/terms/acceptance",
        sessao_falsa,
        token=create_access_token(1),
        corpo={"version": CURRENT_TERMS_VERSION},
    )

    assert response.status_code == 204
    aceite = sessao_falsa.add.call_args.args[0]
    assert isinstance(aceite, TermsAcceptance)
    assert aceite.user_id == 1
    assert aceite.terms_version == CURRENT_TERMS_VERSION
    sessao_falsa.commit.assert_awaited_once()


async def test_aceite_repetido_nao_cria_outro_registro() -> None:
    sessao_falsa = sessao_do_aceite(alana(), 10)

    response = await chamar_rota(
        app,
        "POST",
        "/api/terms/acceptance",
        sessao_falsa,
        token=create_access_token(1),
        corpo={"version": CURRENT_TERMS_VERSION},
    )

    assert response.status_code == 204
    sessao_falsa.add.assert_not_called()
    sessao_falsa.commit.assert_not_called()


async def test_versao_antiga_e_recusada_sem_gravar() -> None:
    sessao_falsa = sessao_do_aceite(alana(), None)

    response = await chamar_rota(
        app,
        "POST",
        "/api/terms/acceptance",
        sessao_falsa,
        token=create_access_token(1),
        corpo={"version": "0.0-antiga"},
    )

    assert response.status_code == 409
    assert response.json() == {"error": "terms_outdated"}
    sessao_falsa.add.assert_not_called()
    sessao_falsa.commit.assert_not_called()


async def test_versao_comprida_demais_nem_chega_ao_banco() -> None:
    sessao_falsa = sessao_do_aceite(alana(), None)

    response = await chamar_rota(
        app,
        "POST",
        "/api/terms/acceptance",
        sessao_falsa,
        token=create_access_token(1),
        corpo={"version": "v" * 33},
    )

    assert response.status_code == 422
    sessao_falsa.add.assert_not_called()


async def test_aceite_sem_sessao_responde_401() -> None:
    sessao_falsa = sessao_do_aceite(alana(), None)

    response = await chamar_rota(
        app,
        "POST",
        "/api/terms/acceptance",
        sessao_falsa,
        corpo={"version": CURRENT_TERMS_VERSION},
    )

    assert response.status_code == 401
    sessao_falsa.add.assert_not_called()


async def test_aceite_e_so_para_menina() -> None:
    sessao_falsa = sessao_do_aceite(alana(role=Role.COORDINATOR), None)

    response = await chamar_rota(
        app,
        "POST",
        "/api/terms/acceptance",
        sessao_falsa,
        token=create_access_token(1),
        corpo={"version": CURRENT_TERMS_VERSION},
    )

    assert response.status_code == 403
    sessao_falsa.add.assert_not_called()


@pytest.mark.parametrize("metodo", ["PUT", "PATCH", "DELETE"])
async def test_aceite_nao_pode_ser_alterado_nem_apagado(metodo: str) -> None:
    # RNF-F7.01: não há rota para mudar um aceite. No banco, o trigger da
    # migração 765de25fc85a recusa UPDATE e DELETE.
    sessao_falsa = sessao_do_aceite(alana(), 10)

    response = await chamar_rota(
        app,
        metodo,
        "/api/terms/acceptance",
        sessao_falsa,
        token=create_access_token(1),
        corpo={"version": "0.0-antiga"},
    )

    assert response.status_code == 405
    sessao_falsa.add.assert_not_called()
    sessao_falsa.commit.assert_not_called()


# --- PUT /api/preferences/opportunity-emails ---------------------------------


def sessao_da_preferencia(usuaria: User, aceite: int | None = 10) -> AsyncMock:
    # session.scalar procura o aceite da versão atual dos termos: o id dele, ou
    # None. Por padrão ela já aceitou, como na Etapa 2.
    sessao_falsa = sessao_com(usuaria)
    sessao_falsa.scalar.return_value = aceite
    return sessao_falsa


@pytest.mark.parametrize("enabled", [True, False])
async def test_preferencia_de_oportunidades_e_gravada(enabled: bool) -> None:
    # A04·2: "Sim, quero receber" liga; "Não, obrigada" deixa desligada (RF-F7.06).
    usuaria = alana()
    usuaria.opportunity_emails = not enabled
    sessao_falsa = sessao_da_preferencia(usuaria)

    response = await chamar_rota(
        app,
        "PUT",
        "/api/preferences/opportunity-emails",
        sessao_falsa,
        token=create_access_token(1),
        corpo={"enabled": enabled},
    )

    assert response.status_code == 204
    assert usuaria.opportunity_emails is enabled
    assert usuaria.opportunity_emails_changed_at is not None
    sessao_falsa.commit.assert_awaited_once()


async def test_repetir_a_mesma_escolha_responde_204_sem_gravar() -> None:
    # Ela volta da Etapa 3 e escolhe de novo o que já tinha escolhido.
    usuaria = alana()
    usuaria.opportunity_emails = True
    sessao_falsa = sessao_da_preferencia(usuaria)

    response = await chamar_rota(
        app,
        "PUT",
        "/api/preferences/opportunity-emails",
        sessao_falsa,
        token=create_access_token(1),
        corpo={"enabled": True},
    )

    assert response.status_code == 204
    sessao_falsa.commit.assert_not_awaited()


@pytest.mark.parametrize("corpo", [{}, {"enabled": "false"}, {"enabled": None}])
async def test_escolha_invalida_e_recusada_sem_gravar(corpo: dict[str, object]) -> None:
    # StrictBool: o texto "false" viraria True se fosse aceito.
    usuaria = alana()
    usuaria.opportunity_emails = False
    sessao_falsa = sessao_da_preferencia(usuaria)

    response = await chamar_rota(
        app,
        "PUT",
        "/api/preferences/opportunity-emails",
        sessao_falsa,
        token=create_access_token(1),
        corpo=corpo,
    )

    assert response.status_code == 422
    assert usuaria.opportunity_emails is False
    sessao_falsa.commit.assert_not_awaited()


def test_openapi_mostra_a_rota_da_preferencia(client: TestClient) -> None:
    # O front escreve o tipo à mão a partir do OpenAPI (frontend/lib/signup-api.ts).
    openapi = client.get("/openapi.json").json()

    rota = openapi["paths"]["/api/preferences/opportunity-emails"]
    assert list(rota) == ["put"]
    schema = openapi["components"]["schemas"]["OpportunityEmailsIn"]
    assert schema["properties"]["enabled"]["type"] == "boolean"
    assert schema["required"] == ["enabled"]


# Permissões (RNF-G.03): só a menina logada, com os termos aceitos, muda a
# própria preferência.


async def test_preferencia_sem_sessao_responde_401() -> None:
    usuaria = alana()
    usuaria.opportunity_emails = False
    sessao_falsa = sessao_da_preferencia(usuaria)

    response = await chamar_rota(
        app,
        "PUT",
        "/api/preferences/opportunity-emails",
        sessao_falsa,
        corpo={"enabled": True},
    )

    assert response.status_code == 401
    assert usuaria.opportunity_emails is False
    sessao_falsa.commit.assert_not_awaited()


async def test_preferencia_e_so_para_menina() -> None:
    coordenadora = alana(role=Role.COORDINATOR)
    coordenadora.opportunity_emails = False
    sessao_falsa = sessao_da_preferencia(coordenadora)

    response = await chamar_rota(
        app,
        "PUT",
        "/api/preferences/opportunity-emails",
        sessao_falsa,
        token=create_access_token(1),
        corpo={"enabled": True},
    )

    assert response.status_code == 403
    assert coordenadora.opportunity_emails is False
    sessao_falsa.commit.assert_not_awaited()


async def test_preferencia_sem_aceite_dos_termos_responde_403() -> None:
    # O front lê o código e leva ela de volta à A04·1.
    usuaria = alana()
    usuaria.opportunity_emails = False
    sessao_falsa = sessao_da_preferencia(usuaria, aceite=None)

    response = await chamar_rota(
        app,
        "PUT",
        "/api/preferences/opportunity-emails",
        sessao_falsa,
        token=create_access_token(1),
        corpo={"enabled": True},
    )

    assert response.status_code == 403
    assert response.json() == {"error": "terms_not_accepted"}
    assert usuaria.opportunity_emails is False
    sessao_falsa.commit.assert_not_awaited()


async def test_preferencia_muda_so_a_da_menina_da_sessao() -> None:
    # Sem id na URL nem no corpo: um id a mais no corpo é ignorado, e a rota
    # busca só a usuária do token.
    usuaria = alana()
    usuaria.opportunity_emails = False
    sessao_falsa = sessao_da_preferencia(usuaria)

    response = await chamar_rota(
        app,
        "PUT",
        "/api/preferences/opportunity-emails",
        sessao_falsa,
        token=create_access_token(1),
        corpo={"enabled": True, "user_id": 2},
    )

    assert response.status_code == 204
    sessao_falsa.get.assert_awaited_once_with(User, 1)
    assert usuaria.opportunity_emails is True
