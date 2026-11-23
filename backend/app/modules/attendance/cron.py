"""The scheduled routine that sends what is left of the attendance e-mails.

The e-mails go out right away when the coordinator concludes or marks someone
(#348, #350). This routine sends what did not fit in that moment or failed
(D-81: the attendance stays concluded and the system tries again). Protected
by CRON_SECRET, like the routines of the official lists, and answers only
counts (RN-24).
"""

from fastapi import APIRouter, HTTPException, status

from app.core.email import SmtpConnection
from app.db.engine import AsyncSessionDep
from app.modules.admissions.cron import CronDep
from app.modules.attendance.emails import send_attendance_emails

router = APIRouter(prefix="/cron", tags=["Cron"], include_in_schema=False)


@router.get("/attendance-emails", dependencies=[CronDep])
async def attendance_emails(session: AsyncSessionDep) -> dict[str, int]:
    """Sends the queue of invites and evaluations (RF-F4.01, D-81).

    If sending stops (SMTP down or not configured), answers 502 so the failure
    shows in the cron panel; what is left stays in the queue.
    """
    result = await send_attendance_emails(session, connect=SmtpConnection)
    if result.stopped:
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY, "O envio parou; o resto fica na fila"
        )
    return {"sent": result.sent, "dropped": result.dropped}
