"""As migrações formam uma linha só, com uma head.

Duas branches que criam migrações a partir da mesma revisão deixam duas heads, e
`alembic upgrade head` falha com "Multiple head revisions". Quem fizer o merge
por último aponta o down_revision da sua primeira migração para a head da outra.
Este teste pega isso na CI, antes do deploy (revisão da #320).
"""

from pathlib import Path

from alembic.config import Config
from alembic.script import ScriptDirectory

BACKEND = Path(__file__).resolve().parents[1]


def test_as_migracoes_tem_uma_head_so() -> None:
    config = Config(str(BACKEND / "alembic.ini"))
    config.set_main_option("script_location", str(BACKEND / "alembic"))
    heads = ScriptDirectory.from_config(config).get_heads()

    assert len(heads) == 1, f"Mais de uma head: {heads}. Encadeie as migrações."
