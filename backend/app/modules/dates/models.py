from datetime import date

from sqlalchemy import UniqueConstraint
from sqlalchemy.orm import Mapped

from app.db.base import Base


class ImportantDate(Base):
    """Data importante que a equipe cadastra e que aparece na agenda (RF-F4.11b).

    ENEM, SISU, IFAL e outras. Vale para todas as meninas igual, então não
    liga a ninguém. Não há tela: a equipe cadastra por
    `backend/scripts/datas_importantes.py` (AGENTS.md).
    """

    __tablename__ = "important_dates"
    __table_args__ = (UniqueConstraint("title", "on"),)

    title: Mapped[str]
    on: Mapped[date]
    # Linha menor sob o título (ex.: "Inscrições até esta data").
    details: Mapped[str | None]
