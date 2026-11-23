"""O envio do lembrete "Me lembra um dia antes" (RF-F4.12, #188, RN-30, RNF-F4.01).

A rotina agendada (`/api/cron/event-reminders`) chama `send_event_reminders` uma
vez por dia:

1. `reminders_due` acha, travadas, as inscritas com o lembrete ligado e o
   evento amanhã; `mark_reminder_sent` marca cada uma e o commit grava tudo
   antes de qualquer envio. Duas rodadas ao mesmo tempo não mandam o mesmo
   lembrete: a segunda espera o commit da primeira e já não acha a linha.
2. Cada e-mail passa por `can_send_email` (RN-30) e sai por uma conexão SMTP só.

A marca vem antes do envio: na dúvida ela fica sem um lembrete, nunca recebe
dois. Só quando se sabe que nada saiu (conexão que não abre, erro temporário do
servidor) a marca é desfeita, para a rodada poder ser repetida no mesmo dia.

Os logs só levam contagens e o tipo do erro, nunca nome nem endereço.
"""

import asyncio
import logging
import re
import smtplib
import time
from collections.abc import Callable
from dataclasses import dataclass
from datetime import date

from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.email import (
    EmailNotConfiguredError,
    SendOutcome,
    SmtpConnection,
    send_outcome,
)
from app.modules.actions.service import today_in_maceio
from app.modules.admissions.match_email import Sender
from app.modules.consents.service import EmailKind, can_send_email
from app.modules.events.service import (
    DueReminder,
    mark_reminder_sent,
    reminder_email,
    reminders_due,
)
from app.modules.girl_file.models import FileEntry

logger = logging.getLogger(__name__)

# Quantos lembretes uma chamada da rotina marca e tenta enviar, e por quanto
# tempo, para caber no limite de duração da hospedagem (como no e-mail do
# indício, #287). Uma rotina cortada no meio deixaria marcadas as meninas que
# não foram alcançadas; o que sobrar sai se a rotina for repetida no mesmo dia.
BATCH_SIZE = 50
TIME_BUDGET_SECONDS = 40.0

# Código de status estendido (RFC 3463) no começo da resposta do servidor, como
# "5.1.1" ou "5.4.5".
_ENHANCED_CODE = re.compile(rb"([245])\.(\d{1,3})\.\d{1,3}\b")


def _about_mailbox(message: bytes | str, *, rcpt: bool) -> bool:
    """O 5xx fala do endereço dela (caixa que não existe, endereço inválido)?"""
    if isinstance(message, str):
        message = message.encode()
    found = _ENHANCED_CODE.match(message.strip())
    if found is None:
        # Sem código estendido, só a recusa do destinatário (RCPT) é do endereço.
        return rcpt
    return found.group(1) == b"5" and found.group(2) in (b"1", b"2")


def reminder_outcome(error: Exception) -> SendOutcome:
    """Como `send_outcome`, mas um 5xx só descarta o lembrete se é do endereço.

    Cota diária (5.4.5), bloqueio de conteúdo (5.7.x) e outros 5xx no DATA são
    da conta ou do servidor: valem para os lembretes que faltam também, então a
    rotina para e desfaz a marca, como num 4xx.
    """
    outcome = send_outcome(error)
    if outcome != "drop":
        return outcome
    if isinstance(error, smtplib.SMTPRecipientsRefused):
        about_address = all(
            _about_mailbox(message, rcpt=True)
            for _, message in error.recipients.values()
        )
        return "drop" if about_address else "retry"
    if isinstance(error, smtplib.SMTPResponseException):
        return "drop" if _about_mailbox(error.smtp_error, rcpt=False) else "retry"
    return outcome


@dataclass(frozen=True)
class SendResult:
    sent: int
    # Lembretes que não saíram por causa daquele e-mail (endereço recusado).
    dropped: int
    # True se a rotina parou num erro de envio; o resto não sai nesta rodada.
    stopped: bool


@dataclass(frozen=True)
class _Outgoing:
    """Um lembrete pronto: tudo que o envio precisa, lido antes do commit."""

    entry_id: int
    address: str
    subject: str
    body: str
    # A marca de antes, para desfazer se se sabe que nada saiu.
    previous_sent_for: date | None


def event_url(item_id: str) -> str:
    return f"{settings.app_url.rstrip('/')}/file/evento/{item_id}"


