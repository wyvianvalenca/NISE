from fastapi import APIRouter, HTTPException, status

from app.db.engine import AsyncSessionDep
from app.modules.admissions.dependencies import CurrentGirlDep
from app.modules.admissions.exceptions import (
    MatchAlreadyAnsweredError,
    MatchNotFoundError,
)
from app.modules.admissions.models import ListMatch
from app.modules.admissions.schemas import MatchAnswerIn, MatchAnswerOut, MatchOut
from app.modules.admissions.service import answer_match, open_matches_of_girl
from app.modules.girls.models import Girl

# Rotas da própria menina. Coordenadora e curadoria levam 403 (CurrentGirlDep), e
# o indício de outra menina dá 404, como se não existisse (RNF-F31.02).
router = APIRouter(prefix="/matches", tags=["Matches"])


def _card(girl: Girl, match: ListMatch) -> MatchOut:
    official_list = match.official_list
    return MatchOut(
        id=match.id,
        name=girl.name,
        institution=official_list.institution,
        selection_process=official_list.selection_process,
        call=official_list.call,
        course=match.course,
        level=match.level,
        list_url=official_list.url,
        expires_at=match.expires_at,
    )


@router.get("", response_model=list[MatchOut])
async def list_my_matches(
    session: AsyncSessionDep, girl: CurrentGirlDep
) -> list[MatchOut]:
    """Os indícios sem resposta dela, para a A19 "É você na lista?"."""
    matches = await open_matches_of_girl(session, girl.id)

    return [_card(girl, match) for match in matches]


@router.post("/{match_id}/answer", response_model=MatchAnswerOut)
async def answer_my_match(
    match_id: int, data: MatchAnswerIn, session: AsyncSessionDep, girl: CurrentGirlDep
) -> MatchAnswerOut:
    """Grava a resposta da A19 (RF-F31.04). Só dá pra responder uma vez."""
    try:
        result = await answer_match(session, girl.id, match_id, data)
    except MatchNotFoundError:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND, "Essa pergunta não está mais aqui"
        ) from None
    except MatchAlreadyAnsweredError:
        raise HTTPException(
            status.HTTP_409_CONFLICT, "Você já respondeu essa pergunta"
        ) from None

    return MatchAnswerOut(result=result)
