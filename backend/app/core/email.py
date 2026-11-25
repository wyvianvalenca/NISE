"""Envio de e-mail pela conta Gmail da equipe (#275).

Usa o `smtplib` da biblioteca padrão, com STARTTLS e senha de app do Google
(SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, EMAIL_FROM no .env).

É síncrono: numa rota ou rotina assíncrona, chame com
`await asyncio.to_thread(...)`. Quem chama decide quando enviar (a fila, a
preferência dela) e nunca escreve o endereço nem o texto nos logs: as
mensagens das exceções do smtplib podem trazer o endereço, então registre só
o tipo.

- `send_email`: um e-mail avulso (ex.: o link de nova senha). Com `html`, sai
  também uma versão em HTML (ex.: o convite da coordenadora, com o botão).
- `SmtpConnection`: uma conexão para vários e-mails seguidos (a fila dos
  indícios). Conecta, faz STARTTLS e login uma vez só, então um erro de
  configuração aparece antes do primeiro envio, e não como erro de um e-mail.
"""

import smtplib
import ssl
from email.message import EmailMessage
from types import TracebackType
from typing import Literal, Self

from app.config import settings

# Quanto esperar o servidor em cada leitura, em segundos.
SMTP_TIMEOUT_SECONDS = 30


class EmailNotConfiguredError(Exception):
    """SMTP_USER ou SMTP_PASSWORD vazios: o envio está desligado."""


def email_is_configured() -> bool:
    return bool(settings.smtp_user and settings.smtp_password)


def build_message(
    to: str, subject: str, body: str, *, html: str | None = None
) -> EmailMessage:
    """Monta um e-mail em texto puro.

    Com `html`, o e-mail sai em duas partes (multipart/alternative): o texto
    puro para quem não lê HTML e o HTML como alternativa. Sem ele, é uma parte
    só, como sempre foi.

    Levanta ValueError se o endereço ou o assunto têm quebra de linha: um
    cabeçalho a mais injetado pelo endereço nunca chega a ser enviado.
    """
    message = EmailMessage()
    message["From"] = settings.email_from or settings.smtp_user
    message["To"] = to
    message["Subject"] = subject
    message.set_content(body)
    if html is not None:
        message.add_alternative(html, subtype="html")
    return message


class SmtpConnection:
    """Uma conexão já autenticada com o servidor SMTP.

    Abrir levanta EmailNotConfiguredError sem conta configurada, e as exceções
    do smtplib (SMTPException) ou de rede (OSError) se a conexão, o STARTTLS
    ou o login falham: são erros de configuração ou do servidor, nunca de um
    e-mail. Use com `with`, ou chame `close()` no fim.
    """

    def __init__(self, timeout: float = SMTP_TIMEOUT_SECONDS) -> None:
        if not email_is_configured():
            raise EmailNotConfiguredError

        smtp = smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=timeout)
        try:
            smtp.starttls(context=ssl.create_default_context())
            smtp.login(settings.smtp_user, settings.smtp_password)
        except BaseException:
            smtp.close()
            raise
        self._smtp = smtp

    def send(
        self, to: str, subject: str, body: str, *, html: str | None = None
    ) -> None:
        """Envia um e-mail nesta conexão (com `html`, também a versão em HTML).

        Levanta ValueError (endereço inválido, antes de falar com o servidor),
        as exceções do smtplib ou OSError.
        """
        self._smtp.send_message(build_message(to, subject, body, html=html))

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


def send_email(to: str, subject: str, body: str, *, html: str | None = None) -> None:
    """Envia um e-mail avulso, com uma conexão só para ele.

    Com `html`, vai também a versão em HTML (veja `build_message`).

    Levanta EmailNotConfiguredError se a conta não está configurada, ValueError
    se o endereço é inválido, e as exceções do smtplib (SMTPException) ou de
    rede (OSError) se o envio falhar.
    """
    with SmtpConnection() as connection:
        connection.send(to, subject, body, html=html)


# O que fazer com um erro do envio de um e-mail de uma fila (indícios, #275;
# presença, #348):
# - "drop": o problema é daquele e-mail (endereço recusado de vez, 5xx): ele é
#   descartado e a rotina segue, para não travar a fila atrás dele.
# - "retry": nada saiu e o problema é do servidor ou da conta (4xx temporário,
#   cota do Gmail, remetente recusado): a rotina para e o e-mail volta à fila.
# - "unknown": a conexão caiu no meio, e o servidor pode ter aceitado o e-mail.
#   A rotina para e o e-mail fica como tentado: na dúvida, não reenvia
#   (RNF-F4.01).
SendOutcome = Literal["drop", "retry", "unknown"]


def send_outcome(error: Exception) -> SendOutcome:
    if isinstance(error, smtplib.SMTPRecipientsRefused):
        codes = [code for code, _ in error.recipients.values()]
        return "drop" if codes and all(code >= 500 for code in codes) else "retry"
    if isinstance(error, smtplib.SMTPSenderRefused):
        # O remetente é o mesmo em todos os e-mails: é configuração.
        return "retry"
    if isinstance(error, smtplib.SMTPResponseException):
        return "drop" if 500 <= error.smtp_code < 600 else "retry"
    if isinstance(error, smtplib.SMTPNotSupportedError):
        # No envio (a conexão já passou do STARTTLS e do login), é o endereço
        # dela que pede algo que o servidor não tem, como SMTPUTF8.
        return "drop"
    if isinstance(error, smtplib.SMTPServerDisconnected):
        return "unknown"
    if isinstance(error, smtplib.SMTPException):
        return "retry"
    if isinstance(error, OSError):
        return "unknown"
    # ValueError de um endereço inválido, UnicodeEncodeError e qualquer outro
    # erro do e-mail em si: sem descartar, ele ficaria primeiro na fila e
    # travaria todas as rodadas seguintes.
    return "drop"
