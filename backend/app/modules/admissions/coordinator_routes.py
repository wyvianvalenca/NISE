from typing import Annotated

from fastapi import APIRouter, Query, status

from app.auth.permissions import CoordinatorDep
from app.db.engine import AsyncSessionDep
from app.modules.actions.dependencies import CoordinatorGroupIdDep
from app.modules.admissions.schemas import (
    EnrollmentPageOut,
    EnrollmentRowOut,
    EnrollmentSummaryOut,
    ListSearchOut,
)
from app.modules.admissions.service import (
    ENROLLMENTS_PAGE_SIZE,
    get_enrollment_summary,
    get_list_search,
    list_group_enrollments,
)
from app.modules.admissions.utils import short_name

router = APIRouter(prefix="/coordinator", tags=["Coordinator"])


# K06 Ingressantes · "Quem ingressou" (#315, RF-F5.05). O grupo vem sempre da
# sessão da coordenadora, nunca da requisição: outro grupo não tem como pedir
# esta lista (RNF-G.03). Ela não confirma nada aqui (D-70).
#
# Uma página fora do fim responde a lista vazia com o total, e o front volta.
@router.get(
    "/enrollments",
    response_model=EnrollmentPageOut,
    responses={
        status.HTTP_403_FORBIDDEN: {"description": "Não é coordenadora ou sem grupo"},
        status.HTTP_409_CONFLICT: {"description": "Coordenadora em mais de um grupo"},
    },
)
async def group_enrollments(
    group_id: CoordinatorGroupIdDep,
    session: AsyncSessionDep,
    page: Annotated[int, Query(ge=1, le=10_000)] = 1,
) -> EnrollmentPageOut:
    rows, total = await list_group_enrollments(session, group_id, page)

    return EnrollmentPageOut(
        items=[
            EnrollmentRowOut(
                id=enrollment.id,
                girl_name=short_name(name),
                course=enrollment.course,
                institution=enrollment.institution.strip() or None,
                registered_at=enrollment.created_at,
                origin=enrollment.origin,
            )
            for enrollment, name in rows
        ],
        total=total,
        page=page,
        page_size=ENROLLMENTS_PAGE_SIZE,
    )


# K06 Ingressantes · resumo do topo (#316, RF-F5.21, RF-F5.22). Mesma regra de
# permissão da lista: o grupo vem da sessão (RNF-G.03). Os números aparecem
# mesmo com menos de 5 meninas (RN-06 não vale aqui, D-75).
@router.get(
    "/enrollments/summary",
    response_model=EnrollmentSummaryOut,
    responses={
        status.HTTP_403_FORBIDDEN: {"description": "Não é coordenadora ou sem grupo"},
        status.HTTP_409_CONFLICT: {"description": "Coordenadora em mais de um grupo"},
    },
)
async def group_enrollment_summary(
    group_id: CoordinatorGroupIdDep, session: AsyncSessionDep
) -> EnrollmentSummaryOut:
    return await get_enrollment_summary(session, group_id)


# K06 Ingressantes · card "Busca nas listas de ingressantes" (#317, RF-F5.23).
# Mesmas datas para toda coordenadora, porque a busca não é por grupo; por isso
# pede só o papel, não um grupo. Não devolve nada de quem foi achada (RN-24).
@router.get(
    "/list-search",
    response_model=ListSearchOut,
    responses={status.HTTP_403_FORBIDDEN: {"description": "Não é coordenadora"}},
)
async def list_search(
    _coordinator: CoordinatorDep, session: AsyncSessionDep
) -> ListSearchOut:
    return await get_list_search(session)
