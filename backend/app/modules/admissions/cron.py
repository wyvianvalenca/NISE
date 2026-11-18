"""Rotas chamadas pelo agendador da hospedagem (Vercel Cron), não por pessoas.

Protegidas pelo segredo CRON_SECRET, que a Vercel manda no cabeçalho
`Authorization: Bearer <segredo>`. Sem o segredo configurado, recusam tudo.
Respondem só contagens (RN-24).
"""

import logging
import secrets
from typing import Annotated

import httpx2
from fastapi import APIRouter, Depends, Header, HTTPException, Query, status

from app.config import settings
from app.db.engine import AsyncSessionDep
from app.modules.admissions.copeve import (
    TARGET_COURSES,
    ReportFormatError,
    ReportUnavailableError,
)
from app.modules.admissions.search import run_copeve_round
from app.modules.admissions.service import delete_expired_matches

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
) -> dict[str, int]:
    """Uma rodada da busca na COPEVE (RF-F31.07).

    Com `course`, roda só esse curso (9 consultas, uns 18 s): é assim que a
    rodada se divide quando não cabe no limite de duração da hospedagem.
    """
    if course is not None and course not in TARGET_COURSES:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT, "Curso fora dos alvos"
        )

    courses = [course] if course is not None else list(TARGET_COURSES)
    async with httpx2.AsyncClient(timeout=30) as client:
        try:
            result = await run_copeve_round(session, client, courses)
        except (ReportFormatError, ReportUnavailableError) as error:
            # A rodada parou sem gravar nada (RNF-F31.04). O 502 deixa a falha
            # visível no painel de cron da hospedagem.
            logger.warning("Busca na COPEVE parou: %s", type(error).__name__)
            raise HTTPException(
                status.HTTP_502_BAD_GATEWAY, "A busca parou sem gravar nada"
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
