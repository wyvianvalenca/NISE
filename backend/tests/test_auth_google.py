import time
import urllib.parse
from types import SimpleNamespace

import httpx2
import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.primitives.asymmetric.rsa import RSAPrivateKey

from app.auth import google
from app.auth.google import (
    GOOGLE_AUTHORIZATION_URL,
    GOOGLE_TOKEN_URL,
    GoogleProfile,
    build_authorization_url,
    exchange_code,
    make_code_challenge,
    new_code_verifier,
    validate_id_token,
)
from app.config import settings

# Geradas uma vez por arquivo: cada chave RSA leva uma fração de segundo.
CHAVE = rsa.generate_private_key(public_exponent=65537, key_size=2048)
OUTRA_CHAVE = rsa.generate_private_key(public_exponent=65537, key_size=2048)

CLIENT_ID = "cliente-ficticio"
CLIENT_SECRET = "segredo-ficticio-do-google"
REDIRECT_URI = "http://localhost:3000/api/auth/google/callback"


class ChavesFalsas:
    # Faz o papel do PyJWKClient: em vez de buscar as chaves no Google,
    # devolve a chave pública do teste.
    def get_signing_key_from_jwt(self, token: str) -> SimpleNamespace:
        return SimpleNamespace(key=CHAVE.public_key())


class ChavesForaDoAr:
    # Simula o Google fora do ar na hora de buscar as chaves.
    def get_signing_key_from_jwt(self, token: str) -> SimpleNamespace:
        raise jwt.PyJWKClientError("sem rede")


@pytest.fixture(autouse=True)
def google_ficticio(monkeypatch: pytest.MonkeyPatch) -> None:
    # Fixa a configuração, para não depender do .env de quem roda os testes.
    monkeypatch.setattr(settings, "google_client_id", CLIENT_ID)
    monkeypatch.setattr(settings, "google_client_secret", CLIENT_SECRET)
    monkeypatch.setattr(settings, "google_redirect_uri", REDIRECT_URI)
    monkeypatch.setattr(google, "_jwks_client", ChavesFalsas())


def claims_validas() -> dict[str, object]:
    agora = int(time.time())
    return {
        "iss": "https://accounts.google.com",
        "aud": CLIENT_ID,
        "sub": "google-123",
        "iat": agora,
        "exp": agora + 300,
        "email": "alana@exemplo.com",
        "email_verified": True,
        "name": "Alana Ficticia",
    }


def id_token(
    mudancas: dict[str, object] | None = None,
    sem: tuple[str, ...] = (),
    chave: RSAPrivateKey = CHAVE,
) -> str:
    # Assina um id_token como o Google faria; `mudancas` troca campos e `sem` tira.
    claims = {**claims_validas(), **(mudancas or {})}
    for campo in sem:
        del claims[campo]
    return jwt.encode(claims, chave, algorithm="RS256")


# PKCE


def test_challenge_bate_com_o_exemplo_da_rfc_7636() -> None:
    # Exemplo resolvido do Apêndice B da especificação do PKCE.
    verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"

    assert (
        make_code_challenge(verifier) == "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"
    )


def test_verifier_tem_tamanho_e_caracteres_do_padrao() -> None:
    verifier = new_code_verifier()

    assert 43 <= len(verifier) <= 128
    permitidos = set(
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~"
    )
    assert set(verifier) <= permitidos


def test_cada_verifier_e_diferente() -> None:
    assert new_code_verifier() != new_code_verifier()


# URL de autorização


def test_url_de_autorizacao_leva_os_parametros_do_google() -> None:
    url = build_authorization_url(state="estado-ficticio", code_challenge="desafio")

    endereco, _, consulta = url.partition("?")
    assert endereco == GOOGLE_AUTHORIZATION_URL
    assert urllib.parse.parse_qs(consulta) == {
        "client_id": [CLIENT_ID],
        # Idêntico ao do console do Google, senão ele recusa.
        "redirect_uri": [REDIRECT_URI],
        "response_type": ["code"],
        "scope": ["openid email profile"],
        "state": ["estado-ficticio"],
        "code_challenge": ["desafio"],
        "code_challenge_method": ["S256"],
        # Sempre pergunta a conta: celular dividido e o "Usar outra conta".
        "prompt": ["select_account"],
    }


# Troca do code


async def trocar(transporte: httpx2.MockTransport) -> str | None:
    async with httpx2.AsyncClient(transport=transporte) as http:
        return await exchange_code(http, "code-ficticio", "verifier-ficticio")


async def test_troca_devolve_o_id_token_e_envia_o_formulario_certo() -> None:
    enviadas: list[httpx2.Request] = []

    def google_responde(requisicao: httpx2.Request) -> httpx2.Response:
        enviadas.append(requisicao)
        return httpx2.Response(200, json={"id_token": "id-token-ficticio"})

    assert await trocar(httpx2.MockTransport(google_responde)) == "id-token-ficticio"

    [requisicao] = enviadas
    assert requisicao.method == "POST"
    assert str(requisicao.url) == GOOGLE_TOKEN_URL
    # O padrão OAuth pede formulário, não JSON.
    assert requisicao.headers["content-type"] == "application/x-www-form-urlencoded"
    assert dict(urllib.parse.parse_qsl(requisicao.content.decode())) == {
        "code": "code-ficticio",
        "client_id": CLIENT_ID,
        "client_secret": CLIENT_SECRET,
        "redirect_uri": REDIRECT_URI,
        "grant_type": "authorization_code",
        "code_verifier": "verifier-ficticio",
    }


