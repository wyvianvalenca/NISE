import calendar
from dataclasses import dataclass
from datetime import date, timedelta

from app.modules.followup.models import (
    Activity,
    ComputingView,
    CourseCode,
    CourseStatus,
    FollowupRound,
    FutureSelf,
    HelpWanted,
)

# Quantos meses depois de criar a conta cada rodada sai (RN-02).
ROUND_MONTHS: dict[FollowupRound, int] = {
    FollowupRound.THREE_MONTHS: 3,
    FollowupRound.SIX_MONTHS: 6,
    FollowupRound.TWELVE_MONTHS: 12,
    FollowupRound.EIGHTEEN_MONTHS: 18,
}

# Cada rodada fica aberta por 30 dias a partir do dia em que sai (RN-39).
ROUND_OPEN_DAYS = 30


@dataclass(frozen=True)
class OpenRound:
    round: FollowupRound
    opens_on: date
    # O último dia em que ainda dá para responder.
    last_day: date


def add_months(day: date, months: int) -> date:
    """O mesmo dia, `months` meses depois.

    Se o dia não existe no mês de destino (conta criada num dia 31, por
    exemplo), vale o último dia do mês. Suposição registrada no #293.
    """
    month_index = day.month - 1 + months
    year = day.year + month_index // 12
    month = month_index % 12 + 1
    last_day_of_month = calendar.monthrange(year, month)[1]
    return date(year, month, min(day.day, last_day_of_month))


def round_window(account_created: date, followup_round: FollowupRound) -> OpenRound:
    """Quando a rodada abre e o último dia para responder."""
    opens_on = add_months(account_created, ROUND_MONTHS[followup_round])
    last_day = opens_on + timedelta(days=ROUND_OPEN_DAYS - 1)
    return OpenRound(round=followup_round, opens_on=opens_on, last_day=last_day)


def open_round(account_created: date, today: date) -> OpenRound | None:
    """A rodada aberta hoje, ou None.

    Só vale a rodada cuja janela de 30 dias inclui hoje: quem já tinha conta
    antiga quando o M5 entrou não recebe as rodadas que já passaram. As
    janelas não se cruzam, porque as rodadas estão a 3 meses ou mais uma da
    outra.
    """
    for followup_round in FollowupRound:
        window = round_window(account_created, followup_round)
        if window.opens_on <= today <= window.last_day:
            return window
    return None


# Os textos de cada opção, na ordem do Figma (A18). O front mostra estas
# listas; o back só aceita os códigos.
COMPUTING_VIEW_LABELS: dict[ComputingView, str] = {
    ComputingView.WANT_TO_FOLLOW: "Algo que quero seguir",
    ComputingView.LIKE_BUT_UNSURE: "Gosto, mas não sei se quero seguir",
    ComputingView.LESS_INTERESTED: "Já não me interessa tanto",
    ComputingView.NOT_FOR_ME: "Não é pra mim",
}

FUTURE_SELF_LABELS: dict[FutureSelf, str] = {
    FutureSelf.SURE: "Com certeza",
    FutureSelf.MAYBE: "Talvez",
    FutureSelf.PROBABLY_NOT: "Acho que não",
}

ACTIVITY_LABELS: dict[Activity, str] = {
    Activity.ONLINE_COURSE: "Fiz um curso online",
    Activity.EVENT: "Fui a um evento ou oficina",
    Activity.SELF_STUDY: "Estudei por conta própria",
    Activity.PROJECT: "Entrei num projeto ou grupo",
    Activity.NONE_YET: "Nada disso ainda",
}

HELP_WANTED_LABELS: dict[HelpWanted, str] = {
    HelpWanted.MENTORING: "Mentoria",
    HelpWanted.ONLINE_COURSES: "Cursos online",
    HelpWanted.INTERNSHIP: "Estágio",
    HelpWanted.EVENTS: "Eventos e oficinas",
    HelpWanted.OTHER: "Outra coisa",
}

COURSE_STATUS_LABELS: dict[CourseStatus, str] = {
    CourseStatus.TECNICO: "Curso técnico",
    CourseStatus.GRADUACAO: "Graduação",
    CourseStatus.TRYING: "Tô tentando entrar",
    CourseStatus.NOT_YET: "Ainda não",
}

COURSE_LABELS: dict[CourseCode, str] = {
    CourseCode.SISTEMAS_INFORMACAO: "Sistemas de Informação",
    CourseCode.CIENCIA_COMPUTACAO: "Ciência da Computação",
    CourseCode.ENGENHARIA_COMPUTACAO: "Engenharia de Computação",
    CourseCode.REDES: "Redes de computadores",
    CourseCode.OUTRO: "Outro curso",
}
