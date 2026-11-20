from typing import Any

from fastapi import APIRouter, status

from app.db.engine import AsyncSessionDep
from app.modules.actions.dependencies import GroupActionDep
from app.modules.attendance.dependencies import TodayDep
from app.modules.attendance.schemas import AttendancePageOut
from app.modules.attendance.service import build_attendance_page

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
