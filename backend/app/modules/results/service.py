import calendar
import enum
from dataclasses import dataclass
from datetime import date

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.actions.models import Action, ActionTopic, ActionType, Participation
from app.modules.actions.service import ACTION_TIMEZONE
from app.modules.girl_file.models import IN_FILE, FileEntry
from app.modules.girls.models import Topic

# O filé conta até o questionário de 3 meses (RF-F5.31, D-93).
FILE_WINDOW_MONTHS = 3


class Period(enum.Enum):
    """Opções do filtro "Período" da aba Resultados (RF-F5.06, D-94)."""

    LAST_6_MONTHS = "6m"
    LAST_12_MONTHS = "12m"
    ALL = "all"


@dataclass(frozen=True)
class ResultsFilters:
    """Os quatro filtros da aba Resultados. `None` é "Todas/Todos"."""

    period: Period = Period.LAST_12_MONTHS
    action_id: int | None = None
    type: ActionType | None = None
    topic: Topic | None = None


@dataclass(frozen=True)
class Compared:
    """Quantas fizeram algo, entre as participantes e entre as que não compareceram."""

    participants: int
    no_shows: int


@dataclass(frozen=True)
class AfterAction:
    """Os números do card "Logo depois da ação" (RF-F5.09, RF-F5.31)."""

    participants: int
    no_shows: int
    returned: Compared
    started_file: Compared
    concluded_file: Compared


@dataclass(frozen=True)
class _Reference:
    """A ação que põe a menina no card: a primeira dela entre as do filtro."""

    attended: bool
    starts_on: date
    action_id: int


def add_months(day: date, months: int) -> date:
    """O mesmo dia, `months` meses depois (ou antes, se negativo).

    Quando o mês não tem esse dia, fica o último: 31/08 menos 6 meses é 28/02
    ou 29/02.
    """
    month_index = day.year * 12 + day.month - 1 + months
    year, month0 = divmod(month_index, 12)
    last_day = calendar.monthrange(year, month0 + 1)[1]
    return date(year, month0 + 1, min(day.day, last_day))


def period_start(period: Period, today: date) -> date | None:
    """Primeiro dia do período, contado para trás a partir de hoje. `None` é sem início."""
    if period is Period.LAST_6_MONTHS:
        return add_months(today, -6)
    if period is Period.LAST_12_MONTHS:
        return add_months(today, -12)
    return None