def _outgoing(due: list[DueReminder]) -> tuple[list[_Outgoing], bool]:
    """Marca e prepara os lembretes que ela aceitou, ainda na transação.

    Marca no máximo BATCH_SIZE; devolve também se sobrou algum para depois.
    """
    outgoing: list[_Outgoing] = []
    for reminder in due:
        # O lembrete é por evento: a escolha da linha é o que vale (RN-30).
        if not can_send_email(
            reminder.user, EmailKind.EVENT_REMINDER, reminder_on=reminder.entry.reminder
        ):
            continue
        if len(outgoing) >= BATCH_SIZE:
            return outgoing, True
        previous = reminder.entry.reminder_sent_for
        mark_reminder_sent(reminder)
        subject, body = reminder_email(reminder, event_url(reminder.item_id))
        outgoing.append(
            _Outgoing(reminder.entry.id, reminder.user.email, subject, body, previous)
        )
    return outgoing, False


async def _unmark(session: AsyncSession, outgoing: list[_Outgoing]) -> None:
    """Desfaz a marca dos lembretes que não saíram, para repetir a rodada."""
    for item in outgoing:
        await session.execute(
            update(FileEntry)
            .where(FileEntry.id == item.entry_id)
            .values(reminder_sent_for=item.previous_sent_for)
        )
    await session.commit()


async def send_event_reminders(
    session: AsyncSession,
    today: date | None = None,
    connect: Callable[[], Sender] = SmtpConnection,
    clock: Callable[[], float] = time.monotonic,
) -> SendResult:
    """Envia os lembretes de hoje (os eventos de amanhã) e devolve só contagens.

    Para depois de BATCH_SIZE lembretes ou TIME_BUDGET_SECONDS: o que falta é
    desmarcado e sai se a rotina for repetida (`stopped`).
    """
    if today is None:
        today = today_in_maceio()
    started = clock()

    outgoing, left_over = _outgoing(await reminders_due(session, today))
    # Grava as marcas e solta as linhas travadas antes de falar com o SMTP.
    await session.commit()
    if not outgoing:
        return SendResult(sent=0, dropped=0, stopped=False)

    try:
        connection = await asyncio.to_thread(connect)
    except (EmailNotConfiguredError, smtplib.SMTPException, OSError) as error:
        # Nada saiu: desmarca, e a rodada pode ser repetida. A mensagem do erro
        # pode trazer o endereço: só o tipo vai ao log.
        await _unmark(session, outgoing)
        logger.warning("Envio dos lembretes parou: %s", type(error).__name__)
        return SendResult(sent=0, dropped=0, stopped=True)

    sent = dropped = 0
    stopped = left_over
    try:
        for index, item in enumerate(outgoing):
            if clock() - started >= TIME_BUDGET_SECONDS:
                # Acabou o tempo: os que faltam não foram tentados, e a marca volta.
                stopped = True
                await _unmark(session, outgoing[index:])
                break
            try:
                await asyncio.to_thread(
                    connection.send, item.address, item.subject, item.body
                )
            # Qualquer erro: um endereço inválido (ValueError) ou outro erro do
            # e-mail em si não pode travar os outros lembretes nem virar 500.
            except Exception as error:  # noqa: BLE001
                outcome = reminder_outcome(error)
                # A mensagem do erro pode trazer o endereço: só o tipo vai ao log.
                logger.warning(
                    "Lembrete não enviado (%s): %s", outcome, type(error).__name__
                )
                if outcome == "drop":
                    # O problema é deste e-mail: não adianta repetir, e os
                    # outros seguem.
                    dropped += 1
                    continue
                # O erro é do servidor ou da conta: os que faltam não saem. Se
                # nada saiu com este, a marca dele e a dos que faltam voltam;
                # se a conexão caiu no meio ("unknown"), este fica marcado
                # (RNF-F4.01) e só os que faltam voltam.
                stopped = True
                waiting = outgoing[index + 1 :]
                await _unmark(
                    session, waiting if outcome == "unknown" else waiting + [item]
                )
                break
            sent += 1
    finally:
        try:
            await asyncio.to_thread(connection.close)
        except (smtplib.SMTPException, OSError) as error:
            logger.warning("Conexão SMTP não fechou: %s", type(error).__name__)

    logger.info("Lembretes de evento: %s enviados, %s descartados", sent, dropped)
    return SendResult(sent=sent, dropped=dropped, stopped=stopped)
