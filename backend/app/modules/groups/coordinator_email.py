"""O e-mail do convite da coordenadora (CV00, #453, RF-S2.31).

Sai pela conta Gmail da equipe (app/core/email.py, #275) em duas partes: o
texto puro (com o link escrito, para quem não lê HTML) e o HTML do Figma CV00,
com o botão "Criar minha conta". A linha "Que bom ter você com a gente!" saiu
no card de design #438. Assunto e nome do remetente não estão no Figma: o
assunto é uma suposição.

Os logs só levam o tipo do erro, nunca o nome, o e-mail nem o link: o link dá
acesso à criação da conta.
"""

import html
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

A equipe NISE te convidou pra coordenar o grupo {group} na NISE.

Criar minha conta: {url}

O link vale até {expires} e funciona uma vez só. Se não esperava este convite, \
é só ignorar.
"""

# HTML de e-mail: tabelas e CSS inline, sem imagens nem fontes externas.
FONT = "'DM Sans', Arial, sans-serif"
HTML_BODY = f"""<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Convite NISE</title>
</head>
<body style="margin:0;padding:24px 16px;background-color:#ffffff;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" \
border="0">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" \
border="0" style="max-width:480px;background-color:#fcf6ec;\
border:1px solid #c9bbaa;border-radius:16px;">
<tr><td style="padding:32px;font-family:{FONT};color:#0a3b48;">
<p style="margin:0 0 24px;font-size:16px;line-height:24px;font-weight:700;\
letter-spacing:1px;">NISE</p>
<h1 style="margin:0 0 12px;font-family:{FONT};font-size:24px;line-height:32px;\
font-weight:700;color:#0a3b48;">Oi, {{first_name}}!</h1>
<p style="margin:0 0 24px;font-size:16px;line-height:24px;">A equipe NISE te \
convidou pra coordenar o grupo <strong>{{group}}</strong> na NISE.</p>
<table role="presentation" cellpadding="0" cellspacing="0" border="0">
<tr><td style="border-radius:8px;background-color:#0a3b48;">
<a href="{{url}}" style="display:inline-block;padding:14px 20px;\
font-family:{FONT};font-size:14px;line-height:20px;font-weight:500;\
color:#fcf6ec;text-decoration:none;border-radius:8px;">Criar minha conta</a>
</td></tr>
</table>
<p style="margin:24px 0 0;font-size:12px;line-height:18px;color:#496a70;">\
O link vale até {{expires}} e funciona uma vez só. Se não esperava este \
convite, é só ignorar.</p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>
"""

# Tela de criar a conta da coordenadora, no front (outra story).
ACCEPT_PATH = "/convite/coordenadora"

MONTHS = (
    "jan",
    "fev",
    "mar",
    "abr",
    "mai",
    "jun",
    "jul",
    "ago",
    "set",
    "out",
    "nov",
    "dez",
)


def invite_url(token: str) -> str:
    query = urlencode({"token": token})
    return f"{settings.app_url.rstrip('/')}{ACCEPT_PATH}?{query}"


def first_name(name: str) -> str:
    parts = name.split()
    return parts[0] if parts else name


def format_date(moment: datetime) -> str:
    """O dia e o mês abreviado ("30 de nov"), no fuso de Maceió."""
    local = moment.astimezone(MACEIO_TZ)
    return f"{local.day} de {MONTHS[local.month - 1]}"


def build_invite_email(
    name: str, group_name: str, token: str, expires_at: datetime
) -> tuple[str, str]:
    """O texto puro e o HTML do convite. O nome e o grupo vão escapados no HTML."""
    url = invite_url(token)
    expires = format_date(expires_at)
    text = BODY.format(
        first_name=first_name(name), group=group_name, url=url, expires=expires
    )
    page = HTML_BODY.format(
        first_name=html.escape(first_name(name)),
        group=html.escape(group_name),
        url=html.escape(url),
        expires=expires,
    )
    return text, page


def send_coordinator_invite_email(
    to: str, name: str, group_name: str, token: str, expires_at: datetime
) -> bool:
    """Envia o convite. Devolve False se não saiu, e a equipe vê o alerta."""
    body, page = build_invite_email(name, group_name, token, expires_at)
    try:
        send_email(to, SUBJECT.format(group=group_name), body, html=page)
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
