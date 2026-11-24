"""O e-mail do convite da coordenadora (CV00, #453, RF-S2.31).

Sai pela conta Gmail da equipe (app/core/email.py, #275). O texto é fixo.
Assunto e nome do remetente não estão no Figma: o assunto é uma suposição.

Os logs só levam o tipo do erro, nunca o nome, o e-mail nem o link: o link dá
acesso à criação da conta.
"""

import logging
import smtplib
from datetime import datetime
from urllib.parse import urlencode

from app.config import settings
from app.core.email import EmailNotConfiguredError, send_email
from app.modules.girls.utils import MACEIO_TZ

logger = logging.getLogger(__name__)

SUBJECT = "Seu convite para coordenar {group} na NISE"
BODY = """Oi, {first_name}!

A equipe da NISE te convidou para coordenar o grupo {group}.

Criar minha conta: {url}

O link vale até {expires} e só funciona uma vez, com este e-mail.

Equipe NISE
"""

# Tela de criar a conta da coordenadora, no front (outra story).
ACCEPT_PATH = "/convite/coordenadora"


def invite_url(token: str) -> str:
    query = urlencode({"token": token})
    return f"{settings.app_url.rstrip('/')}{ACCEPT_PATH}?{query}"


def first_name(name: str) -> str:
    parts = name.split()
    return parts[0] if parts else name


def format_date(moment: datetime) -> str:
    return moment.astimezone(MACEIO_TZ).strftime("%d/%m/%Y")


def send_coordinator_invite_email(
    to: str, name: str, group_name: str, token: str, expires_at: datetime
) -> bool:
    """Envia o convite. Devolve False se não saiu, e a equipe vê o alerta."""
    body = BODY.format(
        first_name=first_name(name),
        group=group_name,
        url=invite_url(token),
        expires=format_date(expires_at),
    )
    try:
        send_email(to, SUBJECT.format(group=group_name), body)
    except (
        EmailNotConfiguredError,
        smtplib.SMTPException,
        OSError,
        ValueError,
    ) as error:
        logger.warning(
            "E-mail de convite de coordenadora não enviado: %s", type(error).__name__
        )
        return False
    return True
