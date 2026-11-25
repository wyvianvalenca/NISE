"""O envio do lembrete "Me lembra um dia antes" (RF-F4.12, #188, RN-30, RNF-F4.01).

A rotina agendada (`/api/cron/event-reminders`) chama `send_event_reminders` uma
vez por dia, e ele envia em lotes até não haver mais nada ou acabar o tempo.
Para cada lote:

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

# Uma chamada da rotina manda em lotes de BATCH_SIZE, até acabar o que há para
# enviar ou o tempo (TIME_BUDGET_SECONDS), para caber no limite de duração da
# hospedagem (como no e-mail do indício, #287). A marca é gravada por lote: uma
# rotina cortada no meio perde, no máximo, a dos lembretes de um lote. Se o
# tempo acaba com lembrete sobrando, a rotina avisa (`stopped`) e o resto sai se
# ela for repetida no mesmo dia.
BATCH_SIZE = 50
TIME_BUDGET_SECONDS = 40.0
# Espera por resposta do servidor em cada leitura: menor que a do restante do
# app (30 s), para um envio lento não passar muito do tempo da rotina.
SMTP_TIMEOUT_SECONDS = 10
# Quantos lembretes seguidos descartados por um 5xx que não fala do endereço
# (5.1.x, 5.2.x) até a rotina desconfiar de um erro da conta que não
# conhecemos e parar.
MAX_DROPS_IN_A_ROW = 3

# Código de status estendido (RFC 3463) no começo da resposta do servidor, como
# "5.1.1" ou "5.4.5".
_ENHANCED_CODE = re.compile(rb"([245])\.(\d{1,3})\.(\d{1,3})\b")


def _enhanced_code(message: bytes | str) -> tuple[int, int, int] | None:
    if isinstance(message, str):
        message = message.encode()
    found = _ENHANCED_CODE.match(message.strip())
    if found is None:
        return None
    return int(found.group(1)), int(found.group(2)), int(found.group(3))


def _about_account(message: bytes | str) -> bool:
    """O 5xx fala da conta toda (cota de envio 5.4.5, bloqueio 5.7.0)?"""
    return _enhanced_code(message) in ((5, 4, 5), (5, 7, 0))


def _about_mailbox(message: bytes | str) -> bool:
    """O 5xx fala do endereço dela (5.1.x, 5.2.x)?"""
    code = _enhanced_code(message)
    return code is not None and code[0] == 5 and code[1] in (1, 2)


def reminder_outcome(error: Exception) -> SendOutcome:
    """Como `send_outcome`, mas um 5xx que fala da conta toda não descarta.

    Um 5xx descarta só aquele lembrete, na recusa do destinatário (RCPT) ou
    depois do DATA, para um endereço ou domínio que recusa não travar os
    lembretes de trás. Se o código fala da conta toda (cota 5.4.5, bloqueio
    5.7.0), vale para os que faltam também: a rotina para e desfaz a marca, como
    num 4xx. Um erro da conta com outro código é pego pela trava de descartes
    seguidos (`MAX_DROPS_IN_A_ROW`).
    """
    outcome = send_outcome(error)
    if outcome != "drop":
        return outcome
    if isinstance(error, smtplib.SMTPRecipientsRefused):
        about_account = any(
            _about_account(message) for _, message in error.recipients.values()
        )
        return "retry" if about_account else "drop"
    if isinstance(error, smtplib.SMTPResponseException):
        return "retry" if _about_account(error.smtp_error) else "drop"
    return outcome


def _suspicious_drop(error: Exception) -> bool:
    """Um 5xx descartado que não diz que o endereço é que não existe.

    5.1.x e 5.2.x falam da caixa dela e não contam para a trava: endereços
    inexistentes seguidos não param a rotina.
    """
    if isinstance(error, smtplib.SMTPRecipientsRefused):
        return not all(
            _about_mailbox(message) for _, message in error.recipients.values()
        )
    if isinstance(error, smtplib.SMTPResponseException):
        return not _about_mailbox(error.smtp_error)
    return False


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


def _connect() -> Sender:
    return SmtpConnection(timeout=SMTP_TIMEOUT_SECONDS)


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


@dataclass
class _Run:
    """O que a rodada já fez, de um lote para o outro."""

    sent: int = 0
    dropped: int = 0
    stopped: bool = False
    # Descartados seguidos por um 5xx (zera quando um e-mail sai).
    drops_in_a_row: int = 0


async def _unmark_quietly(session: AsyncSession, outgoing: list[_Outgoing]) -> None:
    """Desfaz a marca depois de um erro inesperado ou de um cancelamento.

    Se o desfazer também falha, só o tipo do erro vai ao log: quem chamou está
    levantando o erro de verdade, e esse não pode ser trocado por este.
    """
    try:
        await _unmark(session, outgoing)
    except Exception as error:  # noqa: BLE001
        logger.warning("Marcas dos lembretes não voltaram: %s", type(error).__name__)


async def _send_batch(
    session: AsyncSession,
    outgoing: list[_Outgoing],
    connect: Callable[[], Sender],
    clock: Callable[[], float],
    started: float,
    run: _Run,
) -> None:
    """Envia um lote já marcado. Nenhum lembrete fica marcado sem ter saído,
    salvo o que pode ter saído (conexão caída), mesmo se a rotina for cancelada.
    """
    # O que ainda não foi resolvido: se algo inesperado ou um cancelamento
    # (CancelledError não é Exception) interrompe o lote, a marca disso volta.
    unresolved = outgoing
    try:
        try:
            connection = await asyncio.to_thread(connect)
        except (EmailNotConfiguredError, smtplib.SMTPException, OSError) as error:
            # Nada saiu: desmarca, e a rodada pode ser repetida. A mensagem do
            # erro pode trazer o endereço: só o tipo vai ao log.
            unresolved = []
            await _unmark(session, outgoing)
            logger.warning("Envio dos lembretes parou: %s", type(error).__name__)
            run.stopped = True
            return

        try:
            for index, item in enumerate(outgoing):
                unresolved = outgoing[index:]
                if clock() - started >= TIME_BUDGET_SECONDS:
                    # Acabou o tempo: os que faltam não foram tentados, e a
                    # marca volta.
                    run.stopped = True
                    unresolved = []
                    await _unmark(session, outgoing[index:])
                    return
                # Enquanto este sai, um cancelamento não para a thread do envio:
                # o e-mail pode sair mesmo assim. Na dúvida, não reenvia
                # (RNF-F4.01): este fica marcado e só a marca dos de trás volta.
                unresolved = outgoing[index + 1 :]
                try:
                    await asyncio.to_thread(
                        connection.send, item.address, item.subject, item.body
                    )
                # Qualquer erro: um endereço inválido (ValueError) ou outro erro
                # do e-mail em si não pode travar os outros lembretes nem virar
                # 500.
                except Exception as error:  # noqa: BLE001
                    outcome = reminder_outcome(error)
                    # A mensagem do erro pode trazer o endereço: só o tipo vai
                    # ao log.
                    logger.warning(
                        "Lembrete não enviado (%s): %s", outcome, type(error).__name__
                    )
                    if outcome == "drop":
                        # O problema é deste e-mail: não adianta repetir, e os
                        # outros seguem. Mas muitos 5xx seguidos que não falam
                        # do endereço podem ser um erro da conta que não
                        # conhecemos: não descarta a lista toda, para e deixa
                        # este para a repetição. Só um envio que deu certo zera
                        # a contagem.
                        if _suspicious_drop(error):
                            run.drops_in_a_row += 1
                        if run.drops_in_a_row >= MAX_DROPS_IN_A_ROW:
                            run.stopped = True
                            unresolved = []
                            await _unmark(session, outgoing[index:])
                            return
                        run.dropped += 1
                        continue
                    # O erro é do servidor ou da conta: os que faltam não saem.
                    # Se nada saiu com este, a marca dele e a dos que faltam
                    # voltam; se a conexão caiu no meio ("unknown"), este fica
                    # marcado (RNF-F4.01) e só os que faltam voltam.
                    run.stopped = True
                    waiting = outgoing[index + 1 :]
                    unresolved = []
                    await _unmark(
                        session, waiting if outcome == "unknown" else waiting + [item]
                    )
                    return
                run.sent += 1
                run.drops_in_a_row = 0
            unresolved = []
        finally:
            try:
                await asyncio.to_thread(connection.close)
            except (smtplib.SMTPException, OSError) as error:
                logger.warning("Conexão SMTP não fechou: %s", type(error).__name__)
    except BaseException:
        if unresolved:
            await _unmark_quietly(session, unresolved)
        raise


async def send_event_reminders(
    session: AsyncSession,
    today: date | None = None,
    connect: Callable[[], Sender] = _connect,
    clock: Callable[[], float] = time.monotonic,
) -> SendResult:
    """Envia os lembretes de hoje (os eventos de amanhã) e devolve só contagens.

    Manda em lotes de BATCH_SIZE, até não haver mais nada ou acabar o tempo
    (TIME_BUDGET_SECONDS). Se o tempo acaba com lembrete sobrando, ele é
    desmarcado e sai se a rotina for repetida (`stopped`).
    """
    if today is None:
        today = today_in_maceio()
    started = clock()
    run = _Run()

    first = True
    left_over = True
    while left_over and not run.stopped:
        if not first and clock() - started >= TIME_BUDGET_SECONDS:
            run.stopped = True
            break
        first = False
        outgoing, left_over = _outgoing(await reminders_due(session, today))
        # Grava as marcas e solta as linhas travadas antes de falar com o SMTP.
        await session.commit()
        if not outgoing:
            break
        await _send_batch(session, outgoing, connect, clock, started, run)

    logger.info(
        "Lembretes de evento: %s enviados, %s descartados", run.sent, run.dropped
    )
    return SendResult(sent=run.sent, dropped=run.dropped, stopped=run.stopped)
