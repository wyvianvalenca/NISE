import hashlib
from datetime import UTC, datetime, timedelta

import jwt
from pwdlib import PasswordHash

from app.auth.google import GoogleProfile
from app.config import settings

JWT_ALGORITHM = "HS256"
PENDING_SIGNUP_AUDIENCE = "nise:pending-signup"


password_hasher = PasswordHash.recommended()


def hash_password(password: str) -> str:
    return password_hasher.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    return password_hasher.verify(password, password_hash)


def create_access_token(user_id: int) -> str:
    expires_at = datetime.now(UTC) + timedelta(minutes=settings.jwt_expire_minutes)
    payload = {"sub": str(user_id), "exp": expires_at}

    return jwt.encode(payload, settings.jwt_secret, algorithm=JWT_ALGORITHM)


def decode_access_token(token: str) -> int | None:
    try:
        payload = jwt.decode(
            token,
            settings.jwt_secret,
            algorithms=[JWT_ALGORITHM],
            options={"require": ["exp", "sub"]},
        )
        return int(payload["sub"])
    except (jwt.InvalidTokenError, ValueError):
        return None


def hash_reset_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def create_pending_signup_token(profile: GoogleProfile) -> str:
    expires_at = datetime.now(UTC) + timedelta(
        minutes=settings.pending_signup_expire_minutes
    )
    payload = {
        "sub": profile.subject,
        "email": profile.email,
        "name": profile.name,
        "aud": PENDING_SIGNUP_AUDIENCE,
        "exp": expires_at,
    }

    return jwt.encode(payload, settings.jwt_secret, algorithm=JWT_ALGORITHM)


def decode_pending_signup_token(token: str) -> GoogleProfile | None:
    try:
        payload = jwt.decode(
            token,
            settings.jwt_secret,
            algorithms=[JWT_ALGORITHM],
            options={"require": ["exp", "aud", "sub"]},
            audience=PENDING_SIGNUP_AUDIENCE,
        )
    except jwt.InvalidTokenError:
        return None

    subject = payload.get("sub")
    email = payload.get("email")
    name = payload.get("name")

    if not isinstance(subject, str):
        return None

    if not isinstance(email, str) or not email:
        return None

    if not isinstance(name, str) or not name.strip():
        name = email.split("@")[0]

    profile = GoogleProfile(subject=subject, name=name.strip(), email=email)

    return profile
