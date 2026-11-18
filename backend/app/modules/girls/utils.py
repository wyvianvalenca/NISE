import enum
from datetime import UTC, date, datetime, timedelta, timezone

from app.modules.girls.models import StudyStage, Topic

# Regra de idade da NISE (RN-03, RF-F7.01): só cria conta quem já fez 13 anos.
# Fica num lugar só porque o cadastro por e-mail (H1, #51) e o do Google
# (H2, #52) usam a mesma regra. É a mesma conta de frontend/lib/age.ts; o
# servidor confere de novo porque a tela pode ser contornada (RNF-G.03).
MINIMUM_AGE = 13

# Maceió fica em UTC−3 o ano todo (o Brasil não tem horário de verão desde
# 2019). Um fuso fixo evita depender do pacote tzdata, que o
# ZoneInfo("America/Maceio") exigiria no Windows.
MACEIO_TZ = timezone(timedelta(hours=-3), "America/Maceio")


class AgeCheck(enum.Enum):
    """O que fazer com a data de nascimento enviada.

    Três respostas, e não duas, de propósito: quem digitou 2090 em vez de 2009
    errou a data, não é uma criança, e deve só corrigir o campo.
    """

    OK = "ok"
    UNDER_13 = "under_13"
    INVALID_BIRTH_DATE = "invalid_birth_date"


def today_in_maceio(now: datetime | None = None) -> date:
    """A data de hoje em Maceió, que é a que vale para a idade."""
    if now is None:
        now = datetime.now(UTC)

    return now.astimezone(MACEIO_TZ).date()


def age_on(birth_date: date, reference: date) -> int | None:
    """Idade em anos completos na data de referência.

    Devolve None se a data de nascimento está no futuro.
    """
    if birth_date > reference:
        return None

    birthday_still_to_come = (reference.month, reference.day) < (
        birth_date.month,
        birth_date.day,
    )

    return reference.year - birth_date.year - (1 if birthday_still_to_come else 0)


def check_age(birth_date: date, reference: date | None = None) -> AgeCheck:
    """Decide se ela segue, se é barrada pela idade ou se precisa corrigir a data.

    Quem faz 13 anos hoje passa. Quem nasceu em 29/02 faz aniversário em
    01/03 nos anos que não são bissextos, como no front.
    """
    if reference is None:
        reference = today_in_maceio()

    age = age_on(birth_date, reference)

    if age is None:
        return AgeCheck.INVALID_BIRTH_DATE

    if age < MINIMUM_AGE:
        return AgeCheck.UNDER_13

    return AgeCheck.OK


# Como cada tema e cada etapa de estudo aparecem na A05 (RF-F10.01), na ordem
# do Figma. O front mostra estas listas, e as sugestões usam os mesmos códigos.
TOPIC_LABELS: dict[Topic, str] = {
    Topic.PROGRAMACAO: "Programação",
    Topic.ROBOTICA: "Robótica",
    Topic.IA: "Inteligência artificial",
    Topic.DADOS: "Dados",
    Topic.CIBERSEGURANCA: "Cibersegurança",
    Topic.JOGOS: "Jogos",
    Topic.SITES: "Sites e apps",
    Topic.DESIGN: "Design e criação",
}

STUDY_STAGE_LABELS: dict[StudyStage, str] = {
    StudyStage.FUNDAMENTAL: "Ensino fundamental",
    StudyStage.MEDIO: "Ensino médio",
    StudyStage.TECNICO: "Curso técnico",
    StudyStage.GRADUACAO: "Graduação",
    StudyStage.FORMADA: "Já me formei",
}
