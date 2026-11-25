"""CV02 Criar conta pelo convite da coordenadora (#455, RF-S2.19, RN-33, RN-35, RN-40).

Rodam com `db_session` (Postgres de teste). Dados fictícios. O Google é trocado
por um falso: nada sai para a rede. Cada teste diz o critério que cobre.
"""

import logging
import urllib.parse
from collections.abc import AsyncGenerator
from datetime import UTC, datetime, timedelta

import httpx2
import pytest
from httpx2 import ASGITransport, AsyncClient, Response
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import routes
from app.auth.google import GoogleProfile
from app.auth.permissions import (
    GOOGLE_COORDINATOR_INVITE_COOKIE,
    GOOGLE_STATE_COOKIE,
    GOOGLE_TERMS_COOKIE,
    GOOGLE_VERIFIER_COOKIE,
    SESSION_COOKIE,
)
from app.auth.utils import create_access_token, decode_access_token, verify_password
from app.config import settings
from app.db.engine import get_session
from app.main import app
from app.modules.admin.service import list_coordinators
from app.modules.consents.models import TermsAcceptance
from app.modules.consents.service import CURRENT_TERMS_VERSION
from app.modules.groups.coordinator_invites import hash_invite_token
from app.modules.groups.models import CoordinatorInvite, Group, GroupCoordinator
from app.users.models import OAuthAccount, Provider, Role, User
from tests.helpers import chamar_rota, token_do_cookie

TOKEN = "convite-ficticio-com-bastante-aleatoriedade-123"
EMAIL = "carla@exemplo.org"
SENHA = "senha-ficticia-1"
CORPO = {
    "token": TOKEN,
    "name": "Carla Ficticia",
    "password": SENHA,
    "acceptedTerms": True,
    "termsVersion": CURRENT_TERMS_VERSION,
}
CHECK = "/api/auth/coordinator-invite/check"
SIGNUP = "/api/auth/signup/coordinator"
CALLBACK = "/api/auth/google/callback"
PERFIL = GoogleProfile(
    subject="google-carla", email="Carla@Exemplo.org", name="Carla G"
)


async def convite(
    sessao: AsyncSession,
    *,
    email: str = EMAIL,
    token: str = TOKEN,
    grupo: Group | None = None,
    vence_em: timedelta = timedelta(days=7),
) -> CoordinatorInvite:
    grupo = grupo or Group(name="Rendeiras do Código")
    invite = CoordinatorInvite(
        name="Carla (nome da equipe)",
        email=email,
        group=grupo,
        token_hash=hash_invite_token(token),
        expires_at=datetime.now(UTC) + vence_em,
    )
    sessao.add(invite)
    await sessao.flush()
    return invite


async def total(
    sessao: AsyncSession, modelo: type[User] | type[GroupCoordinator]
) -> int:
    return await sessao.scalar(select(func.count()).select_from(modelo)) or 0


async def coordenadoras(sessao: AsyncSession) -> int:
    return (
        await sessao.scalar(
            select(func.count()).select_from(User).where(User.role == Role.COORDINATOR)
        )
        or 0
    )


async def cadastrar(sessao: AsyncSession, **mudancas: object) -> Response:
    return await chamar_rota(app, "POST", SIGNUP, sessao, corpo={**CORPO, **mudancas})


# Critério: o link abre a página com o nome do grupo, o e-mail travado do convite,
# o nome que a equipe digitou e até quando vale.
async def test_conferir_mostra_grupo_email_nome_e_validade(
    db_session: AsyncSession,
) -> None:
    invite = await convite(db_session)

    response = await chamar_rota(app, "POST", CHECK, db_session, corpo={"token": TOKEN})

    assert response.status_code == 200
    corpo = response.json()
    assert corpo["group_name"] == "Rendeiras do Código"
    assert corpo["email"] == EMAIL
    assert corpo["name"] == "Carla (nome da equipe)"
    assert datetime.fromisoformat(corpo["expires_at"]) == invite.expires_at