async def after_action(
    session: AsyncSession, group_id: int, filters: ResultsFilters, today: date
) -> AfterAction:
    """Quem participou das ações do grupo no filtro e o que fez logo depois.

    - Entram só as ações do grupo com a presença salva (as outras ainda não
      dizem quem veio) e que passam nos filtros. O período olha a data de
      início da ação, contada para trás a partir de hoje.
    - Participante é quem tem presença em alguma dessas ações. Quem só se
      inscreveu, sem presença em nenhuma, é "não compareceu". Cada menina conta
      uma vez, num dos dois lados.
    - Voltou a outra ação quem tem presença em outra ação, de qualquer grupo
      (D-92), que começou no mesmo dia ou depois da primeira dela no filtro.
      Até hoje, sem janela fixa.
    - Começou o filé quem guardou um item novo no filé, e concluiu algo quem
      marcou um item como concluído, do dia em que a primeira ação dela no
      filtro começou até 3 meses depois, quando chega o questionário de 3
      meses (RF-F5.31, D-93). Conta qualquer item que está no filé, também os
      que o sistema guardou sozinho, como a inscrição num evento. O item é
      novo a partir de quando entrou no filé (`FileEntry.filed_at`), também
      quando ela o tira do "Ver depois". A própria ação de referência não
      conta.
    """
    since = period_start(filters.period, today)

    actions = select(Action.id).where(
        Action.group_id == group_id, Action.attendance_registered_at.is_not(None)
    )
    if since is not None:
        actions = actions.where(Action.starts_on >= since)
    if filters.action_id is not None:
        actions = actions.where(Action.id == filters.action_id)
    if filters.type is not None:
        actions = actions.where(Action.type == filters.type)
    if filters.topic is not None:
        actions = actions.where(Action.topics.any(ActionTopic.topic == filters.topic))

    signups = await session.execute(
        select(
            Participation.girl_id,
            Participation.action_id,
            Participation.attended_at.is_not(None),
            Action.starts_on,
        )
        .join(Action, Action.id == Participation.action_id)
        .where(Participation.action_id.in_(actions))
    )

    # A ação de referência de cada menina: a primeira em que ela veio, ou, se
    # não veio a nenhuma, a primeira em que se inscreveu.
    references: dict[int, _Reference] = {}
    for girl_id, action_id, attended, starts_on in signups:
        candidate = _Reference(attended, starts_on, action_id)
        current = references.get(girl_id)
        if current is None or _comes_first(candidate, current):
            references[girl_id] = candidate

    if not references:
        nobody = Compared(0, 0)
        return AfterAction(0, 0, nobody, nobody, nobody)

    attended_actions = (
        select(Participation.girl_id, Participation.action_id, Action.starts_on)
        .join(Action, Action.id == Participation.action_id)
        .where(
            Participation.girl_id.in_(references.keys()),
            Participation.attended_at.is_not(None),
        )
    )

    # A referência já está no período, então "no mesmo dia ou depois dela" já
    # fica dentro do período.
    returned: set[int] = set()
    for girl_id, action_id, starts_on in await session.execute(attended_actions):
        reference = references[girl_id]
        if action_id != reference.action_id and starts_on >= reference.starts_on:
            returned.add(girl_id)

    started, concluded = await _file_after_action(session, references)

    participants = {girl for girl, ref in references.items() if ref.attended}
    no_shows = references.keys() - participants

    def compared(girls: set[int]) -> Compared:
        return Compared(len(girls & participants), len(girls & no_shows))

    return AfterAction(
        participants=len(participants),
        no_shows=len(no_shows),
        returned=compared(returned),
        started_file=compared(started),
        concluded_file=compared(concluded),
    )


async def _file_after_action(
    session: AsyncSession, references: dict[int, _Reference]
) -> tuple[set[int], set[int]]:
    """Quem começou o filé e quem concluiu algo nele, na janela de cada menina."""
    entries = await session.execute(
        select(
            FileEntry.girl_id,
            FileEntry.action_id,
            FileEntry.filed_at,
            FileEntry.concluded_on,
        ).where(
            # Só as concluídas têm `concluded_on`, e elas estão no filé.
            FileEntry.girl_id.in_(references.keys()),
            FileEntry.status.in_(IN_FILE),
        )
    )

    started: set[int] = set()
    concluded: set[int] = set()
    for girl_id, action_id, filed_at, concluded_on in entries:
        reference = references[girl_id]
        # A própria ação não conta: a inscrição nela (SIGNED_UP) e a presença
        # (CONCLUDED) também entram no filé, e aí toda menina da ação contaria.
        if action_id == reference.action_id:
            continue
        start = reference.starts_on
        end = add_months(start, FILE_WINDOW_MONTHS)  # o dia do questionário fica fora

        # A restrição ck_file_entries_filed_at_when_in_file garante a data.
        assert filed_at is not None
        filed_on = filed_at.astimezone(ACTION_TIMEZONE).date()
        if start <= filed_on < end:
            started.add(girl_id)
        if concluded_on is not None and start <= concluded_on < end:
            concluded.add(girl_id)
    return started, concluded


def _comes_first(candidate: _Reference, current: _Reference) -> bool:
    """Presença ganha de inscrição sem presença; depois, a ação mais antiga."""
    return (not candidate.attended, candidate.starts_on, candidate.action_id) < (
        not current.attended,
        current.starts_on,
        current.action_id,
    )
