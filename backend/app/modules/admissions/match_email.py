"""O e-mail que avisa a menina de que achamos o nome dela numa lista (#275).

RF-F31.11, RN-30, D-50, RNF-F4.01. O e-mail só avisa e leva à "Sua agenda"
(#266); a resposta é dada no app (RF-F31.04). Ele não cita a lista, o curso nem
a instituição (RNF-F31.02), e nenhuma rota devolve este e-mail.

1. Quando a busca cria um indício, `queue_match_email` põe o e-mail na fila,
   só se ela aceitou e-mails de oportunidades.
2. A rotina agendada (`/api/cron/match-emails`) chama `send_match_emails`, que
   relê o indício e a preferência logo antes de enviar.

Os logs só levam contagens e o tipo do erro, nunca nome nem endereço.
"""

import asyncio
import logging
import smtplib
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.email import EmailNotConfiguredError, send_email
from app.modules.admissions.models import ListMatch, MatchEmail
from app.modules.girls.models import Girl
from app.users.models import User

logger = logging.getLogger(__name__)

# Texto a confirmar com o design (Wyvian): não há tela no Figma para ele.
SUBJECT = "Achamos seu nome numa lista de aprovados!"
BODY = """Oi!

A NISE achou seu nome numa lista de aprovados. Tem uma pergunta rápida \
esperando por você na sua agenda: é você mesma?

Responder na agenda: {agenda_url}

Se não for você, tudo bem: é só responder "Não sou eu" no app.

Você recebe este e-mail porque aceitou receber oportunidades por e-mail. \
Pra não receber mais, desligue essa opção no app.

Equipe NISE
"""

# Quantos e-mails uma chamada da rotina tenta enviar, para caber no limite de
# duração da hospedagem. O que sobrar vai na próxima.
BATCH_SIZE = 50


def accepts_opportunity_emails(user: User) -> bool:
    """Ela aceitou receber e-mails de oportunidades? (RN-30, D-50)

    A preferência é a coluna `users.opportunity_emails` do #202 (#49). Quando
    ele entrar, troque o corpo por
    `can_send_email(user, EmailKind.OPPORTUNITIES)` de
    app/modules/consents/service.py. Até lá a coluna não existe e a resposta é
    não: na dúvida, não envia.
    """
    return getattr(user, "opportunity_emails", False) is True


def agenda_url() -> str:
    # A agenda mostra o item no topo de "Pra responder" (#266).
    return f"{settings.app_url.rstrip('/')}/agenda"


def match_email_body() -> str:
    return BODY.format(agenda_url=agenda_url())


async def _user_of_girl(session: AsyncSession, girl_id: int) -> User | None:
    return await session.scalar(
        select(User).join(Girl, Girl.user_id == User.id).where(Girl.id == girl_id)
    )


async def queue_match_email(session: AsyncSession, match: ListMatch) -> bool:
    """Põe na fila o e-mail do indício recém-criado, se ela aceitou.

    Chamada por `create_match`. Não faz commit nem envia nada: quem chama
    grava a rodada inteira de uma vez. Devolve se entrou na fila.
    """
    user = await _user_of_girl(session, match.girl_id)
    if user is None or not accepts_opportunity_emails(user):
        return False

    session.add(MatchEmail(list_match=match))
    return True


@dataclass(frozen=True)
class SendResult:
    sent: int
    dropped: int
    # True se a rotina parou num erro de envio; o resto fica para a próxima.
    stopped: bool


def _still_wanted(match: ListMatch, user: User, now: datetime) -> bool:
    # O indício está sem resposta e dentro do prazo, e ela continua aceitando
    # e-mails de oportunidades.
    if match.answered_at is not None or match.expires_at <= now:
        return False
    return accepts_opportunity_emails(user)


async def send_match_emails(
    session: AsyncSession,
    send: Callable[[str, str, str], None] = send_email,
    now: datetime | None = None,
) -> SendResult:
    """Envia os e-mails da fila, um de cada vez, e devolve só contagens.

    Cada e-mail é travado (FOR UPDATE SKIP LOCKED) e gravado como enviado ou
    descartado no seu próprio commit: duas rotinas ao mesmo tempo nunca pegam o
    mesmo, e uma rotina rodando de novo não reenvia (RNF-F4.01). Se o envio
    falhar ou não estiver configurado, para e deixa o resto na fila.
    """
    if now is None:
        now = datetime.now(UTC)

    pending = (
        MatchEmail.sent_at.is_(None),
        MatchEmail.dropped_at.is_(None),
    )
    ids = (
        await session.scalars(
            select(MatchEmail.id)
            .where(*pending)
            .order_by(MatchEmail.id)
            .limit(BATCH_SIZE)
        )
    ).all()

    sent = dropped = 0
    for email_id in ids:
        email = await session.scalar(
            select(MatchEmail)
            .where(MatchEmail.id == email_id, *pending)
            .with_for_update(skip_locked=True)
        )
        if email is None:
            # Outra rotina pegou ou já resolveu este.
            continue

        # Relê o indício e a preferência logo antes de enviar.
        match = await session.get(
            ListMatch, email.list_match_id, populate_existing=True
        )
        user = await _user_of_girl(session, match.girl_id) if match else None

        if match is None or user is None or not _still_wanted(match, user, now):
            email.dropped_at = now
            await session.commit()
            dropped += 1
            continue

        try:
            await asyncio.to_thread(send, user.email, SUBJECT, match_email_body())
        except (EmailNotConfiguredError, smtplib.SMTPException, OSError) as error:
            # A mensagem do erro pode trazer o endereço: só o tipo vai ao log.
            await session.rollback()
            logger.warning(
                "Envio dos e-mails de indício parou: %s", type(error).__name__
            )
            return SendResult(sent=sent, dropped=dropped, stopped=True)

        email.sent_at = now
        await session.commit()
        sent += 1

    logger.info("E-mails de indício: %s enviados, %s descartados", sent, dropped)
    return SendResult(sent=sent, dropped=dropped, stopped=False)