@pytest.mark.parametrize(
    "resposta",
    [
        httpx2.Response(400, json={"error": "invalid_grant"}),
        # Resposta de erro não vale, mesmo que traga um id_token.
        httpx2.Response(400, json={"id_token": "id-token-ficticio"}),
        httpx2.Response(500, text="<html>erro</html>"),
        httpx2.Response(200, text="isto não é JSON"),
        httpx2.Response(200, json={"access_token": "sem-id-token"}),
        httpx2.Response(200, json={"id_token": 123}),
        httpx2.Response(200, json=["id_token"]),
    ],
    ids=[
        "code-recusado",
        "erro-com-id-token",
        "erro-do-google",
        "nao-e-json",
        "sem-id-token",
        "id-token-nao-e-texto",
        "json-nao-e-objeto",
    ],
)
async def test_troca_com_resposta_ruim_devolve_none(resposta: httpx2.Response) -> None:
    assert await trocar(httpx2.MockTransport(lambda _: resposta)) is None


async def test_troca_sem_rede_devolve_none() -> None:
    def sem_rede(requisicao: httpx2.Request) -> httpx2.Response:
        raise httpx2.ConnectError("sem rede", request=requisicao)

    assert await trocar(httpx2.MockTransport(sem_rede)) is None


# Validação do id_token: aceita


async def test_token_valido_devolve_o_perfil() -> None:
    assert await validate_id_token(id_token()) == GoogleProfile(
        subject="google-123", email="alana@exemplo.com", name="Alana Ficticia"
    )


async def test_emissor_sem_https_tambem_vale() -> None:
    # O Google usa as duas formas no iss.
    perfil = await validate_id_token(id_token({"iss": "accounts.google.com"}))

    assert perfil is not None


async def test_relogio_um_pouco_adiantado_e_tolerado() -> None:
    # Sem a folga (leeway), um iat poucos segundos no futuro seria recusado.
    perfil = await validate_id_token(id_token({"iat": int(time.time()) + 20}))

    assert perfil is not None


@pytest.mark.parametrize(
    ("sem", "mudancas"),
    [(("name",), {}), ((), {"name": ""}), ((), {"name": "   "})],
    ids=["sem-name", "name-vazio", "name-so-espacos"],
)
async def test_sem_nome_usa_o_comeco_do_email(
    sem: tuple[str, ...], mudancas: dict[str, object]
) -> None:
    perfil = await validate_id_token(id_token(mudancas, sem))

    assert perfil is not None
    assert perfil.name == "alana"


async def test_nome_sai_sem_espacos_nas_pontas() -> None:
    perfil = await validate_id_token(id_token({"name": "  Alana Ficticia "}))

    assert perfil is not None
    assert perfil.name == "Alana Ficticia"


# Validação do id_token: recusa


@pytest.mark.parametrize(
    ("sem", "mudancas"),
    [
        ((), {"aud": "outro-app"}),
        ((), {"iss": "https://falso.exemplo.com"}),
        # Vencido além da folga de 60 s.
        ((), {"iat": int(time.time()) - 600, "exp": int(time.time()) - 120}),
        (("sub",), {}),
        (("exp",), {}),
        ((), {"sub": 123}),
        # Sem e-mail verificado, alguém poderia se ligar à conta de outra pessoa.
        ((), {"email_verified": False}),
        ((), {"email_verified": "true"}),
        (("email_verified",), {}),
        (("email",), {}),
        ((), {"email": ""}),
    ],
    ids=[
        "aud-de-outro-app",
        "iss-estranho",
        "expirado",
        "sem-sub",
        "sem-exp",
        "sub-nao-e-texto",
        "email-nao-verificado",
        "email-verified-em-texto",
        "sem-email-verified",
        "sem-email",
        "email-vazio",
    ],
)
async def test_token_recusado_devolve_none(
    sem: tuple[str, ...], mudancas: dict[str, object]
) -> None:
    assert await validate_id_token(id_token(mudancas, sem)) is None


async def test_token_assinado_com_outra_chave_devolve_none() -> None:
    assert await validate_id_token(id_token(chave=OUTRA_CHAVE)) is None


async def test_token_sem_assinatura_devolve_none() -> None:
    # alg "none": qualquer um escreveria o token que quisesse.
    token = jwt.encode(claims_validas(), "", algorithm="none")

    assert await validate_id_token(token) is None


async def test_token_hs256_devolve_none() -> None:
    # Só RS256: aceitar HS256 abriria a porta para assinar com a chave pública.
    token = jwt.encode(claims_validas(), "segredo-ficticio-de-32-bytes-ok!", "HS256")

    assert await validate_id_token(token) is None


async def test_texto_qualquer_devolve_none() -> None:
    assert await validate_id_token("texto-qualquer") is None


async def test_chaves_do_google_fora_do_ar_devolve_none(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(google, "_jwks_client", ChavesForaDoAr())

    assert await validate_id_token(id_token()) is None
