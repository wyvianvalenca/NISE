"""Convidar uma coordenadora a um grupo, novo ou já existente (AD03, #453).

Só a equipe NISE convida (RN-35, RNF-G.03: a rota confere o papel). O convite
serve a um e-mail e a um uso e vale 7 dias, prazo fixo (D-118). O link é um
código aleatório que só vai no e-mail: no banco fica o hash (`token_hash`).
"""

import hashlib
import secrets
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from fastapi import Request, status
from fastapi.responses import JSONResponse
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.modules.cities.service import ensure_city_exists
from app.modules.groups.models import CoordinatorInvite, Group
from app.users.service import get_user_by_email, normalize_email

# Prazo fixo do convite (RN-35, D-118).
INVITE_VALID_DAYS = 7

# 32 bytes viram 43 caracteres no link: impossível de adivinhar (RNF-S2.02).
INVITE_TOKEN_BYTES = 32


class CoordinatorInviteError(Exception):
    """O convite não pode ser criado. `code` é o que o front lê no corpo."""

    def __init__(self, code: str, status_code: int = status.HTTP_409_CONFLICT):
        super().__init__(code)
        self.code = code
        self.status_code = status_code


async def coordinator_invite_error_handler(
    request: Request, exc: Exception
) -> JSONResponse:
    assert isinstance(exc, CoordinatorInviteError)
    return JSONResponse(status_code=exc.status_code, content={"error": exc.code})


def new_invite_token() -> str:
    return secrets.token_urlsafe(INVITE_TOKEN_BYTES)


def hash_invite_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


@dataclass
class CreatedInvite:
    invite: CoordinatorInvite
    group: Group
    # O link só existe aqui, em memória: vai para o e-mail e para mais nada.
    token: str


async def _find_group(session: AsyncSession, name: str, city_id: int) -> Group | None:
    """O grupo com o mesmo nome (sem ligar para maiúsculas) na mesma cidade."""
    return await session.scalar(
        select(Group).where(
            func.lower(func.btrim(Group.name)) == name.strip().lower(),
            Group.city_id == city_id,
        )
    )


async def create_coordinator_invite(
    session: AsyncSession,
    *,
    name: str,
    email: str,
    group_id: int | None = None,
    new_group_name: str | None = None,
    new_group_city_id: int | None = None,
    now: datetime | None = None,
) -> CreatedInvite:
    """Cria o convite e, com grupo novo, o grupo, tudo na mesma transação.

    Levanta CoordinatorInviteError, sem criar nada:
    - "email_has_account": o e-mail já tem conta, de menina ou de coordenadora;
    - "invite_pending": o e-mail já tem um convite esperando (a equipe usa
      "Reenviar", que é outra story);
    - "group_exists": já há um grupo com esse nome nessa cidade (D-120);
    - "group_not_found" (404): o grupo escolhido não existe.
    Cidade fora da lista do IBGE levanta InvalidCityError (RN-17).
    """
    now = now or datetime.now(UTC)
    email = normalize_email(email)

    if await get_user_by_email(session, email) is not None:
        raise CoordinatorInviteError("email_has_account")

    pending = await session.scalar(
        select(CoordinatorInvite.id).where(
            CoordinatorInvite.email == email,
            CoordinatorInvite.accepted_at.is_(None),
            CoordinatorInvite.cancelled_at.is_(None),
            CoordinatorInvite.expires_at > now,
        )
    )
    if pending is not None:
        raise CoordinatorInviteError("invite_pending")

    if group_id is not None:
        group = await session.get(Group, group_id)
        if group is None:
            raise CoordinatorInviteError("group_not_found", status.HTTP_404_NOT_FOUND)
    else:
        assert new_group_name is not None and new_group_city_id is not None
        await ensure_city_exists(session, new_group_city_id)
        if await _find_group(session, new_group_name, new_group_city_id):
            raise CoordinatorInviteError("group_exists")
        group = Group(name=new_group_name, city_id=new_group_city_id)
        session.add(group)

    token = new_invite_token()
    invite = CoordinatorInvite(
        name=name,
        email=email,
        group=group,
        token_hash=hash_invite_token(token),
        expires_at=now + timedelta(days=INVITE_VALID_DAYS),
    )
    session.add(invite)

    try:
        await session.commit()
    except IntegrityError:
        # Outro convite criou o mesmo grupo no mesmo instante.
        await session.rollback()
        raise CoordinatorInviteError("group_exists") from None

    return CreatedInvite(invite=invite, group=group, token=token)


async def resend_coordinator_invite(
    session: AsyncSession, invite_id: int, now: datetime | None = None
) -> CreatedInvite:
    """Troca o link do convite por um novo, que vale 7 dias a partir de agora.

    O link anterior deixa de funcionar: só o hash do novo fica no banco
    (RN-35, RNF-S2.02). Vale para convite esperando ou expirado, sem limite de
    reenvios. Levanta CoordinatorInviteError:
    - "invite_not_found" (404): não existe, já foi aceito ou foi cancelado;
    - "email_has_account": o e-mail já tem conta agora; nada é trocado.
    """
    now = now or datetime.now(UTC)

    # FOR UPDATE: dois "Reenviar" ao mesmo tempo não deixam dois links válidos.
    invite = await session.scalar(
        select(CoordinatorInvite)
        .where(CoordinatorInvite.id == invite_id)
        .options(selectinload(CoordinatorInvite.group))
        .with_for_update()
    )
    if (
        invite is None
        or invite.accepted_at is not None
        or invite.cancelled_at is not None
    ):
        raise CoordinatorInviteError("invite_not_found", status.HTTP_404_NOT_FOUND)

    if await get_user_by_email(session, invite.email) is not None:
        raise CoordinatorInviteError("email_has_account")

    token = new_invite_token()
    invite.token_hash = hash_invite_token(token)
    invite.expires_at = now + timedelta(days=INVITE_VALID_DAYS)
    await session.commit()

    return CreatedInvite(invite=invite, group=invite.group, token=token)


async def list_groups(session: AsyncSession) -> list[Group]:
    """Os grupos que existem, por nome, para a equipe escolher no convite."""
    result = await session.scalars(
        select(Group).options(selectinload(Group.city)).order_by(Group.name, Group.id)
    )
    return list(result.all())
