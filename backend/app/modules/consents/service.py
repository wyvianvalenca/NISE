import enum
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.consents.models import TermsAcceptance
from app.modules.girls.models import Girl
from app.modules.groups.models import Group
from app.users.models import User

# Versão dos termos em vigor. Tem que ser a mesma do front
# (TERMS_VERSION em frontend/lib/signup-api.ts). O texto final ainda não existe (D-01).
CURRENT_TERMS_VERSION = "0.1-rascunho"


class EmailKind(enum.Enum):
    QUESTIONNAIRE = "questionnaire"
    IMPORTANT_DATES = "important_dates"
    PASSWORD_RESET = "password_reset"
    OPPORTUNITIES = "opportunities"
    # O lembrete de um evento na véspera (RF-F4.12, #186).
    EVENT_REMINDER = "event_reminder"


# Chegam para toda menina com conta, sem opção de recusar; ela é avisada no
# cadastro (RN-30, D-15, D-16).
ALWAYS_SENT = {
    EmailKind.QUESTIONNAIRE,
    EmailKind.IMPORTANT_DATES,
    EmailKind.PASSWORD_RESET,
}


async def get_origin_group_name(session: AsyncSession, user_id: int) -> str | None:
    """Nome do grupo que convidou a menina, ou None se ela chegou sozinha.

    Decide a versão do resumo dos termos (RF-F7.04). Se o grupo foi apagado,
    origin_group_id fica vazio (SET NULL) e ela lê a versão da NISE.
    """
    group_name = await session.scalar(
        select(Group.name)
        .join(Girl, Girl.origin_group_id == Group.id)
        .where(Girl.user_id == user_id)
    )

    return group_name


async def has_accepted_current_terms(session: AsyncSession, user_id: int) -> bool:
    accepted = await session.scalar(
        select(TermsAcceptance.id).where(
            TermsAcceptance.user_id == user_id,
            TermsAcceptance.terms_version == CURRENT_TERMS_VERSION,
        )
    )
    return accepted is not None


async def record_terms_acceptance(
    session: AsyncSession, user_id: int, version: str
) -> bool:
    """Registra o aceite dos termos (RF-F7.05).

    Devolve False se `version` não é a versão atual: ela leu um texto que já
    mudou. Aceitar de novo a mesma versão não cria outro registro.
    """
    if version != CURRENT_TERMS_VERSION:
        return False

    if await has_accepted_current_terms(session, user_id):
        return True

    session.add(TermsAcceptance(user_id=user_id, terms_version=version))

    try:
        await session.commit()
    except IntegrityError:
        # Dois pedidos ao mesmo tempo: o outro já gravou o aceite.
        await session.rollback()

    return True


async def set_opportunity_emails(
    session: AsyncSession, user: User, enabled: bool
) -> User:
    """Liga ou desliga "oportunidades por e-mail" (RF-F7.06, RF-F7.08)."""
    if user.opportunity_emails == enabled:
        return user

    user.opportunity_emails = enabled
    user.opportunity_emails_changed_at = datetime.now(UTC)
    await session.commit()

    return user


def can_send_email(user: User, kind: EmailKind, *, reminder_on: bool = False) -> bool:
    """A checagem única "ela aceitou receber este e-mail?" (RN-30).

    Todo envio de e-mail para a menina passa por aqui. O lembrete de evento
    (RF-F4.12) é escolhido por evento, não na conta: quem envia passa em
    `reminder_on` o "Me lembra um dia antes" da linha daquele evento
    (`FileEntry.reminder`), e sem ele o lembrete não sai.
    """
    if kind in ALWAYS_SENT:
        return True

    if kind is EmailKind.OPPORTUNITIES:
        return user.opportunity_emails

    if kind is EmailKind.EVENT_REMINDER:
        return reminder_on

    # Tipo novo sem regra: na dúvida, não envia.
    return False
