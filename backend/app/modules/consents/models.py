from sqlalchemy import ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class TermsAcceptance(Base):
    """Aceite dos Termos de uso e da Política de privacidade (RF-F7.05).

    Uma linha por menina e versão, com a data e a hora do `created_at`. O
    registro nunca é editado nem apagado (RNF-F7.01): a migração cria um trigger
    no banco que recusa UPDATE e DELETE, mesmo vindo de fora da API. Por isso
    não há `updated_at` (sem TimestampMixin).
    """

    __tablename__ = "terms_acceptances"
    # Aceitar de novo a mesma versão não cria outra linha. Como o servidor só
    # aceita a versão atual, a tabela cresce só quando a equipe publica uma
    # versão nova dos termos.
    __table_args__ = (UniqueConstraint("user_id", "terms_version"),)

    # RESTRICT: a conta de quem aceitou não pode ser apagada, senão o aceite
    # sumiria junto. A exclusão de conta (RF-F7.09) anonimiza a usuária.
    # Sem index=True: a restrição de unicidade acima já cria um índice que
    # começa por user_id.
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    terms_version: Mapped[str] = mapped_column()
