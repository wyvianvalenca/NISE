import enum
from dataclasses import dataclass
from datetime import date

from sqlalchemy import exists, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.actions.models import Participation
from app.modules.followup.models import FollowupAnswer, FollowupRound, FutureSelf
from app.modules.girls.models import Girl
from app.modules.results.service import ResultsFilters, filtered_actions


class FutureSelfMilestone(enum.Enum):
    """Os marcos do eixo horizontal: o cadastro e as quatro rodadas (RF-F5.33)."""

    SIGNUP = "signup"
    THREE_MONTHS = FollowupRound.THREE_MONTHS.value
    SIX_MONTHS = FollowupRound.SIX_MONTHS.value
    TWELVE_MONTHS = FollowupRound.TWELVE_MONTHS.value
    EIGHTEEN_MONTHS = FollowupRound.EIGHTEEN_MONTHS.value


class ParticipationGroup(enum.Enum):
    """As quatro linhas do card, de quem foi a mais ações a quem chegou sozinha."""

    TWO_OR_MORE = "two_or_more"
    ONE = "one"
    NO_SHOW = "no_show"
    NEVER = "never"


@dataclass(frozen=True)
class FutureSelfPoint:
    """Um marco de uma linha: `sure` de `responses` disseram "Com certeza" (RN-50)."""

    milestone: FutureSelfMilestone
    responses: int
    sure: int


@dataclass(frozen=True)
class FutureSelfLine:
    """Uma linha do gráfico: o grupo, quantas meninas há nele e um ponto por marco."""

    group: ParticipationGroup
    girls: int
    points: list[FutureSelfPoint]


async def future_self_by_participation(
    session: AsyncSession, group_id: int, filters: ResultsFilters, today: date
) -> list[FutureSelfLine]:
    """Card "Elas se veem na computação no futuro?", por participação (RF-F5.33, #369).

    - Foi a 2 ou mais ações, foi a 1 ação e não compareceram: só meninas
      inscritas nas ações do grupo que passam nos filtros (as mesmas do card
      "Logo depois da ação"). O número de ações é o de ações do filtro em que
      ela veio; quem não veio a nenhuma é "não compareceu".
    - Nunca participaram (RN-04): meninas com conta sem nenhuma inscrição em
      ação de qualquer grupo. Entram todas as da NISE, não só as ligadas a este
      grupo, e os filtros não mexem nelas. Só entram como total.
    - O valor de cada marco é "Com certeza" entre as que responderam à pergunta
      2 naquele marco. Quem pulou a pergunta não entra no n. O marco
      "Cadastro" é a pergunta 2 da A05a "Antes de começar" (RF-F10.26, #303):
      quem pulou, ou criou a conta antes dela, também fica fora do n.
    """
    signups = await session.execute(
        select(Participation.girl_id, Participation.attended_at.is_not(None)).where(
            Participation.action_id.in_(filtered_actions(group_id, filters, today))
        )
    )
    attended_count: dict[int, int] = {}
    for girl_id, attended in signups:
        attended_count[girl_id] = attended_count.get(girl_id, 0) + int(attended)

    members: dict[ParticipationGroup, set[int]] = {
        group: set() for group in ParticipationGroup
    }
    for girl_id, count in attended_count.items():
        if count >= 2:
            members[ParticipationGroup.TWO_OR_MORE].add(girl_id)
        elif count == 1:
            members[ParticipationGroup.ONE].add(girl_id)
        else:
            members[ParticipationGroup.NO_SHOW].add(girl_id)

    # Quem tem conta e nenhuma inscrição em lugar nenhum chegou sozinha.
    alone = await session.scalars(
        select(Girl.id).where(
            Girl.user_id.is_not(None),
            ~exists().where(Participation.girl_id == Girl.id),
        )
    )
    members[ParticipationGroup.NEVER] = set(alone)

    everyone = set().union(*members.values())
    # Quem respondeu a pergunta 2 em cada marco, e se disse "Com certeza".
    said_sure: dict[tuple[int, FutureSelfMilestone], bool] = {}
    if everyone:
        rows = await session.execute(
            select(
                FollowupAnswer.girl_id, FollowupAnswer.round, FollowupAnswer.future_self
            ).where(
                FollowupAnswer.girl_id.in_(everyone),
                FollowupAnswer.future_self.is_not(None),
            )
        )
        for girl_id, round_, future_self in rows:
            milestone = FutureSelfMilestone(round_.value)
            said_sure[girl_id, milestone] = future_self is FutureSelf.SURE

        at_signup = await session.execute(
            select(Girl.id, Girl.signup_future_self).where(
                Girl.id.in_(everyone), Girl.signup_future_self.is_not(None)
            )
        )
        for girl_id, future_self in at_signup:
            said_sure[girl_id, FutureSelfMilestone.SIGNUP] = (
                future_self is FutureSelf.SURE
            )

    lines: list[FutureSelfLine] = []
    for group in ParticipationGroup:
        girls = members[group]
        points = []
        for milestone in FutureSelfMilestone:
            answers = [
                said_sure[girl, milestone]
                for girl in girls
                if (girl, milestone) in said_sure
            ]
            points.append(FutureSelfPoint(milestone, len(answers), sum(answers)))
        lines.append(FutureSelfLine(group, len(girls), points))
    return lines
