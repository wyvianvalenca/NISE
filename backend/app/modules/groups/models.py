from sqlalchemy import ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.db.mixins import TimestampMixin


class Group(TimestampMixin, Base):
    __tablename__ = "groups"

    name: Mapped[str] = mapped_column(unique=True)


class GroupCoordinator(Base):
    """Liga uma coordenadora a um grupo. As checagens da RN-14 consultam esta tabela."""

    __tablename__ = "group_coordinators"
    __table_args__ = (UniqueConstraint("group_id", "user_id"),)

    group_id: Mapped[int] = mapped_column(
        ForeignKey("groups.id", ondelete="CASCADE"), index=True
    )
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
