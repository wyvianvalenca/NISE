from sqlalchemy import ForeignKey
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.db.mixins import TimestampMixin
from app.modules.catalog.models import EffortBand


class LastBand(TimestampMixin, Base):
    """A faixa que a menina abriu por último no Descobrir (A06·1, #86).

    Serve só para a tag "da última vez" no cartão dessa faixa. Uma linha por
    menina: abrir outra faixa troca a que estava gravada.

    Fica numa tabela própria, e não em `girls`, porque `EffortBand` mora no
    catálogo, que já importa os temas e as etapas de girls/models.py.
    """

    __tablename__ = "last_bands"

    girl_id: Mapped[int] = mapped_column(
        ForeignKey("girls.id", ondelete="CASCADE"), unique=True
    )
    band: Mapped[EffortBand] = mapped_column()
