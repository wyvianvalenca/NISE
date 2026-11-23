from typing import Any

from fastapi import APIRouter, status
from fastapi.responses import JSONResponse

from app.db.engine import AsyncSessionDep
from app.modules.admissions.declaration import course_name
from app.modules.admissions.service import (
    add_self_declared_enrollment,
    current_enrollment,
)
from app.modules.consents.permissions import AcceptedGirlDep
from app.modules.girls.schemas import (
    InterestOptionsOut,
    InterestsIn,
    OptionOut,
    ProfileCourseIn,
    ProfileCourseOut,
    ProfileDetailsOut,
    ProfileOut,
)
from app.modules.girls.service import (
    get_girl_of_user,
    get_profile_details,
    mark_file_intro_seen,
    save_interests,
)
from app.modules.girls.utils import STUDY_STAGE_LABELS, TOPIC_LABELS, today_in_maceio

router = APIRouter(prefix="/profile", tags=["Profile"])

TERMS_NOT_ACCEPTED: dict[int | str, dict[str, Any]] = {
    status.HTTP_403_FORBIDDEN: {
        "description": 'Sem o aceite dos termos: {"error": "terms_not_accepted"}'
    },
}


# Listas da A05 · "O que te interessa?" (#56, RF-F10.01). Vêm do back para o
# front e as sugestões usarem os mesmos códigos.
#
# AcceptedGirlDep porque a A05 vem depois dos termos. As listas não têm dado
# pessoal, mas só quem está no cadastro precisa delas.
@router.get(
    "/interest-options",
    response_model=InterestOptionsOut,
    responses=TERMS_NOT_ACCEPTED,
)
async def interest_options(user: AcceptedGirlDep) -> InterestOptionsOut:
    return InterestOptionsOut(
        topics=[
            OptionOut(code=topic.value, label=label)
            for topic, label in TOPIC_LABELS.items()
        ],
        stages=[
            OptionOut(code=stage.value, label=label)
            for stage, label in STUDY_STAGE_LABELS.items()
        ],
    )


# "Começar meu filé" na A05 (RF-F10.01). Escolher de novo troca o que estava
# gravado. Códigos fora das listas, "me mostra de tudo" junto com temas e
# escolha sem tema nenhum respondem 422 (D-19: não há "Pular por agora").
#
# Não há id na URL nem no corpo: ela só muda o próprio perfil, o da sessão
# (RNF-G.03).
@router.put(
    "/interests",
    status_code=status.HTTP_204_NO_CONTENT,
    response_model=None,
    responses={
        **TERMS_NOT_ACCEPTED,
        status.HTTP_404_NOT_FOUND: {
            "description": (
                'A conta não tem registro de menina: {"error": "profile_not_found"}'
            )
        },
    },
)
async def update_interests(
    data: InterestsIn, user: AcceptedGirlDep, session: AsyncSessionDep
) -> JSONResponse | None:
    saved = await save_interests(session, user.id, data)

    if not saved:
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content={"error": "profile_not_found"},
        )

    return None


PROFILE_NOT_FOUND: dict[int | str, dict[str, Any]] = {
    status.HTTP_404_NOT_FOUND: {
        "description": (
            'A conta não tem registro de menina: {"error": "profile_not_found"}'
        )
    },
}


def profile_not_found() -> JSONResponse:
    # Não deveria acontecer: o cadastro (#51, #52) sempre cria ou liga um
    # registro de menina à conta.
    return JSONResponse(
        status_code=status.HTTP_404_NOT_FOUND,
        content={"error": "profile_not_found"},
    )


# O perfil da menina da sessão. Por enquanto só diz se ela já viu "Por que
# filé?", para a A06·0 abrir sozinha só na primeira vez (RF-F10.02, #84).
#
# Não há id na URL: ela só lê o próprio perfil, o da sessão (RNF-G.03).
@router.get(
    "",
    response_model=ProfileOut,
    responses={**TERMS_NOT_ACCEPTED, **PROFILE_NOT_FOUND},
)
async def profile(
    user: AcceptedGirlDep, session: AsyncSessionDep
) -> ProfileOut | JSONResponse:
    girl = await get_girl_of_user(session, user.id)

    if girl is None:
        return profile_not_found()

    return ProfileOut(file_intro_seen=girl.file_intro_seen)


