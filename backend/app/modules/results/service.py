import calendar
import enum
from collections import Counter
from dataclasses import dataclass
from datetime import date
from typing import Any

from sqlalchemy import Select, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.actions.models import Action, ActionTopic, ActionType, Participation
from app.modules.actions.service import ACTION_TIMEZONE
from app.modules.followup.models import (
    ComputingView,
    CourseStatus,
    FollowupAnswer,
    FollowupRound,
)
from app.modules.girl_file.models import IN_FILE, FileEntry
from app.modules.girls.models import Girl, StudyStage, Topic
from app.users.models import User

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


def filtered_actions(
    group_id: int, filters: ResultsFilters, today: date
) -> Select[Any]:
    """Ids das ações do grupo com a presença salva que passam nos filtros."""
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
    return actions


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
    references = await _references(session, group_id, filters, today)

    if not references:
        nobody = Compared(0, 0)
        return AfterAction(0, 0, nobody, nobody, nobody)
    return await _after_action_numbers(session, references)


async def _references(
    session: AsyncSession, group_id: int, filters: ResultsFilters, today: date
) -> dict[int, _Reference]:
    """A ação de referência de cada menina inscrita nas ações do grupo no filtro."""
    actions = filtered_actions(group_id, filters, today)

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
    return references


async def _after_action_numbers(
    session: AsyncSession, references: dict[int, _Reference]
) -> AfterAction:
    """Quem voltou, quem começou o filé e quem concluiu algo, entre as meninas da lista."""

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


# --- Interesse (C5, #368, RF-F5.04, RF-F5.32) ----------------------------------

# Do melhor para o pior (RF-F5.32). A ordem veio do exemplo do Figma (a validar).
INTEREST_ORDER: tuple[ComputingView, ...] = (
    ComputingView.WANT_TO_FOLLOW,
    ComputingView.LIKE_BUT_UNSURE,
    ComputingView.LESS_INTERESTED,
    ComputingView.NOT_FOR_ME,
)
_RANK = {view: rank for rank, view in enumerate(INTEREST_ORDER)}

# As rodadas, da mais antiga para a mais recente.
ROUND_ORDER: tuple[FollowupRound, ...] = (
    FollowupRound.THREE_MONTHS,
    FollowupRound.SIX_MONTHS,
    FollowupRound.TWELVE_MONTHS,
    FollowupRound.EIGHTEEN_MONTHS,
)

# Quantas "mudanças mais comuns" o card lista (a validar com a equipe).
TOP_CHANGES = 5


@dataclass(frozen=True)
class Milestone:
    """Uma barra do card: quantas responderam e quantas escolheram cada opção."""

    answered: int
    counts: dict[ComputingView, int]


@dataclass(frozen=True)
class Change:
    """Uma mudança de opção, do cadastro para a última resposta, e quantas fizeram."""

    origin: ComputingView
    destination: ComputingView
    girls: int


@dataclass(frozen=True)
class Movement:
    """O card "Quem mudou de situação": cadastro × última resposta."""

    with_both: int
    went_up: int
    stayed: int
    went_down: int
    common_changes: list[Change]


@dataclass(frozen=True)
class Interest:
    """Os números dos cards "Como o interesse evolui" e "Quem mudou de situação"."""

    signup: Milestone
    rounds: dict[FollowupRound, Milestone]
    movement: Movement


async def signup_views(
    session: AsyncSession, girl_ids: set[int]
) -> dict[int, ComputingView]:
    """O que cada menina respondeu no cadastro.

    A pergunta no cadastro ainda não existe (change #303, Should): até lá não
    há resposta de cadastro de ninguém, o marco "Cadastro" mostra zero
    respostas e a comparação não tem ponto de partida. Quando o #303 entrar,
    só esta função muda.
    """
    return {}