# Critério: com senha, a conta nasce coordenadora do grupo, com o e-mail do
# convite (ela não o envia), logada e indo para "Ações"; a senha só fica em hash.
async def test_cadastro_com_senha_cria_a_coordenadora_do_grupo(
    db_session: AsyncSession,
) -> None:
    invite = await convite(db_session)

    response = await cadastrar(db_session, email="outra@exemplo.com")

    assert response.status_code == 201
    corpo = response.json()
    assert corpo["nextPath"] == "/coordenacao/acoes"
    assert corpo["role"] == "coordinator"
    user = await db_session.scalar(select(User).where(User.role == Role.COORDINATOR))
    assert user is not None
    assert user.email == EMAIL
    assert user.name == "Carla Ficticia"
    assert user.password_hash is not None and user.password_hash != SENHA
    assert verify_password(SENHA, user.password_hash)
    assert decode_access_token(token_do_cookie(response)) == user.id
    ligacao = await db_session.scalar(
        select(GroupCoordinator).where(GroupCoordinator.user_id == user.id)
    )
    assert ligacao is not None and ligacao.group_id == invite.group_id


# Critério: o sistema guarda a versão dos termos que ela aceitou e quando (RN-40).
async def test_cadastro_guarda_versao_e_data_dos_termos(
    db_session: AsyncSession,
) -> None:
    await convite(db_session)

    await cadastrar(db_session)

    user = await db_session.scalar(select(User).where(User.email == EMAIL))
    assert user is not None
    aceite = await db_session.scalar(
        select(TermsAcceptance).where(TermsAcceptance.user_id == user.id)
    )
    assert aceite is not None
    assert aceite.terms_version == CURRENT_TERMS_VERSION
    assert aceite.created_at is not None


# Critério: "Criar conta" só funciona com senha de pelo menos 8 caracteres (RN-33).
async def test_senha_curta_e_recusada_sem_criar_nada(db_session: AsyncSession) -> None:
    await convite(db_session)

    response = await cadastrar(db_session, password="1234567")

    assert response.status_code == 422
    assert response.json() == {"error": "password_too_short"}
    assert await coordenadoras(db_session) == 0


# Critério: sem a caixa dos termos marcada, ou com uma versão que não é a atual,
# a conta não é criada.
@pytest.mark.parametrize(
    ("mudanca", "codigo"),
    [
        ({"acceptedTerms": False}, "terms_not_accepted"),
        ({"termsVersion": "0.0-antiga"}, "terms_outdated"),
    ],
)
async def test_sem_aceite_valido_dos_termos_nao_cria_conta(
    db_session: AsyncSession, mudanca: dict[str, object], codigo: str
) -> None:
    await convite(db_session)

    response = await cadastrar(db_session, **mudanca)

    assert response.status_code == 422
    assert response.json() == {"error": codigo}
    assert await coordenadoras(db_session) == 0


# Critério: "Criar conta" só funciona com o nome preenchido.
async def test_nome_vazio_e_recusado(db_session: AsyncSession) -> None:
    await convite(db_session)

    response = await cadastrar(db_session, name="   ")

    assert response.status_code == 422
    assert await coordenadoras(db_session) == 0


# Critério: ela pode mudar o nome que a equipe digitou; vale o nome enviado.
async def test_o_nome_enviado_vale_mais_que_o_do_convite(
    db_session: AsyncSession,
) -> None:
    await convite(db_session)

    await cadastrar(db_session, name="Carla Mudou")

    user = await db_session.scalar(select(User).where(User.email == EMAIL))
    assert user is not None and user.name == "Carla Mudou"


