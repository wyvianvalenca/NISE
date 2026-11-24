"""O e-mail que avisa a menina de que achamos o nome dela numa lista (#275).

RF-F31.11, RN-30, D-50, RNF-F4.01. O e-mail só avisa e leva à "Sua agenda"
(#266); a resposta é dada no app (RF-F31.04). Ele não cita a lista, o curso nem
a instituição (RNF-F31.02), e nenhuma rota devolve este e-mail.

1. Quando a busca cria um indício, `queue_match_email` põe o e-mail na fila,
   só se ela aceitou e-mails de oportunidades.
2. A rotina agendada (`/api/cron/match-emails`) chama `send_match_emails`, que
   relê o indício e a preferência logo antes de enviar, por uma conexão SMTP
   só para o lote.

Os logs só levam contagens e o tipo do erro, nunca nome nem endereço.
"""

import asyncio
import logging
import smtplib
import time
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Protocol

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.email import EmailNotConfiguredError, SmtpConnection, send_outcome
from app.modules.admissions.models import ListMatch, MatchEmail
from app.modules.consents.service import EmailKind, can_send_email
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

# Quantos e-mails uma chamada da rotina tenta enviar, e por quanto tempo, para
# caber no limite de duração da hospedagem. O que sobrar vai na próxima.
BATCH_SIZE = 50
TIME_BUDGET_SECONDS = 40.0


class Sender(Protocol):
    """Uma conexão aberta que envia vários e-mails (app.core.email)."""

    def send(self, to: str, subject: str, body: str) -> None: ...

    def close(self) -> None: ...


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
    if user is None or not can_send_email(user, EmailKind.OPPORTUNITIES):
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
    # e-mails de oportunidades (RN-30).
    if match.answered_at is not None or match.expires_at <= now:
        return False
    return can_send_email(user, EmailKind.OPPORTUNITIES)


async def _close(connection: Sender) -> None:
    # O SmtpConnection.close já ignora erro no QUIT: o que foi aceito, foi.
    try:
        await asyncio.to_thread(connection.close)
    except (smtplib.SMTPException, OSError) as error:
        logger.warning("Conexão SMTP não fechou: %s", type(error).__name__)


async def send_match_emails(
    session: AsyncSession,
    connect: Callable[[], Sender] = SmtpConnection,
    now: datetime | None = None,
    clock: Callable[[], float] = time.monotonic,
) -> SendResult:
    """Envia os e-mails da fila por uma conexão só e devolve só contagens.

    Conecta, faz STARTTLS e login uma vez, antes do primeiro e-mail: se isso
    falha (sem configuração, porta errada, senha errada), a rotina para e a
    fila fica como estava.

    Cada e-mail é travado (FOR UPDATE SKIP LOCKED) e marcado como enviado num
    commit antes de sair. Duas rotinas ao mesmo tempo nunca pegam o mesmo, e
    uma rotina cortada no meio pela hospedagem não reenvia (RNF-F4.01): no
    máximo uma vez. Se o envio falha sem ter saído, a marca é desfeita (ou o
    e-mail é descartado, se o problema é dele). Para depois de BATCH_SIZE
    e-mails ou TIME_BUDGET_SECONDS; o resto fica na fila.

    Ela recebe um e-mail só por rodada, mesmo com dois indícios novos: o
    outro é descartado, e a agenda mostra os dois.
    """
    if now is None:
        now = datetime.now(UTC)
    started = clock()

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
    if not ids:
        return SendResult(sent=0, dropped=0, stopped=False)

    try:
        connection = await asyncio.to_thread(connect)
    except (EmailNotConfiguredError, smtplib.SMTPException, OSError) as error:
        # A mensagem do erro pode trazer o endereço: só o tipo vai ao log.
        await session.rollback()
        logger.warning("Envio dos e-mails de indício parou: %s", type(error).__name__)
        return SendResult(sent=0, dropped=0, stopped=True)

    sent = dropped = 0
    emailed: set[int] = set()
    stopped = False
    try:
        for email_id in ids:
            if clock() - started >= TIME_BUDGET_SECONDS:
                break

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

            if (
                match is None
                or user is None
                or not _still_wanted(match, user, now)
                or user.id in emailed
            ):
                email.dropped_at = now
                await session.commit()
                dropped += 1
                continue

            # Marca antes de enviar: no máximo uma vez.
            address = user.email
            email.sent_at = now
            await session.commit()

            try:
                await asyncio.to_thread(
                    connection.send, address, SUBJECT, match_email_body()
                )
            # Qualquer erro: um endereço inválido (ValueError) ou outro erro do
            # e-mail em si não pode travar a fila nem virar 500 (revisão do #287).
            except Exception as error:  # noqa: BLE001
                outcome = send_outcome(error)
                # A mensagem do erro pode trazer o endereço: só o tipo vai ao log.
                logger.warning(
                    "E-mail de indício não enviado (%s): %s",
                    outcome,
                    type(error).__name__,
                )
                if outcome == "drop":
                    email.sent_at = None
                    email.dropped_at = now
                    await session.commit()
                    dropped += 1
                    continue
                if outcome == "retry":
                    email.sent_at = None
                    await session.commit()
                stopped = True
                break

            emailed.add(user.id)
            sent += 1
    finally:
        await _close(connection)

    logger.info("E-mails de indício: %s enviados, %s descartados", sent, dropped)
    return SendResult(sent=sent, dropped=dropped, stopped=stopped)
