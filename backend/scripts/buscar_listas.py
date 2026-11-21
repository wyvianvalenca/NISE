"""Roda agora a busca em listas oficiais ("Buscar agora", RF-F31.08, #273).

Só a equipe NISE roda, por aqui (RN-24). Rode dentro de backend/:

    uv run python -m scripts.buscar_listas            # todos os cursos-alvo
    uv run python -m scripts.buscar_listas --curso 6  # só um curso

O endereço do relatório de cada edição vem das variáveis COPEVE_REPORT_URL,
COPEVE_PUBLIC_URL e COPEVE_SELECTION_PROCESS (veja app/config.py).

Imprime só contagens, nunca quem foi achada. Se a página mudar de formato ou
não responder, para sem gravar nada e sai com código 1.
"""

import argparse
import asyncio
import sys

import httpx2

from app.db.engine import SessionLocal, engine
from app.modules.admissions.copeve import (
    TARGET_COURSES,
    ReportFormatError,
    ReportUnavailableError,
)
from app.modules.admissions.search import (
    RoundRunningError,
    SearchDisabledError,
    run_copeve_round,
)
from app.modules.admissions.service import delete_expired_matches


async def main(courses: list[int], expire: bool) -> int:
    try:
        return await _run(courses, expire)
    finally:
        # Também quando a rodada para: sem isto, o processo deixa conexões abertas.
        await engine.dispose()


async def _run(courses: list[int], expire: bool) -> int:
    async with SessionLocal() as session, httpx2.AsyncClient(timeout=30) as client:
        try:
            result = await run_copeve_round(session, client, courses)
        except SearchDisabledError:
            print(
                "A busca está desligada (LIST_SEARCH_ENABLED) até o Comitê de"
                " Ética aprovar. Nada foi consultado."
            )
            return 1
        except RoundRunningError:
            print("Outra rodada está gravando agora. Nada foi gravado.")
            return 1
        except ReportFormatError:
            print("A página da COPEVE mudou de formato. Nada foi gravado.")
            return 1
        except ReportUnavailableError:
            print("A COPEVE não respondeu. Nada foi gravado.")
            return 1

        print(f"Consultas: {result.queries}")
        print(f"Linhas lidas: {result.rows_read}")
        print(f"Indícios novos: {result.matches_created}")

        if expire:
            print(
                f"Indícios vencidos apagados: {await delete_expired_matches(session)}"
            )

    return 0


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument(
        "--curso",
        type=int,
        choices=sorted(TARGET_COURSES),
        help="roda só este curso (valor do formulário, ex.: 6)",
    )
    parser.add_argument(
        "--apagar-vencidos",
        action="store_true",
        help="depois da busca, apaga os indícios sem resposta há 30 dias",
    )
    args = parser.parse_args()
    courses = [args.curso] if args.curso else list(TARGET_COURSES)
    sys.exit(asyncio.run(main(courses, args.apagar_vencidos)))
