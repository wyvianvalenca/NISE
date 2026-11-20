from datetime import date
from typing import Annotated

from fastapi import Depends

from app.modules.actions.service import today_in_maceio


def current_day() -> date:
    """Today in Maceió time (RN-37). A dependency, so the tests can fix the day."""
    return today_in_maceio()


TodayDep = Annotated[date, Depends(current_day)]
