"""Carrega os itens da curadoria do filé no banco (RF-F11.06, D-13, issue #79).

Rode dentro de backend/, depois do `alembic upgrade head`:

    uv run python -m scripts.carregar_curadoria

Ele lê scripts/dados/curadoria.json. Para usar outro arquivo:

    uv run python -m scripts.carregar_curadoria caminho/do/arquivo.json

A curadoria não tem tela: para cadastrar, editar ou desativar um item, mude
o JSON, rode o script e commite o arquivo. Cada item é reconhecido pelo
"slug", então rodar de novo só atualiza, nunca duplica. Nada é apagado, porque
o filé das meninas aponta para os itens; para tirar um item das sugestões,
ponha "active": false nele.

O arquivo inteiro é conferido antes de gravar: se um item tiver erro, nenhum
é gravado e o script diz qual item e qual campo corrigir.
"""

import argparse
import asyncio
import json
import sys
from pathlib import Path
from typing import Any

from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.engine import SessionLocal, engine
from app.modules.catalog.schemas import CuratedItemIn
from app.modules.catalog.service import save_curated_items

# Os itens e as ações apontam para cities; sem importar o model, o SQLAlchemy
# não acha a tabela ao montar as consultas. A carga também confere os códigos.
from app.modules.cities.models import City

DATA_FILE = Path(__file__).parent / "dados" / "curadoria.json"


class CurationFileError(Exception):
    """O arquivo da curadoria tem algum erro; a mensagem diz onde."""


def parse(raw: list[Any]) -> list[CuratedItemIn]:
    """Confere todos os itens e devolve a lista validada, ou junta os erros."""
    entries: list[CuratedItemIn] = []
    errors: list[str] = []
    seen: set[str] = set()

    for position, data in enumerate(raw, start=1):
        # O slug identifica o item na mensagem; sem ele, a posição na lista.
        slug = data.get("slug") if isinstance(data, dict) else None
        name = slug if isinstance(slug, str) else f"item {position}"
        try:
            entry = CuratedItemIn.model_validate(data)
        except ValidationError as error:
            for problem in error.errors():
                field = ".".join(str(part) for part in problem["loc"]) or "item"
                errors.append(f"{name}: {field}: {problem['msg']}")
            continue

        if entry.slug in seen:
            errors.append(f"{name}: slug repetido no arquivo")
            continue
        seen.add(entry.slug)
        entries.append(entry)

    if errors:
        raise CurationFileError("\n".join(errors))
    return entries


def read(path: Path) -> list[CuratedItemIn]:
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as error:
        # Sem isto, um JSON quebrado mostrava um traceback, sem dizer onde corrigir.
        raise CurationFileError(
            f"O arquivo não é um JSON válido (linha {error.lineno}, coluna"
            f" {error.colno}): {error.msg}"
        ) from None
    if not isinstance(raw, list):
        raise CurationFileError("O arquivo precisa ser uma lista de itens")
    return parse(raw)


async def check_cities(session: AsyncSession, entries: list[CuratedItemIn]) -> None:
    """Confere se cada city_ibge_code está na tabela de municípios (RN-17).

    Sem isto, um código que não existe só falhava no commit, com um traceback
    do banco que não diz qual item corrigir. Levanta CurationFileError com o
    slug e o campo de cada item errado; nada é gravado.
    """
    codes = {
        entry.city_ibge_code for entry in entries if entry.city_ibge_code is not None
    }
    if not codes:
        return
    known = set(await session.scalars(select(City.id).where(City.id.in_(codes))))
    errors = [
        f"{entry.slug}: city_ibge_code: o município {entry.city_ibge_code} não está"
        " na tabela de municípios (rode scripts.carregar_municipios antes)"
        for entry in entries
        if entry.city_ibge_code is not None and entry.city_ibge_code not in known
    ]
    if errors:
        raise CurationFileError("\n".join(errors))


async def main(path: Path) -> int:
    try:
        entries = read(path)
    except CurationFileError as error:
        print(f"Nada foi gravado. Corrija {path.name}:\n{error}", file=sys.stderr)
        return 1

    async with SessionLocal() as session:
        try:
            await check_cities(session, entries)
        except CurationFileError as error:
            await engine.dispose()
            print(f"Nada foi gravado. Corrija {path.name}:\n{error}", file=sys.stderr)
            return 1
        created, updated, unchanged = await save_curated_items(session, entries)
    await engine.dispose()

    print(f"{created} itens criados, {updated} atualizados e {unchanged} sem mudança.")
    return 0


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument(
        "arquivo",
        nargs="?",
        type=Path,
        default=DATA_FILE,
        help="JSON com os itens (padrão: scripts/dados/curadoria.json)",
    )
    args = parser.parse_args()
    sys.exit(asyncio.run(main(args.arquivo)))
