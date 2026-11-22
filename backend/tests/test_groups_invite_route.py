from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock

from fastapi.testclient import TestClient

from app.main import app
from app.modules.groups.models import Group, Invite
from tests.helpers import chamar_rota

RENDEIRAS = Group(id=7, name="Rendeiras")


def convite(expira_em: datetime) -> Invite:
    return Invite(
        id=1, code="codigo-ficticio", group_id=7, expires_at=expira_em, group=RENDEIRAS
    )


def sessao_que_acha(achado: Invite | None) -> AsyncMock:
    # session.scalar(select(Invite)...) devolve o convite, ou None.
    sessao_falsa = AsyncMock()
    sessao_falsa.scalar.return_value = achado
    return sessao_falsa


async def test_convite_valido_mostra_so_o_nome_do_grupo() -> None:
    # Sem cookie de sessão: a rota é pública.
    amanha = datetime.now(UTC) + timedelta(days=1)

    response = await chamar_rota(
        app, "GET", "/api/invites/codigo-ficticio", sessao_que_acha(convite(amanha))
    )

    assert response.status_code == 200
    # Nada além do nome do grupo: nem e-mail, nem código, nem ids.
    assert response.json() == {"groupName": "Rendeiras"}


async def test_codigo_que_nao_existe_responde_404() -> None:
    response = await chamar_rota(
        app, "GET", "/api/invites/nao-existe", sessao_que_acha(None)
    )

    assert response.status_code == 404


async def test_convite_vencido_responde_410() -> None:
    ontem = datetime.now(UTC) - timedelta(days=1)

    response = await chamar_rota(
        app, "GET", "/api/invites/codigo-ficticio", sessao_que_acha(convite(ontem))
    )

    assert response.status_code == 410


async def test_codigo_comprido_demais_nem_chega_ao_banco() -> None:
    sessao_falsa = sessao_que_acha(None)

    response = await chamar_rota(app, "GET", "/api/invites/" + "a" * 65, sessao_falsa)

    assert response.status_code == 422
    sessao_falsa.scalar.assert_not_called()


def test_openapi_mostra_o_campo_em_camel_case(client: TestClient) -> None:
    schema = client.get("/openapi.json").json()["components"]["schemas"]["InviteOut"]

    assert list(schema["properties"]) == ["groupName"]
