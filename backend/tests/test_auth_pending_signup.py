import time

import jwt
import pytest
from fastapi import Response

from app.auth.google import GoogleProfile
from app.auth.permissions import (
    PENDING_SIGNUP_COOKIE,
    clear_pending_signup_cookie,
    set_pending_signup_cookie,
)
from app.auth.utils import (
    JWT_ALGORITHM,
    PENDING_SIGNUP_AUDIENCE,
    create_access_token,
    create_pending_signup_token,
    decode_access_token,
    decode_pending_signup_token,
)
from app.config import settings

PERFIL = GoogleProfile(
    subject="google-123", email="alana@exemplo.com", name="Alana Ficticia"
)


def token_a_mao(
    mudancas: dict[str, object] | None = None,
    sem: tuple[str, ...] = (),
    segredo: str | None = None,
) -> str:
    # Monta um token pendente sem passar pelo create, para testar as recusas.
    claims: dict[str, object] = {
        "aud": PENDING_SIGNUP_AUDIENCE,
        "sub": "google-123",
        "email": "alana@exemplo.com",
        "name": "Alana Ficticia",
        "exp": int(time.time()) + 300,
        **(mudancas or {}),
    }
    for campo in sem:
        del claims[campo]
    return jwt.encode(claims, segredo or settings.jwt_secret, algorithm=JWT_ALGORITHM)


# O token


def test_ida_e_volta_devolve_o_mesmo_perfil() -> None:
    token = create_pending_signup_token(PERFIL)

    assert decode_pending_signup_token(token) == PERFIL


def test_token_leva_so_o_necessario() -> None:
    # O conteúdo é legível por quem tiver o cookie: nada de data de nascimento,
    # cidade ou outro dado além do que o Google já mostrou a ela.
    token = create_pending_signup_token(PERFIL)

    conteudo = jwt.decode(token, options={"verify_signature": False})

    assert set(conteudo) == {"aud", "sub", "email", "name", "exp"}
    assert conteudo["aud"] == PENDING_SIGNUP_AUDIENCE


def test_token_usa_a_validade_do_config(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "pending_signup_expire_minutes", 15)

    antes = int(time.time())
    token = create_pending_signup_token(PERFIL)
    depois = int(time.time())

    exp = jwt.decode(token, options={"verify_signature": False})["exp"]
    validade = 15 * 60
    assert antes + validade <= exp <= depois + validade


def test_token_pendente_nao_abre_sessao() -> None:
    # Os dois tokens usam o mesmo segredo: é o aud que impede a troca.
    token = create_pending_signup_token(PERFIL)

    assert decode_access_token(token) is None


def test_token_de_sessao_nao_serve_como_pendente() -> None:
    assert decode_pending_signup_token(create_access_token(1)) is None


@pytest.mark.parametrize(
    ("mudancas", "sem"),
    [
        ({"exp": int(time.time()) - 60}, ()),
        ({"aud": "outra-coisa"}, ()),
        ({}, ("aud",)),
        ({}, ("sub",)),
        ({}, ("exp",)),
        ({}, ("email",)),
        ({"email": ""}, ()),
        ({"email": 123}, ()),
        ({"sub": 123}, ()),
    ],
    ids=[
        "vencido",
        "aud-errado",
        "sem-aud",
        "sem-sub",
        "sem-exp",
        "sem-email",
        "email-vazio",
        "email-nao-e-texto",
        "sub-nao-e-texto",
    ],
)
def test_token_recusado_devolve_none(
    mudancas: dict[str, object], sem: tuple[str, ...]
) -> None:
    assert decode_pending_signup_token(token_a_mao(mudancas, sem)) is None


def test_token_assinado_com_outro_segredo_devolve_none() -> None:
    # Sem a assinatura certa, alguém poderia trocar o sub ou o e-mail do cookie.
    token = token_a_mao(segredo="outro-segredo-ficticio-de-32-bytes")

    assert decode_pending_signup_token(token) is None


def test_texto_qualquer_devolve_none() -> None:
    assert decode_pending_signup_token("texto-qualquer") is None


def test_token_sem_nome_usa_o_comeco_do_email() -> None:
    perfil = decode_pending_signup_token(token_a_mao(sem=("name",)))

    assert perfil is not None
    assert perfil.name == "alana"


# O cookie


def test_cookie_pendente_e_httponly_e_dura_o_mesmo_que_o_token() -> None:
    response = Response()

    set_pending_signup_cookie(response, "token-ficticio")

    cookie = response.headers["set-cookie"]
    assert cookie.startswith(f"{PENDING_SIGNUP_COOKIE}=token-ficticio;")
    assert "HttpOnly" in cookie
    assert "SameSite=lax" in cookie
    assert "Path=/;" in cookie
    assert f"Max-Age={settings.pending_signup_expire_minutes * 60}" in cookie


def test_cookie_pendente_usa_a_validade_do_config(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "pending_signup_expire_minutes", 15)
    response = Response()

    set_pending_signup_cookie(response, "token-ficticio")

    assert "Max-Age=900" in response.headers["set-cookie"]


def test_limpar_o_cookie_pendente_apaga_no_mesmo_caminho() -> None:
    # Com outro Path, o navegador trataria como outro cookie e não apagaria.
    response = Response()

    clear_pending_signup_cookie(response)

    cookie = response.headers["set-cookie"]
    assert cookie.startswith(f'{PENDING_SIGNUP_COOKIE}="";')
    assert "Max-Age=0" in cookie
    assert "Path=/;" in cookie