def build_interest(
    signup: dict[int, ComputingView],
    answers: dict[int, dict[FollowupRound, ComputingView]],
) -> Interest:
    """Soma as respostas por marco e compara cada menina com ela mesma.

    `answers` tem, por menina, só as rodadas em que ela respondeu a pergunta 1:
    quem não respondeu a um marco não conta na barra dele. A "última resposta"
    é a da rodada mais recente que ela respondeu, qualquer que seja (a
    validar). Só entra na comparação quem tem o cadastro e ao menos uma
    resposta depois.
    """

    def milestone(views: list[ComputingView]) -> Milestone:
        return Milestone(
            answered=len(views),
            counts={view: views.count(view) for view in INTEREST_ORDER},
        )

    rounds = {
        rnd: milestone([a[rnd] for a in answers.values() if rnd in a])
        for rnd in ROUND_ORDER
    }

    up = stayed = down = 0
    changes: Counter[tuple[ComputingView, ComputingView]] = Counter()
    for girl_id, start in signup.items():
        given = answers.get(girl_id)
        if not given:
            continue
        last = given[max(given, key=ROUND_ORDER.index)]
        if _RANK[last] < _RANK[start]:
            up += 1
        elif _RANK[last] > _RANK[start]:
            down += 1
        else:
            stayed += 1
        if last is not start:
            changes[(start, last)] += 1

    # Da mais para a menos comum; no empate, pela ordem melhor ao pior.
    ranked = sorted(
        changes.items(),
        key=lambda item: (-item[1], _RANK[item[0][0]], _RANK[item[0][1]]),
    )
    return Interest(
        signup=milestone(list(signup.values())),
        rounds=rounds,
        movement=Movement(
            with_both=up + stayed + down,
            went_up=up,
            stayed=stayed,
            went_down=down,
            common_changes=[Change(o, d, n) for (o, d), n in ranked[:TOP_CHANGES]],
        ),
    )


async def interest(
    session: AsyncSession, group_id: int, filters: ResultsFilters, today: date
) -> Interest:
    """Como as meninas que participaram das ações do filtro responderam à pergunta 1.

    Só contam as participantes (com presença), como no card "Logo depois da
    ação"; quem só se inscreveu e não veio não entra.
    """
    references = await _references(session, group_id, filters, today)
    girls = {girl for girl, ref in references.items() if ref.attended}

    answers: dict[int, dict[FollowupRound, ComputingView]] = {}
    if girls:
        rows = await session.execute(
            select(
                FollowupAnswer.girl_id,
                FollowupAnswer.round,
                FollowupAnswer.computing_view,
            ).where(
                FollowupAnswer.girl_id.in_(girls),
                FollowupAnswer.computing_view.is_not(None),
            )
        )
        for girl_id, rnd, view in rows:
            if view is not None:
                answers.setdefault(girl_id, {})[rnd] = view

    signup = await signup_views(session, girls)
    return build_interest(signup, answers)


# --- Entraram na área (C5, #370, RF-F5.34) -------------------------------------


class EnteredStage(enum.Enum):
    """As três etapas escolares do seletor do card (RF-F5.34), do cadastro."""

    FUNDAMENTAL = "fundamental"
    MEDIO = "medio"
    TECNICO_OU_GRADUACAO = "tecnico_ou_graduacao"


# "Já me formei" e quem não informou a escolaridade ficam fora das três.
_STAGE_OF = {
    StudyStage.FUNDAMENTAL: EnteredStage.FUNDAMENTAL,
    StudyStage.MEDIO: EnteredStage.MEDIO,
    StudyStage.TECNICO: EnteredStage.TECNICO_OU_GRADUACAO,
    StudyStage.GRADUACAO: EnteredStage.TECNICO_OU_GRADUACAO,
}

# As barras do card: a rodada do questionário em que ela deu a resposta.
ENTERED_ROUNDS = {
    FollowupRound.SIX_MONTHS: 6,
    FollowupRound.TWELVE_MONTHS: 12,
    FollowupRound.EIGHTEEN_MONTHS: 18,
}


@dataclass(frozen=True)
class EnteredBar:
    """Uma barra: quantas responderam e como se dividem (só contagens, RN-50)."""

    months: int
    answered: int
    graduacao: int
    tecnico: int
    trying: int
    not_yet: int


@dataclass(frozen=True)
class EnteredByStage:
    stage: EnteredStage
    bars: list[EnteredBar]


# Quem declarou um destes já entrou na área e conta assim dali em diante.
ENTERED_COURSE = (CourseStatus.GRADUACAO, CourseStatus.TECNICO)


