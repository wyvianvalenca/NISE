"""Datas importantes da agenda (RF-F4.11b, #295): o cadastro e o script.

Usa a fixture `db_session`. Dados fictícios.
"""

import argparse
from datetime import date

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.dates.models import ImportantDate
from app.modules.dates.service import add_important_date, list_important_dates
from scripts.datas_importantes import format_day, iso_date, non_empty


async def test_cadastrar_a_mesma_data_duas_vezes_nao_duplica(
    db_session: AsyncSession,
) -> None:
    primeira = await add_important_date(
        db_session, "ENEM, 1º dia", date(2026, 12, 8), None
    )
    segunda = await add_important_date(
        db_session, "ENEM, 1º dia", date(2026, 12, 8), "outro detalhe"
    )

    assert (primeira, segunda) == (True, False)
    total = await db_session.scalar(select(func.count()).select_from(ImportantDate))
    assert total == 1


async def test_mesmo_titulo_em_outro_dia_e_outra_data(db_session: AsyncSession) -> None:
    await add_important_date(db_session, "SISU", date(2027, 1, 20), None)

    assert await add_important_date(db_session, "SISU", date(2027, 1, 21), None)


async def test_listar_mostra_de_hoje_em_diante_na_ordem(
    db_session: AsyncSession,
) -> None:
    await add_important_date(db_session, "Depois", date(2026, 12, 8), None)
    await add_important_date(db_session, "Passou", date(2026, 11, 21), None)
    await add_important_date(db_session, "Hoje", date(2026, 11, 22), "detalhe")

    found = await list_important_dates(db_session, date(2026, 11, 22))

    assert [(item.title, item.details) for item in found] == [
        ("Hoje", "detalhe"),
        ("Depois", None),
    ]


def test_script_le_a_data_em_aaaa_mm_dd() -> None:
    assert iso_date("2026-11-08") == date(2026, 11, 8)
    assert format_day(date(2026, 11, 8)) == "08/11/2026"


@pytest.mark.parametrize("texto", ["08/11/2026", "2026-13-01", "amanhã"])
def test_script_recusa_data_fora_do_formato(texto: str) -> None:
    with pytest.raises(argparse.ArgumentTypeError):
        iso_date(texto)


def test_script_recusa_titulo_vazio() -> None:
    assert non_empty("  SISU ") == "SISU"
    with pytest.raises(argparse.ArgumentTypeError):
        non_empty("   ")
