"""Cria um link de convite de um grupo (A01b, issue #51).

Rode dentro de backend/, depois do `alembic upgrade head`:

    uv run python -m scripts.criar_convite "Rendeiras"
    uv run python -m scripts.criar_convite "Rendeiras" --dias 30

O nome tem que ser igual ao do grupo no banco. O script imprime o caminho do
link (/convite/<código>), que vai depois do endereço do site. O convite pode
ser usado por várias meninas até vencer; quem cria conta por ele fica com o
grupo como origem. Não há tela para isso: curadoria é por script (AGENTS.md).
"""

import argparse
import asyncio
import sys

from sqlalchemy import select

from app.db.engine import SessionLocal, engine
from app.modules.girls.utils import MACEIO_TZ
from app.modules.groups.models import Group
from app.modules.groups.service import create_invite

DEFAULT_DAYS = 90


def positive_days(text: str) -> int:
    days = int(text)
    if days < 1:
        raise argparse.ArgumentTypeError("o convite precisa valer pelo menos 1 dia")
    return days


async def main(group_name: str, days: int) -> int:
    async with SessionLocal() as session:
        group = await session.scalar(select(Group).where(Group.name == group_name))

        if group is None:
            print(f'Nenhum grupo chamado "{group_name}".', file=sys.stderr)
            await engine.dispose()
            return 1

        invite = await create_invite(session, group, days)

    await engine.dispose()

    expires = invite.expires_at.astimezone(MACEIO_TZ).strftime("%d/%m/%Y %H:%M")
    print(f"Convite do grupo {group.name}: /convite/{invite.code}")
    print(f"Vale até {expires} (horário de Maceió).")
    return 0


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("grupo", help="nome do grupo, igual ao do banco")
    parser.add_argument(
        "--dias",
        type=positive_days,
        default=DEFAULT_DAYS,
        help=f"por quantos dias o convite vale (padrão: {DEFAULT_DAYS})",
    )
    args = parser.parse_args()
    sys.exit(asyncio.run(main(args.grupo, args.dias)))
