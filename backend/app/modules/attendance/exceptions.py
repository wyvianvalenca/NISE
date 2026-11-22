class AttendanceError(Exception):
    """A rule of the attendance (C3) refused the request.

    `code` goes to the response as {"error": code}, so the page can tell the
    cases apart without reading the message.
    """

    code = "attendance_error"


class TooEarlyError(AttendanceError):
    """The day of the event has not come yet (D-80, RN-37)."""

    code = "too_early"


class AlreadyConcludedError(AttendanceError):
    """The attendance was concluded: after that, people are only added (D-80)."""

    code = "already_concluded"


class NotConcludedError(AttendanceError):
    """Only a concluded attendance takes people one at a time (RF-F3.09)."""

    code = "not_concluded"


class UnknownRegistrationError(AttendanceError):
    """An id that is not a registration of this action."""

    code = "unknown_registration"
