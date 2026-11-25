"""CV04, CV05, CV06: por que o link do convite da coordenadora não funciona (#458).

Rodam com `db_session` (Postgres de teste). Dados fictícios. Cada teste diz o
critério que cobre. As telas leem só o código de `error`: nenhum corpo de erro
traz dado do grupo, da coordenadora ou de ninguém.
"""

from datetime import UTC, datetime, timedelta

from sqlalchemy.ext.asyncio import AsyncSession

from app.main import app
from app.modules.groups.coordinator_invites import resend_coordinator_invite
from app.users.models import Role, User
from tests.helpers import chamar_rota
from tests.test_auth_coordinator_signup import (
    CHECK,
    EMAIL,
    TOKEN,
    cadastrar,
    convite,
    coordenadoras,
)


async def conferir(sessao: AsyncSession, token: str = TOKEN) -> tuple[int, object]:
    response = await chamar_rota(app, "POST", CHECK, sessao, corpo={"token": token})
    return response.status_code, response.json()


# Critério: link com mais de 7 dias abre "Esse convite expirou"; nenhuma conta nasce.
async def test_link_vencido_e_expirado_e_nao_cria_conta(
    db_session: AsyncSession,
) -> None:
    await convite(db_session, vence_em=timedelta(seconds=-1))

    assert await conferir(db_session) == (410, {"error": "invite_expired"})
    criar = await cadastrar(db_session)
    assert (criar.status_code, criar.json()) == (410, {"error": "invite_expired"})
    assert await coordenadoras(db_session) == 0


# Critério: link que já virou conta abre "Esse convite já foi usado"; sem 2ª conta.
async def test_link_usado_diz_que_ja_foi_usado(db_session: AsyncSession) -> None:
    invite = await convite(db_session)
    invite.accepted_at = datetime.now(UTC)
    await db_session.flush()

    assert await conferir(db_session) == (410, {"error": "invite_used"})
    criar = await cadastrar(db_session)
    assert (criar.status_code, criar.json()) == (410, {"error": "invite_used"})
    assert await coordenadoras(db_session) == 0


# Critério: link válido para e-mail que já tem conta (menina ou coordenadora)
# abre "Você já tem conta na NISE"; nada é criado ou promovido (RN-35, D-118).
async def test_email_com_conta_nao_vira_coordenadora(
    db_session: AsyncSession,
) -> None:
    await convite(db_session)
    existente = User(email=EMAIL, name="Já Existia", role=Role.GIRL)
    db_session.add(existente)
    await db_session.flush()

    assert await conferir(db_session) == (409, {"error": "email_has_account"})
    criar = await cadastrar(db_session)
    assert (criar.status_code, criar.json()) == (409, {"error": "email_has_account"})
    assert existente.role == Role.GIRL
    assert await coordenadoras(db_session) == 0


async def test_email_de_coordenadora_com_conta_tambem_e_recusado(
    db_session: AsyncSession,
) -> None:
    await convite(db_session)
    db_session.add(User(email=EMAIL, name="Outra Coord", role=Role.COORDINATOR))
    await db_session.flush()

    assert await conferir(db_session) == (409, {"error": "email_has_account"})


# Critério: link substituído por reenvio não cria conta e se distingue do
# inexistente (a tela mostra a linha "Veja o e-mail mais recente").
async def test_link_substituido_por_reenvio_e_reconhecido(
    db_session: AsyncSession,
) -> None:
    invite = await convite(db_session)
    novo = await resend_coordinator_invite(db_session, invite.id)
    coordenadoras_antes = await coordenadoras(db_session)

    assert await conferir(db_session) == (410, {"error": "invite_replaced"})
    criar = await cadastrar(db_session)
    assert (criar.status_code, criar.json()) == (410, {"error": "invite_replaced"})
    assert await coordenadoras(db_session) == coordenadoras_antes
    # O link novo continua valendo.
    assert (await conferir(db_session, novo.token))[0] == 200


async def test_varios_reenvios_deixam_todos_os_links_antigos_substituidos(
    db_session: AsyncSession,
) -> None:
    invite = await convite(db_session)
    segundo = await resend_coordinator_invite(db_session, invite.id)
    terceiro = await resend_coordinator_invite(db_session, invite.id)

    assert (await conferir(db_session))[1] == {"error": "invite_replaced"}
    assert (await conferir(db_session, segundo.token))[1] == {
        "error": "invite_replaced"
    }
    assert (await conferir(db_session, terceiro.token))[0] == 200


# Critério: link que não existe abre a mesma tela do expirado, sem a linha do
# e-mail mais recente: o código é "invite_not_found", nunca "invite_replaced".
async def test_link_inexistente_nao_e_tratado_como_substituido(
    db_session: AsyncSession,
) -> None:
    invite = await convite(db_session)
    await resend_coordinator_invite(db_session, invite.id)

    assert await conferir(db_session, "link-que-nunca-existiu") == (
        404,
        {"error": "invite_not_found"},
    )


# Critério: nos casos de falha a página não mostra dados de ninguém.
async def test_erros_nao_trazem_dado_do_convite(db_session: AsyncSession) -> None:
    invite = await convite(db_session, vence_em=timedelta(days=-1))
    await resend_coordinator_invite(db_session, invite.id)
    db_session.add(User(email="outro@exemplo.org", name="X", role=Role.GIRL))

    for token in (TOKEN, "inexistente"):
        _, corpo = await conferir(db_session, token)
        assert isinstance(corpo, dict) and list(corpo) == ["error"]
