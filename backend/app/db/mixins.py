from datetime import datetime
from typing import Any, ClassVar

from sqlalchemy import TIMESTAMP, func
from sqlalchemy.orm import Mapped, mapped_column


class TimestampMixin:
    """adds `updated_at` attribute to a model, which is automatically updated on every update.

    Uso: `class Girl(TimestampMixin, Base): ...`
    """

    updated_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    # Busca o valor novo via RETURNING no próprio INSERT/UPDATE. Sem isso o
    # atributo expira depois do flush e lê-lo no SQLAlchemy assíncrono dá erro.
    __mapper_args__: ClassVar[dict[str, Any]] = {"eager_defaults": True}
