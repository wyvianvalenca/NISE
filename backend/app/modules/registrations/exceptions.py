class ActionNotInGroupError(Exception):
    """The action does not belong to any of the coordinator's groups (RN-14)."""


class EventDayReachedError(Exception):
    """The registrations cannot be reopened once the day of the event came (RF-F1.13)."""