# Critério: um link que não existe não deixa ninguém criar conta (RNF-S2.02).
async def test_link_inexistente_nao_cria_conta(db_session: AsyncSession) -> None:
    await convite(db_session)

    conferir = await chamar_rota(
        app, "POST", CHECK, db_session, corpo={"token": "outro-link"}
    )
    criar = await cadastrar(db_session, token="outro-link")

    assert conferir.status_code == criar.status_code == 404
    assert criar.json() == {"error": "invite_not_found"}
    assert await coordenadoras(db_session) == 0


# Critério: o mesmo link não cria uma segunda conta (RN-35, uso único).
async def test_o_mesmo_link_nao_cria_segunda_conta(db_session: AsyncSession) -> None:
    await convite(db_session)

    primeira = await cadastrar(db_session)
    segunda = await cadastrar(db_session, name="Outra Pessoa", password="outra-senha-1")

    assert primeira.status_code == 201
    assert segunda.status_code == 410
    assert segunda.json() == {"error": "invite_used"}
    assert await coordenadoras(db_session) == 1


# Critério: o servidor confere validade, cancelamento (reenvio) e e-mail com conta
# a cada abertura (RNF-S2.02, RN-35).
@pytest.mark.parametrize(
    ("cenario", "status", "codigo"),
    [
        ("vencido", 410, "invite_expired"),
        ("cancelado", 404, "invite_not_found"),
        ("com_conta", 409, "email_has_account"),
    ],
)
async def test_convite_que_nao_vale_mais_nao_cria_conta(
    db_session: AsyncSession, cenario: str, status: int, codigo: str
) -> None:
    invite = await convite(
        db_session,
        vence_em=timedelta(days=-1) if cenario == "vencido" else timedelta(days=7),
    )
    if cenario == "cancelado":
        invite.cancelled_at = datetime.now(UTC)
    if cenario == "com_conta":
        db_session.add(User(email=EMAIL, name="Já Existia", role=Role.GIRL))
    await db_session.flush()

    for rota, corpo in ((SIGNUP, CORPO), (CHECK, {"token": TOKEN})):
        response = await chamar_rota(app, "POST", rota, db_session, corpo=corpo)
        assert response.status_code == status
        assert response.json() == {"error": codigo}
    assert await coordenadoras(db_session) == 0


# Critério: o link é guardado só como hash (RNF-S2.02).
async def test_o_link_nao_fica_gravado(db_session: AsyncSession) -> None:
    invite = await convite(db_session)

    assert TOKEN not in invite.token_hash
    assert invite.token_hash == hash_invite_token(TOKEN)


# Critério: o grupo com outras coordenadoras segue com elas; a nova entra só no
# grupo do convite (RF-S2.06, RNF-G.03), e em "Coordenadoras" aparece "Ativa" com
# a data de entrada.
async def test_nova_coordenadora_entra_so_no_grupo_do_convite_e_fica_ativa(
    db_session: AsyncSession,
) -> None:
    grupo = Group(name="Marias da Ciência")
    outro = Group(name="Outro Grupo")
    antiga = User(email="bia@exemplo.org", name="Bia Ficticia", role=Role.COORDINATOR)
    db_session.add_all([grupo, outro, antiga])
    await db_session.flush()
    db_session.add(GroupCoordinator(group_id=grupo.id, user_id=antiga.id))
    await convite(db_session, grupo=grupo)

    await cadastrar(db_session)

    nova = await db_session.scalar(select(User).where(User.email == EMAIL))
    assert nova is not None
    grupos = (
        await db_session.scalars(
            select(GroupCoordinator.group_id).where(GroupCoordinator.user_id == nova.id)
        )
    ).all()
    assert list(grupos) == [grupo.id]
    lista = await list_coordinators(db_session)
    linha = next(i for i in lista.items if i.name == "Carla Ficticia")
    assert linha.status.value == "active"
    assert linha.group_name == "Marias da Ciência"
    assert linha.date is not None


