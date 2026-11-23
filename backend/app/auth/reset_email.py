"""O e-mail com o link para criar uma senha nova (A16, #331, RF-S2.04).

Vale para menina e coordenadora. Ele chega sempre, sem depender de
preferência (EmailKind.PASSWORD_RESET, RN-30). O link leva à A16b, que só
funciona uma vez e vence em PASSWORD_RESET_EXPIRE_MINUTES.

O pedido (POST /auth/password/forgot) só agenda `send_reset_link` e responde.
Buscar a conta, criar o token e enviar ficam todos depois da resposta, para
ela levar o mesmo tempo exista a conta ou não: a A16 não pode dizer quem tem
conta (revisão do #332).

Os logs só levam o tipo do erro, nunca o endereço nem o link: o token do link
dá acesso à conta.
"""

import asyncio
import logging
import smtplib
from urllib.parse import urlencode

from sqlalchemy.exc import SQLAlchemyError

from app.auth.service import create_password_reset_token
from app.config import settings
from app.core.email import EmailNotConfiguredError, send_email
from app.db.engine import SessionLocal
from app.users.service import get_user_by_email

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


def reset_url(token: str) -> str:
    """O link da A16b com o token, no endereço público do app."""
    query = urlencode({"token": token})
    return f"{settings.app_url.rstrip('/')}{RESET_PATH}?{query}"


async def send_reset_link(email: str) -> None:
    """Tarefa de fundo do pedido de nova senha: acha a conta, cria o link e o
    envia. Sem conta com esse e-mail, não faz nada.

    Usa uma sessão própria, porque a da rota já fechou quando ela roda. Uma
    falha aqui não chega à tela dela, que já recebeu a resposta.
    """
    try:
        async with SessionLocal() as session:
            user = await get_user_by_email(session, email)
            if user is None:
                return
            token = await create_password_reset_token(session, user)
    except (SQLAlchemyError, OSError) as error:
        # A mensagem do SQLAlchemy pode trazer o e-mail nos parâmetros da
        # consulta: só o tipo vai para o log.
        logger.warning("Link de nova senha não criado: %s", type(error).__name__)
        return

    # O smtplib é síncrono: numa thread, para não travar o servidor.
    await asyncio.to_thread(send_reset_email, user.email, token)


def send_reset_email(to: str, token: str) -> None:
    """Envia o link de nova senha. Uma falha no envio só vai para o log."""
    body = BODY.format(
        minutes=settings.password_reset_expire_minutes, url=reset_url(token)
    )

    try:
        send_email(to, SUBJECT, body)
    except (
        EmailNotConfiguredError,
        smtplib.SMTPException,
        OSError,
        ValueError,
    ) as error:
        # ValueError: endereço com quebra de linha, recusado antes de sair.
        logger.warning("E-mail de nova senha não enviado: %s", type(error).__name__)
