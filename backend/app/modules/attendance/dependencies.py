from collections.abc import Callable
from datetime import date
from typing import Annotated

from fastapi import Depends

from app.core.email import SmtpConnection
from app.modules.actions.service import today_in_maceio
from app.modules.attendance.emails import Sender


def current_day() -> date:
    """Today in Maceió time (RN-37). A dependency, so the tests can fix the day."""
    return today_in_maceio()


TodayDep = Annotated[date, Depends(current_day)]


def email_connection() -> Callable[[], Sender]:
    """How the routes open the SMTP connection. A dependency, so the tests
    record the e-mails instead of sending them."""
    return SmtpConnection


ConnectDep = Annotated[Callable[[], Sender], Depends(email_connection)]
