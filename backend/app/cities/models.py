from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class City(Base):
    """Município da lista oficial do IBGE (RN-17: a cidade nunca é texto livre).

    A tabela é preenchida por `scripts/carregar_municipios.py`, não pela API.
    """

    __tablename__ = "cities"

    # O id é o próprio código IBGE (ex.: 2704302 para Maceió), para as outras
    # tabelas apontarem para o município pelo código oficial.
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=False)
    name: Mapped[str] = mapped_column()
    # Sigla da UF, ex.: "AL".
    state: Mapped[str] = mapped_column()
    # "Nome, UF" sem acento e em minúsculas (ex.: "maceio, al"), calculado na
    # carga com normalize_search. É nela que a busca procura.
    search_name: Mapped[str] = mapped_column()
