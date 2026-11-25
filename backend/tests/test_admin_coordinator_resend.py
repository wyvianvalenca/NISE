"""AD02 Reenviar convite (#457, RF-S2.25, RN-35, RNF-S2.02, RNF-G.03).

Rodam com `db_session` (Postgres de teste). Dados fictícios. O envio de e-mail é
trocado por um falso: nenhum e-mail sai. Cada teste diz o critério que cobre.
"""

import logging
import re
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.utils import create_access_token
from app.main import app
from app.modules.admin.schemas import CoordinatorStatus
from app.modules.admin.service import list_coordinators
from app.modules.groups.coordinator_invites import hash_invite_token
from app.modules.groups.models import CoordinatorInvite, Group
from app.users.models import Role
from tests.helpers import chamar_rota
from tests.test_admin_coordinator_invites import (
    EmailFalso,
    cidades,
    convidar,
    corpo_grupo_novo,
    email,  # fixture
    equipe,
    usuaria,
)

__all__ = ["email"]


async def reenviar(
    sessao: AsyncSession, token: str, invite_id: int
) -> "tuple[int, dict[str, object]]":
    response = await chamar_rota(
        app,
        "POST",
        f"/api/admin/coordinators/invites/{invite_id}/resend",
        sessao,
        token=token,
    )
    return response.status_code, response.json()


async def convite_enviado(sessao: AsyncSession, token: str) -> CoordinatorInvite:
    await cidades(sessao)
    await convidar(sessao, token, corpo_grupo_novo())
    convite: CoordinatorInvite | None = await sessao.scalar(select(CoordinatorInvite))
    assert convite is not None
    return convite


def link_do_email(enviado: tuple[str, str, str]) -> str:
    return enviado[2].split("token=")[1].split()[0]


def sem_link_nem_data(texto: str) -> str:
    texto = re.sub(r"https?://\S+", "<link>", texto)
    return re.sub(r"\d{2}/\d{2}/\d{4}", "<data>", texto)


# Critério: "Reenviar" cria um link novo, válido por 7 dias a partir de agora, e
# manda o e-mail de novo ao mesmo endereço, mesmo grupo, mesmos textos; a
# coordenadora segue uma vez só na lista, com "Convite enviado" e a nova data.
@pytest.mark.parametrize("vencido", [False, True])
async def test_reenvia_com_link_novo_de_7_dias(
    db_session: AsyncSession, email: EmailFalso, vencido: bool
) -> None:
    token = await equipe(db_session)
    convite = await convite_enviado(db_session, token)
    if vencido:
        convite.expires_at = datetime.now(UTC) - timedelta(days=2)
        await db_session.flush()

    codigo, corpo = await reenviar(db_session, token, convite.id)

    assert codigo == 200
    assert corpo["first_name"] == "Carla"
    assert corpo["email_sent"] is True
    vence = datetime.fromisoformat(str(corpo["expires_at"]))
    assert abs(vence - (datetime.now(UTC) + timedelta(days=7))) < timedelta(minutes=1)
    primeiro, segundo = email.enviados
    assert segundo[0] == primeiro[0] == "carla@exemplo.org"
    assert segundo[1] == primeiro[1]
    assert sem_link_nem_data(segundo[2]) == sem_link_nem_data(primeiro[2])
    assert "Rendeiras do Código" in segundo[2]

    linhas = (await list_coordinators(db_session)).items
    assert [(r.status, r.date) for r in linhas] == [
        (CoordinatorStatus.INVITE_SENT, vence)
    ]


# Critério (RN-35, RNF-S2.02): o link enviado antes deixa de funcionar; só o
# hash do novo fica no banco; reenviar de novo troca outra vez (sem limite).
async def test_link_antigo_deixa_de_valer(
    db_session: AsyncSession, email: EmailFalso
) -> None:
    token = await equipe(db_session)
    convite = await convite_enviado(db_session, token)

    await reenviar(db_session, token, convite.id)
    await reenviar(db_session, token, convite.id)

    links = [link_do_email(e) for e in email.enviados]
    assert len(set(links)) == 3
    hashes = (await db_session.scalars(select(CoordinatorInvite.token_hash))).all()
    assert list(hashes) == [hash_invite_token(links[-1])]


