"""Modelos de exportação (F24, #379, RF-F24.10): cada um já marca pacotes.

Dados fictícios.
"""

from datetime import date

from app.modules.exports.service import (
    DEFAULT_PACKAGES,
    ExportModel,
    Package,
    cut_label,
    file_name,
    packages_of,
)


def test_cada_modelo_liga_os_pacotes_do_cartao() -> None:
    assert packages_of(ExportModel.ACCOUNTABILITY) == (Package.FUNNEL, Package.RATINGS)
    assert packages_of(ExportModel.PLANNING) == (Package.RATINGS, Package.INTEREST)
    assert set(packages_of(ExportModel.RESEARCH)) == set(Package) - {
        Package.OTHER_GROUPS
    }


def test_do_meu_jeito_comeca_sem_pacotes() -> None:
    """RF-F24.10: "Do meu jeito" começa sem pacotes; sem modelo, vale ele (D-104)."""
    assert packages_of(None) == packages_of(ExportModel.MY_WAY) == ()


def test_pesquisa_liga_o_padrao() -> None:
    assert packages_of(ExportModel.RESEARCH) == DEFAULT_PACKAGES


def test_nome_do_arquivo_leva_o_modelo() -> None:
    dia = date(2026, 10, 16)
    nome = file_name("Rendeiras", dia, ExportModel.ACCOUNTABILITY)
    assert nome == "rendeiras_prestacao-contas_2026-10-16.csv"
    assert file_name("Rendeiras", dia) == "rendeiras_do-meu-jeito_2026-10-16.csv"


def test_historico_escreve_o_nome_do_modelo() -> None:
    assert cut_label(None, None, "research") == "Pesquisa · todas as ações"
    assert cut_label({"year": 2026}, None, "my_way") == "Do meu jeito · 2026"
    # Exportação de antes dos modelos continua como era.
    assert cut_label({"year": 2026}, None) == "2026"
