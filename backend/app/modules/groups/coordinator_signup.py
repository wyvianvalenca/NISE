"""A coordenadora cria a conta pelo link do convite (CV02, #455).

Serve às duas portas, e-mail e senha ou Google: as duas passam por
`accept_coordinator_invite`, que confere o convite de novo a cada uso (RNF-S2.02)
e cria tudo numa transação só: a conta, o vínculo com o grupo (RF-S2.19), o
aceite dos termos (RN-40) e o convite gasto.

O e-mail da conta é sempre o do convite, que ela não troca. Como o convite chegou
nesse e-mail, a conta já nasce confirmada: nenhum e-mail de confirmação sai.
Nada aqui grava nome nem e-mail em log.
"""

from datetime import UTC, datetime

from fastapi import status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth.google import GoogleProfile
from app.auth.utils import MINIMUM_PASSWORD_LENGTH, hash_password
from app.modules.consents.models import TermsAcceptance
from app.modules.consents.service import CURRENT_TERMS_VERSION
from app.modules.groups.coordinator_invites import (
    CoordinatorInviteError,
    hash_invite_token,
)
from app.modules.groups.models import CoordinatorInvite, GroupCoordinator
from app.users.models import OAuthAccount, Provider, Role, User
from app.users.service import get_user_by_email, normalize_email


async def _load_invite(
    session: AsyncSession, token: str, now: datetime, *, lock: bool = False
) -> CoordinatorInvite:
    """O convite que ainda pode criar conta, ou CoordinatorInviteError.

    - "invite_not_found" (404): link que não existe, ou que a equipe cancelou
      ao reenviar (RN-35);
    - "invite_used" (410): o link já criou uma conta;
    - "invite_expired" (410): passaram os 7 dias;
    - "email_has_account" (409): o e-mail do convite já tem conta.
    As telas desses três últimos são da story #458.
    """
    stmt = (
        select(CoordinatorInvite)
        .where(CoordinatorInvite.token_hash == hash_invite_token(token))
        .options(selectinload(CoordinatorInvite.group))
    )
    if lock:
        # Dois cliques ao mesmo tempo: o segundo espera e vê o convite gasto.
        stmt = stmt.with_for_update(of=CoordinatorInvite)
    invite = await session.scalar(stmt)

    if invite is None or invite.cancelled_at is not None:
        raise CoordinatorInviteError("invite_not_found", status.HTTP_404_NOT_FOUND)
    if invite.accepted_at is not None:
        raise CoordinatorInviteError("invite_used", status.HTTP_410_GONE)
    if invite.expires_at <= now:
        raise CoordinatorInviteError("invite_expired", status.HTTP_410_GONE)
    if await get_user_by_email(session, invite.email) is not None:
        raise CoordinatorInviteError("email_has_account")

    return invite


async def get_open_invite(
    session: AsyncSession, token: str, now: datetime | None = None
) -> CoordinatorInvite:
    """Só confere: a página CV02 usa para mostrar o grupo, o e-mail e a validade."""
    return await _load_invite(session, token, now or datetime.now(UTC))


def _check_terms(accepted: bool, version: str) -> None:
    if not accepted:
        raise CoordinatorInviteError(
            "terms_not_accepted", status.HTTP_422_UNPROCESSABLE_CONTENT
        )
    if version != CURRENT_TERMS_VERSION:
        raise CoordinatorInviteError(
            "terms_outdated", status.HTTP_422_UNPROCESSABLE_CONTENT
        )


async def accept_coordinator_invite(
    session: AsyncSession,
    token: str,
    *,
    name: str,
    accepted_terms: bool,
    terms_version: str,
    password: str | None = None,
    google: GoogleProfile | None = None,
    now: datetime | None = None,
) -> User:
    """Cria a conta da coordenadora a partir do convite.

    Com `password` é a conta de e-mail e senha; com `google`, a do Google, e só
    vale se o e-mail do Google for o do convite. Levanta CoordinatorInviteError
    sem criar nada: os códigos de `_load_invite`, mais "password_too_short",
    "terms_not_accepted", "terms_outdated" (422) e "google_email_mismatch".
    """
    assert (password is None) != (google is None)
    now = now or datetime.now(UTC)

    _check_terms(accepted_terms, terms_version)
    if password is not None and len(password) < MINIMUM_PASSWORD_LENGTH:
        raise CoordinatorInviteError(
            "password_too_short", status.HTTP_422_UNPROCESSABLE_CONTENT
        )
    # Antes da trava, para não segurar a linha enquanto o Argon2 roda.
    password_hash = hash_password(password) if password is not None else None

    invite = await _load_invite(session, token, now, lock=True)

    if google is not None and normalize_email(google.email) != invite.email:
        await session.rollback()
        raise CoordinatorInviteError("google_email_mismatch")

    user = User(
        name=name,
        email=invite.email,
        password_hash=password_hash,
        role=Role.COORDINATOR,
    )
    session.add(user)

    try:
        # O flush dá o id da conta, para ligar o resto a ela.
        await session.flush()
        session.add(GroupCoordinator(group_id=invite.group_id, user_id=user.id))
        session.add(TermsAcceptance(user_id=user.id, terms_version=terms_version))
        if google is not None:
            session.add(
                OAuthAccount(
                    user_id=user.id,
                    provider=Provider.GOOGLE,
                    provider_user_id=google.subject,
                )
            )
        invite.accepted_at = now
        await session.commit()
    except IntegrityError:
        # O e-mail ou o Google ganharam conta no mesmo instante.
        await session.rollback()
        raise CoordinatorInviteError("email_has_account") from None

    return user
