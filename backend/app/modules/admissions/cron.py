"""Rotas chamadas pelo agendador da hospedagem (Vercel Cron), não por pessoas.

Protegidas pelo segredo CRON_SECRET, que a Vercel manda no cabeçalho
`Authorization: Bearer <segredo>`. Sem o segredo configurado, recusam tudo.
Respondem só contagens (RN-24).
"""

import logging
import secrets
from typing import Annotated, Literal

import httpx2
from fastapi import APIRouter, Depends, Header, HTTPException, Query, status

from app.config import settings
from app.db.engine import AsyncSessionDep
from app.modules.admissions.copeve import (
    TARGET_COURSES,
    ReportFormatError,
    ReportUnavailableError,
)
from app.modules.admissions.match_email import send_match_emails
from app.modules.admissions.search import (
    RoundRunningError,
    SearchDisabledError,
    run_copeve_round,
    run_ifal_round,
)
from app.modules.admissions.service import delete_expired_matches
from app.modules.events.reminder_email import send_event_reminders
from app.modules.exports.service import purge_old_files

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/cron", tags=["Cron"], include_in_schema=False)


def require_cron_secret(
    authorization: Annotated[str | None, Header()] = None,
) -> None:
    expected = f"Bearer {settings.cron_secret}"
    if not settings.cron_secret or authorization is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Sem permissão")
    if not secrets.compare_digest(authorization.encode(), expected.encode()):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Sem permissão")


CronDep = Depends(require_cron_secret)


@router.get("/official-lists", dependencies=[CronDep])
async def official_lists_round(
    session: AsyncSessionDep,
    course: Annotated[int | None, Query()] = None,
    source: Annotated[Literal["copeve", "ifal"], Query()] = "copeve",
) -> dict[str, int]:
    """Uma rodada da busca na COPEVE ou, com `source=ifal`, no IFAL (RF-F31.07).

    Com `course`, roda só esse curso da COPEVE (9 consultas, uns 18 s): é assim
    que a rodada se divide quando não cabe no limite de duração da hospedagem.
    """
    if course is not None and (source != "copeve" or course not in TARGET_COURSES):
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT, "Curso fora dos alvos"
        )

    if (
        source == "ifal"
        and settings.list_search_enabled
        and not settings.ifal_selections
    ):
        # Sem seleção, a rodada não consultaria nada e ainda gravaria um registro
        # vazio. O 409 deixa a falta de configuração visível no painel de cron.
        raise HTTPException(
            status.HTTP_409_CONFLICT, "Nenhuma seleção do IFAL configurada"
        )

    courses = [course] if course is not None else list(TARGET_COURSES)
    async with httpx2.AsyncClient(timeout=30) as client:
        try:
            if source == "ifal":
                result = await run_ifal_round(session, client)
            else:
                result = await run_copeve_round(session, client, courses)
        except (ReportFormatError, ReportUnavailableError) as error:
            # A rodada parou sem gravar nada (RNF-F31.04). O 502 deixa a falha
            # visível no painel de cron da hospedagem.
            logger.warning(
                "Busca em %s parou: %s", source.upper(), type(error).__name__
            )
            raise HTTPException(
                status.HTTP_502_BAD_GATEWAY, "A busca parou sem gravar nada"
            ) from None
        except SearchDisabledError:
            raise HTTPException(
                status.HTTP_409_CONFLICT, "A busca em listas oficiais está desligada"
            ) from None
        except RoundRunningError:
            raise HTTPException(
                status.HTTP_409_CONFLICT, "Outra rodada está gravando agora"
            ) from None

    return {
        "queries": result.queries,
        "rows_read": result.rows_read,
        "matches_created": result.matches_created,
    }


@router.get("/expire-matches", dependencies=[CronDep])
async def expire_matches(session: AsyncSessionDep) -> dict[str, int]:
    """A rotina diária que apaga os indícios sem resposta há 30 dias (RF-F31.06)."""
    return {"deleted": await delete_expired_matches(session)}


@router.get("/purge-exports", dependencies=[CronDep])
async def purge_exports(session: AsyncSessionDep) -> dict[str, int]:
    """Apaga o texto das exportações com mais de 24 horas (F24, #375)."""
    return {"purged": await purge_old_files(session)}


@router.get("/match-emails", dependencies=[CronDep])
async def match_emails(session: AsyncSessionDep) -> dict[str, int]:
    """Envia os e-mails da fila que avisam dos indícios (RF-F31.11, #275).

    Responde só contagens. Se o envio parar (SMTP fora do ar ou não
    configurado), responde 502 para a falha aparecer no painel de cron, e os
    e-mails que faltam ficam na fila para a próxima vez.
    """
    if not settings.list_search_enabled:
        # Com a busca desligada (RN-20), nada sai, nem o que já estava na fila.
        raise HTTPException(
            status.HTTP_409_CONFLICT, "A busca em listas oficiais está desligada"
        )
    result = await send_match_emails(session)
    if result.stopped:
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY, "O envio parou; o resto fica na fila"
        )
    return {"sent": result.sent, "dropped": result.dropped}


@router.get("/event-reminders", dependencies=[CronDep])
async def event_reminders(session: AsyncSessionDep) -> dict[str, int]:
    """Envia os lembretes "Me lembra um dia antes" dos eventos de amanhã (RF-F4.12, #188).

    Roda uma vez por dia, de manhã em Maceió, e envia em lotes de 50 até não
    haver mais nada ou acabar o tempo (40 s). Responde só contagens. Se o envio
    parar (SMTP fora do ar ou não configurado, ou sobrou lembrete quando o tempo
    acabou), responde 502 para a falha aparecer no painel de cron; o que não
    saiu pode ser repetido no mesmo dia.
    """
    result = await send_event_reminders(session)
    if result.stopped:
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY, "O envio parou; repita a rotina hoje"
        )
    return {"sent": result.sent, "dropped": result.dropped}