# Critério: depois ela entra com o mesmo e-mail e a senha que criou.
async def test_depois_entra_com_email_e_senha(db_session: AsyncSession) -> None:
    await convite(db_session)
    await cadastrar(db_session)

    response = await chamar_rota(
        app,
        "POST",
        "/api/auth/login",
        db_session,
        corpo={"email": EMAIL, "password": SENHA},
    )

    assert response.status_code == 200
    assert response.json()["nextPath"] == "/coordenacao/acoes"


# Critério: ela não consegue abrir o admin (RNF-G.03).
async def test_coordenadora_recem_criada_nao_abre_o_admin(
    db_session: AsyncSession,
) -> None:
    await convite(db_session)
    await cadastrar(db_session)
    user = await db_session.scalar(select(User).where(User.email == EMAIL))
    assert user is not None

    response = await chamar_rota(
        app,
        "GET",
        "/api/admin/coordinators",
        db_session,
        token=create_access_token(user.id),
    )

    assert response.status_code == 403


# Critério: o nome e o e-mail não aparecem nos logs.
async def test_nome_e_email_nao_vao_para_os_logs(
    db_session: AsyncSession, caplog: pytest.LogCaptureFixture
) -> None:
    await convite(db_session)

    with caplog.at_level(logging.DEBUG):
        await cadastrar(db_session)

    texto = caplog.text
    assert "Carla" not in texto and EMAIL not in texto and TOKEN not in texto


# Google


class GoogleFalso:
    def __init__(self) -> None:
        self.perfil: GoogleProfile | None = PERFIL

    async def exchange_code(
        self, http: httpx2.AsyncClient, code: str, code_verifier: str
    ) -> str | None:
        return "id-token-ficticio"

    async def validate_id_token(self, id_token: str) -> GoogleProfile | None:
        return self.perfil


@pytest.fixture
def google(monkeypatch: pytest.MonkeyPatch) -> GoogleFalso:
    falso = GoogleFalso()
    monkeypatch.setattr(routes, "exchange_code", falso.exchange_code)
    monkeypatch.setattr(routes, "validate_id_token", falso.validate_id_token)
    monkeypatch.setattr(settings, "google_client_id", "cliente-ficticio")
    return falso


async def volta_do_google(
    sessao: AsyncSession,
    *,
    token: str | None = TOKEN,
    termos: str | None = CURRENT_TERMS_VERSION,
) -> Response:
    async def trocar_sessao() -> AsyncGenerator[AsyncSession, None]:
        yield sessao

    cookies = {GOOGLE_STATE_COOKIE: "state-ficticio", GOOGLE_VERIFIER_COOKIE: "v"}
    if token is not None:
        cookies[GOOGLE_COORDINATOR_INVITE_COOKIE] = token
    if termos is not None:
        cookies[GOOGLE_TERMS_COOKIE] = termos
    app.dependency_overrides[get_session] = trocar_sessao
    try:
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://teste", cookies=cookies
        ) as client:
            return await client.get(
                CALLBACK, params={"code": "code-ficticio", "state": "state-ficticio"}
            )
    finally:
        app.dependency_overrides.clear()


# Critério: "Continuar com o Google" guarda o convite e a versão dos termos nos
# cookies do login, e não no endereço que o Google vê.
async def test_login_do_google_guarda_o_convite_da_coordenadora_nos_cookies() -> None:
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://teste"
    ) as client:
        response = await client.get(
            "/api/auth/google/login",
            params={"coordinator_invite": TOKEN, "terms_version": "0.1-rascunho"},
        )

    cookies = "; ".join(response.headers.get_list("set-cookie"))
    assert f"{GOOGLE_COORDINATOR_INVITE_COOKIE}={TOKEN}" in cookies
    assert f"{GOOGLE_TERMS_COOKIE}=0.1-rascunho" in cookies
    assert TOKEN not in urllib.parse.unquote(response.headers["location"])


