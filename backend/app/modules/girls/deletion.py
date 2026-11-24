import enum
from datetime import UTC, date, datetime

from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.models import PasswordResetToken
from app.modules.actions.models import Action, Participation
from app.modules.admissions.models import (
    Approval,
    DismissedMatch,
    Enrollment,
    ListMatch,
)
from app.modules.answers.models import Answer
from app.modules.attendance.models import AttendanceEmail
from app.modules.consents.service import has_accepted_current_terms
from app.modules.followup.models import FollowupAnswer
from app.modules.girl_file.models import FileEntry
from app.modules.girls.models import ANONYMIZED_NAME, Girl, GirlTopic
from app.modules.groups.models import Invite
from app.users.models import OAuthAccount, Role, User


class DeletionResult(enum.Enum):
    DELETED = "deleted"
    # Segunda chamada, ou de outra aba: não há mais o que fazer.
    ALREADY_DELETED = "already_deleted"
    NO_ACCOUNT = "no_account"
    NOT_A_GIRL = "not_a_girl"
    TERMS_NOT_ACCEPTED = "terms_not_accepted"


async def delete_account(
    session: AsyncSession, user_id: int, today: date
) -> DeletionResult:
    """Exclui a conta da menina e os dados dela (RF-F7.09, #394).

    O modelo é anonimizar no lugar, e é irreversível: nenhuma linha que alimenta
    um painel de grupo é apagada (os números não mudam); o que identifica a
    menina nessas linhas é sobrescrito, e o valor original não fica em lugar
    nenhum (nem tabela de chave, nem cópia, nem log). O que é só dela e não
    alimenta número é apagado. A tabela "o que fica, o que esvazia e o que
    apaga" de cada tabela está na spec da #394.

    `today` é a data de hoje em Maceió: a inscrição em ação que ainda não
    começou é apagada e a vaga reabre; as outras ficam anonimizadas.
    """
    # Trava a linha: duas exclusões ao mesmo tempo anonimizam uma vez só.
    user = await session.scalar(
        select(User).where(User.id == user_id).with_for_update()
    )

    if user is None:
        return DeletionResult.NO_ACCOUNT

    if user.deleted_at is not None:
        return DeletionResult.ALREADY_DELETED

    if user.role != Role.GIRL:
        return DeletionResult.NOT_A_GIRL

    if not await has_accepted_current_terms(session, user_id):
        return DeletionResult.TERMS_NOT_ACCEPTED

    now = datetime.now(UTC)
    girl_id = await session.scalar(select(Girl.id).where(Girl.user_id == user_id))

    if girl_id is not None:
        # O que é só dela e nenhum painel lê.
        await session.execute(delete(GirlTopic).where(GirlTopic.girl_id == girl_id))
        await session.execute(delete(FileEntry).where(FileEntry.girl_id == girl_id))
        await session.execute(delete(Invite).where(Invite.girl_id == girl_id))
        # Os e-mails dos indícios saem junto (CASCADE de list_match_id).
        await session.execute(delete(ListMatch).where(ListMatch.girl_id == girl_id))
        await session.execute(
            delete(DismissedMatch).where(DismissedMatch.girl_id == girl_id)
        )
        await session.execute(delete(Approval).where(Approval.girl_id == girl_id))

        # Ação que ainda não começou: a inscrição some e a vaga reabre.
        await session.execute(
            delete(Participation).where(
                Participation.girl_id == girl_id,
                Participation.action_id.in_(
                    select(Action.id).where(Action.starts_on > today)
                ),
            )
        )

        # O que fica, com o que identifica sobrescrito: as contagens dos painéis
        # (C2, C3, C5, C8) continuam as mesmas.
        await session.execute(
            update(Participation)
            .where(Participation.girl_id == girl_id)
            .values(name=None, whatsapp=None, study_stage=None, school_year=None)
        )
        await session.execute(
            update(Answer).where(Answer.girl_id == girl_id).values(comment=None)
        )
        await session.execute(
            update(FollowupAnswer)
            .where(FollowupAnswer.girl_id == girl_id)
            .values(comment=None)
        )
        await session.execute(
            update(Enrollment)
            .where(Enrollment.girl_id == girl_id)
            .values(institution=None)
        )
        # A linha fica (o painel de presença conta os enviados); o que ainda não
        # saiu deixa de ser desejado.
        await session.execute(
            update(AttendanceEmail)
            .where(
                AttendanceEmail.girl_id == girl_id,
                AttendanceEmail.sent_at.is_(None),
                AttendanceEmail.dropped_at.is_(None),
            )
            .values(dropped_at=now)
        )
        # `.invalid` (RFC 2606) nunca é de ninguém: nenhum envio, login ou
        # cadastro o usa. O prefixo "registro-" difere do "conta-" de users para
        # os dois nunca casarem por acaso. O vínculo `user_id` fica.
        await session.execute(
            update(Girl)
            .where(Girl.id == girl_id)
            .values(
                name=ANONYMIZED_NAME,
                email=f"registro-{girl_id}@anonimizado.invalid",
                birth_date=None,
                city_ibge_code=None,
                study_stage=None,
                all_topics=False,
                file_intro_seen=False,
                last_band=None,
            )
        )

    # Sem isto, o Google dela e os links de nova senha reabririam a conta.
    await session.execute(delete(OAuthAccount).where(OAuthAccount.user_id == user_id))
    await session.execute(
        delete(PasswordResetToken).where(PasswordResetToken.user_id == user_id)
    )

    # A linha de users fica (RESTRICT de terms_acceptances: o aceite dos termos
    # continua, com data, hora e versão, ligado a ela).
    user.name = ANONYMIZED_NAME
    user.email = f"conta-{user_id}@anonimizado.invalid"
    user.password_hash = None
    user.opportunity_emails = False
    user.opportunity_emails_changed_at = None
    user.deleted_at = now

    await session.commit()

    return DeletionResult.DELETED
