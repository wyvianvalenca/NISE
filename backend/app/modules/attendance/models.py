import enum
from datetime import datetime

from sqlalchemy import TIMESTAMP, ForeignKey, Index, UniqueConstraint, text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class AttendanceEmailKind(enum.Enum):
    """The two e-mails that the attendance causes (RF-F4.01, D-34, D-81)."""

    # The personal invite to create an account, to a registered girl without one.
    INVITE = "invite"
    # The evaluation of the action, to a girl marked as present.
    EVALUATION = "evaluation"


class AttendanceEmail(Base):
    """One e-mail of the attendance, waiting to go out or already sent.

    The row is created when the coordinator concludes the attendance, or marks
    or adds someone afterwards (#348, #350), and the sending marks `sent_at`
    before the message leaves, so it goes out at most once (RNF-F4.01). If
    sending fails before it leaves, the row goes back to the queue and the
    scheduled routine tries again (D-81). `dropped_at` marks one that will
    never go: the address was refused for good, or it is no longer wanted (she
    created her account, or already rated the action).

    The database guarantees "never twice": one e-mail of each kind per girl and
    action, and a single invite per girl, whatever the action or group (RN-29).
    """

    __tablename__ = "attendance_emails"
    # The Postgres stores the name of the enum member (e.g. 'INVITE').
    __table_args__ = (
        UniqueConstraint("girl_id", "action_id", "kind"),
        Index(
            "uq_attendance_emails_one_invite_per_girl",
            "girl_id",
            unique=True,
            postgresql_where=text("kind = 'INVITE'"),
        ),
    )

    # No index=True: the unique constraint above starts with girl_id.
    girl_id: Mapped[int] = mapped_column(ForeignKey("girls.id", ondelete="CASCADE"))
    action_id: Mapped[int] = mapped_column(
        ForeignKey("actions.id", ondelete="CASCADE"), index=True
    )
    kind: Mapped[AttendanceEmailKind] = mapped_column()
    sent_at: Mapped[datetime | None] = mapped_column(TIMESTAMP(timezone=True))
    dropped_at: Mapped[datetime | None] = mapped_column(TIMESTAMP(timezone=True))
