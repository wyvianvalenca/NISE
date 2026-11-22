"""Cadastra e lista as datas importantes da agenda da menina (A14, issue #295).

Rode dentro de backend/, depois do `alembic upgrade head`:

    uv run python -m scripts.datas_importantes adicionar "ENEM, 1º dia" 2026-11-08
    uv run python -m scripts.datas_importantes adicionar "SISU" 2027-01-20 --detalhes "Inscrições"
    uv run python -m scripts.datas_importantes listar

A data é AAAA-MM-DD. Cadastrar de novo o mesmo título no mesmo dia não duplica.
`listar` mostra as datas de hoje em diante, as mesmas que a menina vê. Datas
passadas não aparecem na agenda. Não há tela para isso: curadoria é por
script (AGENTS.md).
"""

import argparse
import asyncio
import sys
from datetime import date

from app.db.engine import SessionLocal, engine
from app.modules.dates.service import add_important_date, list_important_dates
from app.modules.girls.utils import today_in_maceio


def iso_date(text: str) -> date:
    try:
        return date.fromisoformat(text)
    except ValueError:
        raise argparse.ArgumentTypeError(
            f'"{text}" não é uma data AAAA-MM-DD (ex.: 2026-11-08)'
        ) from None


def non_empty(text: str) -> str:
    text = text.strip()
    if not text:
        raise argparse.ArgumentTypeError("o título não pode ficar vazio")
    return text


def format_day(day: date) -> str:
    return day.strftime("%d/%m/%Y")


async def add(title: str, on: date, details: str | None) -> int:
    async with SessionLocal() as session:
        created = await add_important_date(session, title, on, details)

    await engine.dispose()

    if created:
        print(f"Data cadastrada: {format_day(on)} · {title}")
    else:
        print(f"Já existia: {format_day(on)} · {title}")
    return 0


async def show() -> int:
    async with SessionLocal() as session:
        found = await list_important_dates(session, today_in_maceio())

    await engine.dispose()

    if not found:
        print("Nenhuma data de hoje em diante.")
        return 0

    for item in found:
        line = f"{format_day(item.on)} · {item.title}"
        print(f"{line} ({item.details})" if item.details else line)
    return 0


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    commands = parser.add_subparsers(dest="comando", required=True)

    add_parser = commands.add_parser("adicionar", help="cadastra uma data")
    add_parser.add_argument("titulo", type=non_empty, help="ex.: ENEM, 1º dia")
    add_parser.add_argument("dia", type=iso_date, help="AAAA-MM-DD")
    add_parser.add_argument("--detalhes", help="linha menor sob o título")

    commands.add_parser("listar", help="mostra as datas de hoje em diante")

    args = parser.parse_args()
    if args.comando == "adicionar":
        sys.exit(asyncio.run(add(args.titulo, args.dia, args.detalhes)))
    sys.exit(asyncio.run(show()))