# "Começar meu filé" na A06·0: depois disso a explicação não abre mais
# sozinha, só pelo "?" ao lado de "Seu filé" (RF-F10.02). Marcar duas vezes
# não muda nada.
#
# Sem id na URL nem no corpo: ela só marca o próprio perfil (RNF-G.03).
@router.put(
    "/file-intro-seen",
    status_code=status.HTTP_204_NO_CONTENT,
    response_model=None,
    responses={**TERMS_NOT_ACCEPTED, **PROFILE_NOT_FOUND},
)
async def file_intro_seen(
    user: AcceptedGirlDep, session: AsyncSessionDep
) -> JSONResponse | None:
    marked = await mark_file_intro_seen(session, user.id)

    if not marked:
        return profile_not_found()

    return None


# A tela de perfil (A10, RF-F7.11, RF-F7.12): conta, interesses, grupo e o que
# chega no e-mail. É uma rota à parte de GET /api/profile, que a A06·0 lê
# sempre e não pode trazer dado pessoal.
#
# Não há id na URL: ela só lê o próprio perfil, o da sessão (RNF-G.03).
@router.get(
    "/details",
    response_model=ProfileDetailsOut,
    responses={**TERMS_NOT_ACCEPTED, **PROFILE_NOT_FOUND},
)
async def profile_details(
    user: AcceptedGirlDep, session: AsyncSessionDep
) -> ProfileDetailsOut | JSONResponse:
    details = await get_profile_details(session, user)

    if details is None:
        return profile_not_found()

    return details


# "Seu caminho" no perfil (A10, #298): o curso em que ela está hoje e o nome
# para a A10b. Sem id na URL: ela só lê o próprio curso (RNF-G.03).
@router.get(
    "/course",
    response_model=ProfileCourseOut,
    responses={**TERMS_NOT_ACCEPTED, **PROFILE_NOT_FOUND},
)
async def profile_course(
    user: AcceptedGirlDep, session: AsyncSessionDep
) -> ProfileCourseOut | JSONResponse:
    girl = await get_girl_of_user(session, user.id)

    if girl is None:
        return profile_not_found()

    enrollment = await current_enrollment(session, girl.id)
    first_name = girl.name.split()[0] if girl.name.strip() else ""

    if enrollment is None:
        return ProfileCourseOut(first_name=first_name)

    return ProfileCourseOut(
        first_name=first_name, level=enrollment.level, course=enrollment.course
    )


# "Salvar" na A10b (RF-F6.04, RF-F6.05): ela registra o ingresso quando quiser,
# sem esperar o questionário, e não cria resposta de questionário nenhum.
# Registrar de novo troca o curso: o anterior fica com a data em que ela saiu.
#
# "Tô tentando entrar" e "Ainda não" não são ingresso (RN-22): respondem 204 e
# não gravam nada.
@router.post(
    "/course",
    status_code=status.HTTP_204_NO_CONTENT,
    response_model=None,
    responses={**TERMS_NOT_ACCEPTED, **PROFILE_NOT_FOUND},
)
async def register_course(
    data: ProfileCourseIn, user: AcceptedGirlDep, session: AsyncSessionDep
) -> JSONResponse | None:
    girl = await get_girl_of_user(session, user.id)

    if girl is None:
        return profile_not_found()

    level = data.level
    if level is None:
        return None

    # Um curso atual só: o anterior ganha a data de saída, como em "Mudei de
    # curso" no questionário (record_followup, followup/service.py), e fica de
    # histórico (RF-F6.05).
    previous = await current_enrollment(session, girl.id)
    if previous:
        previous.left_on = today_in_maceio()

    assert data.course is not None
    add_self_declared_enrollment(
        session,
        girl.id,
        level,
        course_name(data.course, data.other_course),
        data.institution,
    )

    # Um commit só: ou troca o curso, ou nada muda (RNF-F6.01).
    await session.commit()

    return None
