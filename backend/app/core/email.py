"""Envio de e-mail pela conta Gmail da equipe (#275).

Usa o `smtplib` da biblioteca padrão, com STARTTLS e senha de app do Google
(SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, EMAIL_FROM no .env).

É síncrono: numa rota ou rotina assíncrona, chame com
`await asyncio.to_thread(...)`. Quem chama decide quando enviar (a fila, a
preferência dela) e nunca escreve o endereço nem o texto nos logs: as
mensagens das exceções do smtplib podem trazer o endereço, então registre só
o tipo.

- `send_email`: um e-mail avulso (ex.: o link de nova senha).
- `SmtpConnection`: uma conexão para vários e-mails seguidos (a fila dos
  indícios). Conecta, faz STARTTLS e login uma vez só, então um erro de
  configuração aparece antes do primeiro envio, e não como erro de um e-mail.
"""

import smtplib
import ssl
from email.message import EmailMessage
from types import TracebackType
from typing import Self

from app.config import settings

# Quanto esperar o servidor em cada leitura, em segundos.
SMTP_TIMEOUT_SECONDS = 30


class EmailNotConfiguredError(Exception):
    """SMTP_USER ou SMTP_PASSWORD vazios: o envio está desligado."""


def email_is_configured() -> bool:
    return bool(settings.smtp_user and settings.smtp_password)


def build_message(to: str, subject: str, body: str) -> EmailMessage:
    """Monta um e-mail em texto puro.

    Levanta ValueError se o endereço ou o assunto têm quebra de linha: um
    cabeçalho a mais injetado pelo endereço nunca chega a ser enviado.
    """
    message = EmailMessage()
    message["From"] = settings.email_from or settings.smtp_user
    message["To"] = to
    message["Subject"] = subject
    message.set_content(body)
    return message


class SmtpConnection:
    """Uma conexão já autenticada com o servidor SMTP.

    Abrir levanta EmailNotConfiguredError sem conta configurada, e as exceções
    do smtplib (SMTPException) ou de rede (OSError) se a conexão, o STARTTLS
    ou o login falham: são erros de configuração ou do servidor, nunca de um
    e-mail. Use com `with`, ou chame `close()` no fim.
    """

    def __init__(self) -> None:
        if not email_is_configured():
            raise EmailNotConfiguredError

        smtp = smtplib.SMTP(
            settings.smtp_host, settings.smtp_port, timeout=SMTP_TIMEOUT_SECONDS
        )
        try:
            smtp.starttls(context=ssl.create_default_context())
            smtp.login(settings.smtp_user, settings.smtp_password)
        except BaseException:
            smtp.close()
            raise
        self._smtp = smtp

    def send(self, to: str, subject: str, body: str) -> None:
        """Envia um e-mail nesta conexão.

        Levanta ValueError (endereço inválido, antes de falar com o servidor),
        as exceções do smtplib ou OSError.
        """
        self._smtp.send_message(build_message(to, subject, body))

    def close(self) -> None:
        """Encerra a conversa. Um erro no QUIT não desfaz o que já foi aceito."""
        try:
            self._smtp.quit()
        except (smtplib.SMTPException, OSError):
            pass
        finally:
            self._smtp.close()

    def __enter__(self) -> Self:
        return self

    def __exit__(
        self,
        exc_type: type[BaseException] | None,
        exc: BaseException | None,
        traceback: TracebackType | None,
    ) -> None:
        self.close()


def send_email(to: str, subject: str, body: str) -> None:
    """Envia um e-mail avulso, com uma conexão só para ele.

    Levanta EmailNotConfiguredError se a conta não está configurada, ValueError
    se o endereço é inválido, e as exceções do smtplib (SMTPException) ou de
    rede (OSError) se o envio falhar.
    """
    with SmtpConnection() as connection:
        connection.send(to, subject, body)
