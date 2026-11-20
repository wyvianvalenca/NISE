from typing import Any

from fastapi import APIRouter, status
from fastapi.responses import JSONResponse

from app.db.engine import AsyncSessionDep
from app.modules.actions.dependencies import GroupActionDep
from app.modules.attendance.dependencies import TodayDep
from app.modules.attendance.exceptions import AttendanceError
from app.modules.attendance.schemas import AttendancePageOut, SavedMarksIn
from app.modules.attendance.service import build_attendance_page, save_marks

# The attendance of an action (C3, #135). Every route takes the action through
# GroupActionDep: an action of another group is a 404, the same as one that does
# not exist, even by a direct request (RNF-G.03).
router = APIRouter(prefix="/actions/{action_id}/attendance", tags=["Attendance"])

NOT_FOUND: dict[int | str, dict[str, Any]] = {
    status.HTTP_404_NOT_FOUND: {"description": "Ação não encontrada"}
}


# The action page around the attendance (K11, #338, RF-F3.08, RN-37).
@router.get("", response_model=AttendancePageOut, responses=NOT_FOUND)
async def attendance_page(
    action: GroupActionDep, session: AsyncSessionDep, today: TodayDep
) -> AttendancePageOut:
    return await build_attendance_page(session, action, today)


def _refused(error: AttendanceError) -> JSONResponse:
    # 422 for an id outside the action; 409 for the moment being wrong.
    code = (
        status.HTTP_422_UNPROCESSABLE_CONTENT
        if error.code == "unknown_registration"
        else status.HTTP_409_CONFLICT
    )
    return JSONResponse(status_code=code, content={"error": error.code})


REFUSED: dict[int | str, dict[str, Any]] = {
    **NOT_FOUND,
    status.HTTP_409_CONFLICT: {
        "description": (
            'Fora do momento: {"error": "too_early"} antes do dia do evento, '
            '{"error": "already_concluded"} depois de concluir'
        )
    },
    status.HTTP_422_UNPROCESSABLE_CONTENT: {
        "description": (
            'Um id que não é inscrição desta ação: {"error": "unknown_registration"}'
        )
    },
}


# "Salvar e continuar depois" (#340, RF-F3.04, D-81). Replaces the saved marks;
# sends nothing and does not conclude. From the day of the event until it is
# concluded (RN-37, D-80).
@router.put("/marks", response_model=AttendancePageOut, responses=REFUSED)
async def save_attendance_marks(
    data: SavedMarksIn,
    action: GroupActionDep,
    session: AsyncSessionDep,
    today: TodayDep,
) -> AttendancePageOut | JSONResponse:
    try:
        await save_marks(session, action, data.present_ids, today)
    except AttendanceError as error:
        await session.rollback()
        return _refused(error)

    return await build_attendance_page(session, action, today)