# Critério: com o Google do e-mail do convite, a conta nasce coordenadora do
# grupo, logada, ligada ao Google, com o aceite dos termos, e cai em "Ações".
async def test_google_com_o_email_do_convite_cria_a_conta(
    db_session: AsyncSession, google: GoogleFalso
) -> None:
    invite = await convite(db_session)

    response = await volta_do_google(db_session)

    assert response.status_code == 302
    assert response.headers["location"] == "/coordenacao/acoes"
    user = await db_session.scalar(select(User).where(User.email == EMAIL))
    assert user is not None
    assert user.role is Role.COORDINATOR and user.password_hash is None
    assert decode_access_token(token_do_cookie(response)) == user.id
    oauth = await db_session.scalar(
        select(OAuthAccount).where(OAuthAccount.user_id == user.id)
    )
    assert oauth is not None
    assert (oauth.provider, oauth.provider_user_id) == (Provider.GOOGLE, "google-carla")
    ligacao = await db_session.scalar(
        select(GroupCoordinator).where(GroupCoordinator.user_id == user.id)
    )
    assert ligacao is not None and ligacao.group_id == invite.group_id
    aceite = await db_session.scalar(
        select(TermsAcceptance).where(TermsAcceptance.user_id == user.id)
    )
    assert aceite is not None and aceite.terms_version == CURRENT_TERMS_VERSION
    # Os cookies do Google somem depois do uso.
    cookies = "; ".join(response.headers.get_list("set-cookie"))
    assert f"{GOOGLE_COORDINATOR_INVITE_COOKIE}=" in cookies and "Max-Age=0" in cookies


# Critério: só a conta Google com o e-mail do convite cria a conta; com outra, ela
# volta à página do convite com o erro e nada é criado.
async def test_google_com_outro_email_nao_cria_conta(
    db_session: AsyncSession, google: GoogleFalso
) -> None:
    await convite(db_session)
    google.perfil = GoogleProfile(
        subject="google-outra", email="outra@exemplo.org", name="Outra"
    )

    response = await volta_do_google(db_session)

    assert response.status_code == 302
    destino = urllib.parse.urlsplit(response.headers["location"])
    assert destino.path == "/convite/coordenadora"
    assert urllib.parse.parse_qs(destino.query) == {
        "token": [TOKEN],
        "erro": ["google_email_mismatch"],
    }
    assert SESSION_COOKIE not in response.headers.get("set-cookie", "")
    assert await coordenadoras(db_session) == 0


# Critério: sem aceitar os termos ao clicar, ou com o Google falhando, nada é criado.
@pytest.mark.parametrize(
    ("termos", "perfil_ok", "erro"),
    [(None, True, "terms_not_accepted"), ("0.0-antiga", True, "terms_outdated")]
    + [(CURRENT_TERMS_VERSION, False, "google")],
)
async def test_google_sem_termos_ou_com_falha_nao_cria_conta(
    db_session: AsyncSession,
    google: GoogleFalso,
    termos: str | None,
    perfil_ok: bool,
    erro: str,
) -> None:
    await convite(db_session)
    if not perfil_ok:
        google.perfil = None

    response = await volta_do_google(db_session, termos=termos)

    destino = urllib.parse.urlsplit(response.headers["location"])
    assert urllib.parse.parse_qs(destino.query)["erro"] == [erro]
    assert await coordenadoras(db_session) == 0


# Critério: o mesmo link não cria segunda conta pelo Google, e um link que não
# existe não cria conta.
async def test_google_com_link_usado_ou_inexistente_nao_cria_conta(
    db_session: AsyncSession, google: GoogleFalso
) -> None:
    await convite(db_session)
    primeira = await volta_do_google(db_session)
    usado = await volta_do_google(db_session)
    inexistente = await volta_do_google(db_session, token="outro-link")

    assert primeira.headers["location"] == "/coordenacao/acoes"
    for response, erro in ((usado, "invite_used"), (inexistente, "invite_not_found")):
        consulta = urllib.parse.urlsplit(response.headers["location"]).query
        assert urllib.parse.parse_qs(consulta)["erro"] == [erro]
    assert await coordenadoras(db_session) == 1