# Critério (RN-35): se o e-mail já tem conta agora, nada é enviado nem trocado.
async def test_email_com_conta_agora_nao_reenvia(
    db_session: AsyncSession, email: EmailFalso
) -> None:
    token = await equipe(db_session)
    convite = await convite_enviado(db_session, token)
    antes = convite.token_hash
    conta = await usuaria(db_session, "Carla Ficticia", Role.GIRL)
    conta.email = "carla@exemplo.org"
    await db_session.flush()
    enviados = len(email.enviados)

    codigo, corpo = await reenviar(db_session, token, convite.id)

    assert (codigo, corpo) == (409, {"error": "email_has_account"})
    assert len(email.enviados) == enviados
    await db_session.refresh(convite)
    assert convite.token_hash == antes


# Critério: convite que não existe, já aceito ou cancelado não é reenviado.
@pytest.mark.parametrize("estado", ["inexistente", "aceito", "cancelado"])
async def test_convite_que_nao_esta_na_lista_nao_reenvia(
    db_session: AsyncSession, email: EmailFalso, estado: str
) -> None:
    token = await equipe(db_session)
    convite = await convite_enviado(db_session, token)
    if estado == "aceito":
        convite.accepted_at = datetime.now(UTC)
    elif estado == "cancelado":
        convite.cancelled_at = datetime.now(UTC)
    await db_session.flush()
    alvo = 0 if estado == "inexistente" else convite.id
    enviados = len(email.enviados)

    codigo, corpo = await reenviar(db_session, token, alvo)

    assert (codigo, corpo) == (404, {"error": "invite_not_found"})
    assert len(email.enviados) == enviados


# Critério: se o e-mail não sai, o convite fica na lista (com "Reenviar") e a
# resposta avisa para a equipe ver o alerta.
async def test_falha_no_envio_mantem_o_convite(
    db_session: AsyncSession, email: EmailFalso
) -> None:
    token = await equipe(db_session)
    convite = await convite_enviado(db_session, token)
    email.falha = OSError("recusou")

    codigo, corpo = await reenviar(db_session, token, convite.id)

    assert codigo == 200
    assert corpo["email_sent"] is False
    assert corpo["first_name"] == "Carla"
    total = await db_session.scalar(select(func.count()).select_from(CoordinatorInvite))
    assert total == 1
    assert await db_session.scalar(select(func.count()).select_from(Group)) == 1
    linhas = (await list_coordinators(db_session)).items
    assert [r.status for r in linhas] == [CoordinatorStatus.INVITE_SENT]


# Critério: o nome e o e-mail da coordenadora não aparecem nos logs.
async def test_logs_sem_nome_nem_email(
    db_session: AsyncSession,
    email: EmailFalso,
    caplog: pytest.LogCaptureFixture,
) -> None:
    token = await equipe(db_session)
    convite = await convite_enviado(db_session, token)
    email.falha = OSError("recusou carla@exemplo.org Carla Ficticia")

    with caplog.at_level(logging.DEBUG):
        await reenviar(db_session, token, convite.id)

    assert "OSError" in caplog.text
    assert "carla@exemplo.org" not in caplog.text
    assert "Carla" not in caplog.text


# Critério (RNF-G.03): coordenadora e menina são negadas por requisição direta,
# e sem sessão também; o link não muda e nada é enviado.
@pytest.mark.parametrize("papel", [Role.COORDINATOR, Role.GIRL])
async def test_so_a_equipe_reenvia(
    db_session: AsyncSession, email: EmailFalso, papel: Role
) -> None:
    convite = await convite_enviado(db_session, await equipe(db_session))
    antes = convite.token_hash
    user = await usuaria(db_session, "Ivone Ficticia", papel)
    enviados = len(email.enviados)

    codigo, _ = await reenviar(db_session, create_access_token(user.id), convite.id)
    sem_sessao = await chamar_rota(
        app, "POST", f"/api/admin/coordinators/invites/{convite.id}/resend", db_session
    )

    assert codigo == 403
    assert sem_sessao.status_code == 401
    assert len(email.enviados) == enviados
    await db_session.refresh(convite)
    assert convite.token_hash == antes
