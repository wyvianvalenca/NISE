"""Roda agora a busca em listas oficiais ("Buscar agora", RF-F31.08, #273, #274).

Só a equipe NISE roda, por aqui (RN-24). Rode dentro de backend/:

    uv run python -m scripts.buscar_listas              # COPEVE e IFAL
    uv run python -m scripts.buscar_listas --fonte ifal # só o IFAL
    uv run python -m scripts.buscar_listas --curso 6    # só um curso da COPEVE

O endereço de cada edição vem de variáveis de ambiente (veja app/config.py):
COPEVE_REPORT_URL, COPEVE_PUBLIC_URL e COPEVE_SELECTION_PROCESS para a COPEVE;
IFAL_SELECTIONS e IFAL_TARGET_COURSES para o IFAL.

Imprime só contagens, nunca quem foi achada. Se uma página ou PDF mudar de
formato ou não responder, a rodada daquela fonte para sem gravar nada e o
script sai com código 1.
"""

import argparse
import asyncio
import sys
from collections.abc import Sequence

import httpx2

from app.config import settings
from app.db.engine import SessionLocal, engine
from app.modules.admissions.copeve import (
    TARGET_COURSES,
    ReportFormatError,
    ReportUnavailableError,
)
from app.modules.admissions.search import (
    RoundResult,
    RoundRunningError,
    SearchDisabledError,
    run_copeve_round,
    run_ifal_round,
)
from app.modules.admissions.service import delete_expired_matches

SOURCES = ("copeve", "ifal")
LABELS = {"copeve": "COPEVE", "ifal": "IFAL"}


async def main(
    courses: list[int], expire: bool, sources: Sequence[str] = ("copeve",)
) -> int:
    try:
        return await _run(courses, expire, sources)
    finally:
        # Também quando a rodada para: sem isto, o processo deixa conexões abertas.
        await engine.dispose()


async def _run(courses: list[int], expire: bool, sources: Sequence[str]) -> int:
    code = 0
    async with SessionLocal() as session, httpx2.AsyncClient(timeout=30) as client:
        for source in sources:
            label = LABELS[source]
            print(label)
            if source == "ifal" and not settings.ifal_selections:
                print("  Nenhuma seleção configurada (IFAL_SELECTIONS).")
                continue
            try:
                result: RoundResult
                if source == "ifal":
                    result = await run_ifal_round(session, client)
                else:
                    result = await run_copeve_round(session, client, courses)
            except SearchDisabledError:
                print(
                    "  A busca está desligada (LIST_SEARCH_ENABLED) até o Comitê"
                    " de Ética aprovar. Nada foi consultado."
                )
                return 1
            except RoundRunningError:
                print("  Outra rodada está gravando agora. Nada foi gravado.")
                code = 1
                continue
            except ReportFormatError:
                print(f"  A página ou o PDF do {label} mudou de formato.")
                print("  Nada foi gravado.")
                code = 1
                continue
            except ReportUnavailableError:
                print(f"  O {label} não respondeu. Nada foi gravado.")
                code = 1
                continue

            print(f"  Consultas: {result.queries}")
            print(f"  Linhas lidas: {result.rows_read}")
            print(f"  Indícios novos: {result.matches_created}")

        if expire:
            print(
                f"Indícios vencidos apagados: {await delete_expired_matches(session)}"
            )

    return code


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument(
        "--fonte",
        choices=[*SOURCES, "todas"],
        default="todas",
        help="onde buscar (padrão: todas)",
    )
    parser.add_argument(
        "--curso",
        type=int,
        choices=sorted(TARGET_COURSES),
        help="roda só este curso da COPEVE (valor do formulário, ex.: 6)",
    )
    parser.add_argument(
        "--apagar-vencidos",
        action="store_true",
        help="depois da busca, apaga os indícios sem resposta há 30 dias",
    )
    args = parser.parse_args()
    courses = [args.curso] if args.curso else list(TARGET_COURSES)
    if args.curso:
        sources: Sequence[str] = ("copeve",)
    elif args.fonte == "todas":
        sources = SOURCES
    else:
        sources = (args.fonte,)
    sys.exit(asyncio.run(main(courses, args.apagar_vencidos, sources)))
