from datetime import date
from typing import Literal

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel

from app.modules.answers.schemas import PendingRatingOut
from app.modules.followup.models import FollowupRound

# O front lê em camelCase (lastDay), como nas outras rotas.
CAMEL_CASE = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class OpenFollowupOut(BaseModel):
    """O questionário "Como está seu caminho?" aberto e sem resposta (A18)."""

    model_config = CAMEL_CASE

    round: FollowupRound
    # O último dia em que ainda dá para responder (RN-39).
    last_day: date


class ToAnswerOut(BaseModel):
    """O que a seção "Pra responder" da agenda (A14) mostra.

    Nada aqui nomeia outra pessoa, curso ou instituição (RNF-F31.02): só o
    sim ou não do indício, as ações que ela mesma foi e a rodada aberta.
    """

    # Existe um indício sem resposta (RF-F31.10).
    list_match: bool
    # Ações a que ela foi e ainda não avaliou, a mais recente primeiro (RF-F4.03b).
    ratings: list[PendingRatingOut]
    # A rodada aberta que ela ainda não respondeu (RF-F4.06, RN-39).
    followup: OpenFollowupOut | None


class UpcomingItemOut(BaseModel):
    """Uma data da agenda: lembrete da equipe ou rodada de questionário."""

    model_config = CAMEL_CASE

    kind: Literal["date", "followup"]
    # Para "date", o dia da data. Para "followup", o dia em que a rodada abre.
    on: date
    # Só em "date": o texto que a equipe cadastrou.
    title: str | None
    details: str | None
    # Só em "followup": qual rodada é.
    round: FollowupRound | None


class AgendaDatesOut(BaseModel):
    """As datas de hoje em diante, da mais próxima para a mais distante (RF-F4.11b)."""

    upcoming: list[UpcomingItemOut]