def _status_at(
    given: dict[FollowupRound, CourseStatus], milestone: FollowupRound
) -> CourseStatus | None:
    """A situação da menina no marco: o último curso declarado até ali, ou a resposta dele."""
    until = ROUND_ORDER[: ROUND_ORDER.index(milestone) + 1]
    entered = [given[r] for r in until if given.get(r) in ENTERED_COURSE]
    if entered:
        return entered[-1]
    return given.get(milestone)


async def entered_the_field(
    session: AsyncSession, group_id: int, filters: ResultsFilters, today: date
) -> list[EnteredByStage]:
    """O card "Elas entraram na área?" (RF-F5.34): pergunta 3, por escolaridade e rodada.

    - Entram só as participantes (com presença) das ações do grupo no filtro,
      como nos cards "Logo depois da ação" e "Como o interesse evolui".
    - Cada barra é a foto daquele marco (6, 12 e 18 meses):
      - quem declarou graduação ou curso técnico numa rodada até esse marco
        conta como quem entrou, com o último curso declarado até ali, em
        todas as barras seguintes cujo marco a conta já alcançou, mesmo sem
        responder de novo e mesmo se depois disse que parou (decisão da equipe
        na revisão do PR #465);
      - quem não entrou conta com o que respondeu à pergunta 3 na rodada do
        marco ("Tentando entrar" ou "Ainda não"); sem resposta, fica fora.
      Assim, quem declarou o curso aos 3 meses também aparece nas três barras.
    - A escolaridade é a do cadastro. "Já me formei" e quem não a informou
      não entram em nenhuma das três.
    - Só contagens: sem nome de menina, de curso nem de instituição.
    """
    references = await _references(session, group_id, filters, today)
    girls = {girl for girl, ref in references.items() if ref.attended}

    stage_of: dict[int, StudyStage | None] = {}
    created_on: dict[int, date] = {}
    # A pergunta 3 de cada rodada e as rodadas que ela respondeu: depois de
    # declarar o curso, ela responde "Continua nesse curso?", sem `course_status`.
    answers: dict[int, dict[FollowupRound, CourseStatus]] = {}
    answered: dict[int, set[FollowupRound]] = {}
    if girls:
        for girl_id, stage, created_at in await session.execute(
            select(Girl.id, Girl.study_stage, User.created_at)
            .outerjoin(User, User.id == Girl.user_id)
            .where(Girl.id.in_(girls))
        ):
            stage_of[girl_id] = stage
            if created_at is not None:
                created_on[girl_id] = created_at.astimezone(ACTION_TIMEZONE).date()
        for girl_id, round_, status in await session.execute(
            select(
                FollowupAnswer.girl_id,
                FollowupAnswer.round,
                FollowupAnswer.course_status,
            ).where(FollowupAnswer.girl_id.in_(girls))
        ):
            answered.setdefault(girl_id, set()).add(round_)
            if status is not None:
                answers.setdefault(girl_id, {})[round_] = status

    counts: dict[tuple[EnteredStage, FollowupRound], dict[CourseStatus, int]] = {}
    for girl_id, given in answers.items():
        stage = stage_of.get(girl_id)
        if stage is None or stage not in _STAGE_OF:
            continue
        for round_, months in ENTERED_ROUNDS.items():
            status = _status_at(given, round_)
            if status is None:
                continue
            # Quem entrou antes conta no marco mesmo sem responder a ele, desde
            # que a conta já tenha chegado ao marco.
            created = created_on.get(girl_id)
            reached = created is not None and add_months(created, months) <= today
            if round_ not in answered[girl_id] and not reached:
                continue
            by_status = counts.setdefault((_STAGE_OF[stage], round_), {})
            by_status[status] = by_status.get(status, 0) + 1

    result: list[EnteredByStage] = []
    for entered_stage in EnteredStage:
        bars = []
        for round_, months in ENTERED_ROUNDS.items():
            by_status = counts.get((entered_stage, round_), {})
            bars.append(
                EnteredBar(
                    months=months,
                    answered=sum(by_status.values()),
                    graduacao=by_status.get(CourseStatus.GRADUACAO, 0),
                    tecnico=by_status.get(CourseStatus.TECNICO, 0),
                    trying=by_status.get(CourseStatus.TRYING, 0),
                    not_yet=by_status.get(CourseStatus.NOT_YET, 0),
                )
            )
        result.append(EnteredByStage(entered_stage, bars))
    return result
