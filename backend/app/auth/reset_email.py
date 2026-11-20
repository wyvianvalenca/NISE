"""O e-mail com o link para criar uma senha nova (A16, #331, RF-S2.04).

Vale para menina e coordenadora. Ele chega sempre, sem depender de
preferência (EmailKind.PASSWORD_RESET, RN-30). O link leva à A16b, que só
funciona uma vez e vence em PASSWORD_RESET_EXPIRE_MINUTES.

Os logs só levam o tipo do erro, nunca o endereço nem o link: o token do link
dá acesso à conta.
"""

import logging
import smtplib
from urllib.parse import urlencode

from app.config import settings

logger = logging.getLogger(__name__)

# Texto a confirmar com o design: não há tela no Figma para o e-mail.
SUBJECT = "Crie uma nova senha na NISE"
BODY = """Oi!

Pediram um link pra criar uma senha nova na sua conta da NISE. Se foi você, \
é só abrir o link abaixo. Ele vale por {minutes} minutos e funciona uma vez só.

Criar uma nova senha: {url}

Se não foi você, ignore este e-mail: sua senha continua a mesma.

Equipe NISE
"""

# A16b "Crie uma nova senha", no front.
RESET_PATH = "/entrar/nova-senha"


# TEMPORÁRIO: o envio de e-mail chega com o PR #287 (app/core/email.py).
# Quando ele entrar, apague a classe e a função abaixo e importe as de lá:
#     from app.core.email import EmailNotConfiguredError, send_email
# Elas têm o mesmo nome e a mesma assinatura, então o resto do arquivo e os
# testes não mudam. Até lá, o pedido de nova senha responde normalmente e o
# e-mail não sai.
class EmailNotConfiguredError(Exception):
    """O envio de e-mail ainda não existe neste ramo (#287)."""


def send_email(to: str, subject: str, body: str) -> None:
    raise EmailNotConfiguredError


def reset_url(token: str) -> str:
    """O link da A16b com o token, no endereço público do app."""
    query = urlencode({"token": token})
    return f"{settings.app_url.rstrip('/')}{RESET_PATH}?{query}"


def send_reset_email(to: str, token: str) -> None:
    """Envia o link de nova senha.

    Roda como tarefa de fundo, depois da resposta do pedido: a A16 não espera
    o servidor de e-mail (o que denunciaria que a conta existe), e uma falha
    no envio não vira erro na tela dela.
    """
    body = BODY.format(
        minutes=settings.password_reset_expire_minutes, url=reset_url(token)
    )

    try:
        send_email(to, SUBJECT, body)
    except (EmailNotConfiguredError, smtplib.SMTPException, OSError) as error:
        logger.warning("E-mail de nova senha não enviado: %s", type(error).__name__)
