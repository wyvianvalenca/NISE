"""Envio de e-mail pela conta Gmail da equipe (#275).

Usa o `smtplib` da biblioteca padrão, com STARTTLS e senha de app do Google
(SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, EMAIL_FROM no .env).

É síncrono: numa rota ou rotina assíncrona, chame com
`await asyncio.to_thread(send_email, ...)`. Quem chama decide quando enviar
(a fila, a preferência dela) e nunca escreve o endereço nem o texto nos logs.
"""

import smtplib
import ssl
from email.message import EmailMessage

from app.config import settings


class EmailNotConfiguredError(Exception):
    """SMTP_USER ou SMTP_PASSWORD vazios: o envio está desligado."""


def email_is_configured() -> bool:
    return bool(settings.smtp_user and settings.smtp_password)


def send_email(to: str, subject: str, body: str) -> None:
    """Envia um e-mail em texto puro.

    Levanta EmailNotConfiguredError se a conta não está configurada, e as
    exceções do smtplib (SMTPException) ou de rede (OSError) se o envio falhar.
    As mensagens dessas exceções podem trazer o endereço: registre só o tipo.
    """
    if not email_is_configured():
        raise EmailNotConfiguredError

    message = EmailMessage()
    message["From"] = settings.email_from or settings.smtp_user
    message["To"] = to
    message["Subject"] = subject
    message.set_content(body)

    with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=30) as smtp:
        smtp.starttls(context=ssl.create_default_context())
        smtp.login(settings.smtp_user, settings.smtp_password)
        smtp.send_message(message)
