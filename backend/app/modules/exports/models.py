from datetime import datetime

from sqlalchemy import TIMESTAMP, ForeignKey, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class DataExport(Base):
    """Uma exportação anônima do grupo (F24, #375, RN-07).

    A linha fica como registro de que a exportação aconteceu (o histórico é a
    #376). O arquivo em si fica em `content` só por um tempo: em até 24 horas
    `purge_old_files` apaga o texto e a linha continua. Aqui nunca há nome,
    e-mail nem outro dado de menina além do que já está no CSV anônimo.
    """

    __tablename__ = "data_exports"

    group_id: Mapped[int] = mapped_column(
        ForeignKey("groups.id", ondelete="CASCADE"), index=True
    )
    # Quem gerou. Se a conta sair, o registro do grupo fica.
    user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )
    filename: Mapped[str] = mapped_column()
    row_count: Mapped[int] = mapped_column()
    column_count: Mapped[int] = mapped_column()
    # O CSV pronto, com BOM. Vazio depois que o arquivo foi removido.
    content: Mapped[str | None] = mapped_column(Text)
    # O recorte usado (período, ação, tipo e tag; RF-F24.09), para o histórico
    # (#376). Nulo nas exportações de antes do recorte.
    cut: Mapped[dict[str, int | str | None] | None] = mapped_column(JSONB)
    # O modelo escolhido no primeiro passo (RF-F24.10), para o nome do arquivo e o
    # histórico. Nulo nas exportações de antes dos modelos.
    model: Mapped[str | None] = mapped_column()
    # Até quando o link de download vale (15 minutos depois de gerar).
    expires_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True))
