"""Carrega a lista de municípios do IBGE na tabela cities (RN-17, issue #50).

Rode dentro de backend/, depois do `alembic upgrade head`:

    uv run python -m scripts.carregar_municipios

Ele lê a cópia guardada em scripts/dados/municipios_ibge.json, então não
precisa de internet. Para atualizar essa cópia pela API do IBGE antes de
carregar (por exemplo, quando surgir um município novo), use --baixar e
commite o JSON alterado:

    uv run python -m scripts.carregar_municipios --baixar

Pode rodar quantas vezes quiser: um município que já está no banco só é
atualizado, nunca duplicado. Nada é apagado, porque outras tabelas apontam
para os municípios.
"""

import argparse
import asyncio
import json
from pathlib import Path
from typing import Any, TypedDict

import httpx2
from sqlalchemy.dialects.postgresql import insert

from app.db.engine import SessionLocal, engine
from app.modules.cities.models import City
from app.modules.cities.utils import normalize_search

DATA_FILE = Path(__file__).parent / "dados" / "municipios_ibge.json"
IBGE_URL = (
    "https://servicodados.ibge.gov.br/api/v1/localidades/municipios?view=nivelado"
)
# Cada linha usa 4 parâmetros, e o Postgres aceita até 32767 por comando.
BATCH_SIZE = 1000


class Municipio(TypedDict):
    id: int
    nome: str
    uf: str


def from_ibge(raw: list[dict[str, Any]]) -> list[Municipio]:
    """Fica só com código, nome e UF da resposta do IBGE (view=nivelado)."""
    municipios: list[Municipio] = [
        {
            "id": int(item["municipio-id"]),
            "nome": item["municipio-nome"],
            "uf": item["UF-sigla"],
        }
        for item in raw
    ]
    return sorted(municipios, key=lambda municipio: municipio["id"])


def to_rows(municipios: list[Municipio]) -> list[dict[str, Any]]:
    """Monta as linhas da tabela cities, com o texto de busca já normalizado."""
    return [
        {
            "id": municipio["id"],
            "name": municipio["nome"],
            "state": municipio["uf"],
            "search_name": normalize_search(f"{municipio['nome']}, {municipio['uf']}"),
        }
        for municipio in municipios
    ]


async def download() -> list[Municipio]:
    async with httpx2.AsyncClient(timeout=30) as http:
        response = await http.get(IBGE_URL)
        response.raise_for_status()
        return from_ibge(response.json())


def save(municipios: list[Municipio]) -> None:
    # Um município por linha, para o diff mostrar só o que mudou.
    lines = [json.dumps(municipio, ensure_ascii=False) for municipio in municipios]
    DATA_FILE.write_text(
        "[\n" + ",\n".join(lines) + "\n]\n", encoding="utf-8", newline="\n"
    )


def read() -> list[Municipio]:
    municipios: list[Municipio] = json.loads(DATA_FILE.read_text(encoding="utf-8"))
    return municipios


async def load(rows: list[dict[str, Any]]) -> None:
    async with SessionLocal() as session:
        for start in range(0, len(rows), BATCH_SIZE):
            statement = insert(City).values(rows[start : start + BATCH_SIZE])
            statement = statement.on_conflict_do_update(
                index_elements=[City.id],
                set_={
                    "name": statement.excluded.name,
                    "state": statement.excluded.state,
                    "search_name": statement.excluded.search_name,
                },
            )
            await session.execute(statement)
        await session.commit()


async def main(baixar: bool) -> None:
    if baixar:
        municipios = await download()
        save(municipios)
        print(f"Cópia atualizada pela API do IBGE: {DATA_FILE.name}")
    else:
        municipios = read()

    await load(to_rows(municipios))
    await engine.dispose()
    print(f"{len(municipios)} municípios carregados.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument(
        "--baixar",
        action="store_true",
        help="atualiza scripts/dados/municipios_ibge.json pela API do IBGE",
    )
    args = parser.parse_args()
    asyncio.run(main(args.baixar))
