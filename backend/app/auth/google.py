import asyncio
import base64
import hashlib
import secrets
import urllib.parse
from dataclasses import dataclass

import httpx2
import jwt

from app.config import settings

GOOGLE_AUTHORIZATION_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs"
GOOGLE_ISSUERS = ["https://accounts.google.com", "accounts.google.com"]

# Criado uma vez: guarda as chaves do Google em cache entre as requisições.
_jwks_client = jwt.PyJWKClient(GOOGLE_JWKS_URL)


@dataclass(frozen=True)
class GoogleProfile:
    subject: str
    email: str
    name: str


def new_code_verifier() -> str:
    return secrets.token_urlsafe(64)  # Limite de 43 a 128


def make_code_challenge(code_verifier: str) -> str:
    digest = hashlib.sha256(code_verifier.encode()).digest()
    return base64.urlsafe_b64encode(digest).rstrip(b"=").decode()


def build_authorization_url(state: str, code_challenge: str) -> str:
    params = {
        "client_id": settings.google_client_id,
        "redirect_uri": settings.google_redirect_uri,
        "response_type": "code",
        "scope": "openid email profile",
        "state": state,
        "code_challenge": code_challenge,
        "code_challenge_method": "S256",
        "prompt": "select_account",
    }
    return f"{GOOGLE_AUTHORIZATION_URL}?{urllib.parse.urlencode(params)}"


async def exchange_code(
    http: httpx2.AsyncClient, code: str, code_verifier: str
) -> str | None:
    try:
        response = await http.post(
            GOOGLE_TOKEN_URL,
            data={
                "code": code,
                "client_id": settings.google_client_id,
                "client_secret": settings.google_client_secret,
                "redirect_uri": settings.google_redirect_uri,
                "grant_type": "authorization_code",
                "code_verifier": code_verifier,
            },
        )
        payload = response.json()
    except (httpx2.HTTPError, ValueError):
        return None

    if response.status_code != 200:
        return None

    if not isinstance(payload, dict):
        return None

    token = payload.get("id_token")
    if not isinstance(token, str):
        return None

    return token


async def validate_id_token(id_token: str) -> GoogleProfile | None:
    try:
        # PyJWKClient busca as chaves com urllib, é síncrono, thread pra não travar o servidor
        signing_key = await asyncio.to_thread(
            _jwks_client.get_signing_key_from_jwt, id_token
        )
        claims = jwt.decode(
            id_token,
            signing_key.key,
            algorithms=["RS256"],
            audience=settings.google_client_id,
            issuer=GOOGLE_ISSUERS,
            options={"require": ["exp", "iat", "iss", "aud", "sub"]},
            leeway=60,
        )
    except jwt.PyJWTError:
        return None

    subject = claims.get("sub")
    email = claims.get("email")
    name = claims.get("name")

    if claims.get("email_verified") is not True:
        return None

    if not isinstance(subject, str):
        return None

    if not isinstance(email, str) or not email:
        return None

    if not isinstance(name, str) or not name.strip():
        name = email.split("@")[0]

    profile = GoogleProfile(subject=subject, name=name.strip(), email=email)

    return profile
