import enum
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class Role(enum.Enum):
    GIRL = "girl"
    COORDINATOR = "coordinator"
    NISE_TEAM = "nise_team"


class Provider(enum.Enum):
    GOOGLE = "google"
    MICROSOFT = "microsoft"


class User(Base):
    __tablename__ = "users"

    email: Mapped[str] = mapped_column(unique=True, index=True)
    name: Mapped[str] = mapped_column()
    password_hash: Mapped[str | None] = mapped_column()
    role: Mapped[Role] = mapped_column(default=Role.GIRL)

    # "Oportunidades por e-mail" (RF-F7.06, RF-F7.08). Desligado até ela dizer
    # que quer. A coluna é sobrescrita a cada troca, então ligar e desligar não
    # aumenta a tabela; `changed_at` guarda quando ela escolheu o valor atual.
    opportunity_emails: Mapped[bool] = mapped_column(
        default=False, server_default="false"
    )
    opportunity_emails_changed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True)
    )


class OAuthAccount(Base):
    __tablename__ = "oauth_accounts"
    __table_args__ = (UniqueConstraint("provider", "provider_user_id"),)

    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    provider: Mapped[Provider] = mapped_column()
    provider_user_id: Mapped[str] = mapped_column()
