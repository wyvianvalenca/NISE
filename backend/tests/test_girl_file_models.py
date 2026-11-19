"""Filé da menina (#79): o estado de cada item. Dados fictícios."""

import pytest
from sqlalchemy import UniqueConstraint

from app.db.base import Base
from app.modules.catalog.models import ItemOrigin
from app.modules.girl_file.models import DismissReason, FileStatus
from app.modules.girl_file.service import entry_item_id, new_entry

TABLE = Base.metadata.tables["file_entries"]


def test_guarda_todos_os_estados_do_file() -> None:
    # Quero fazer, em andamento, concluído, inscrita, ver depois e não é pra mim.
    assert {status.value for status in FileStatus} == {
        "next",
        "in_progress",
        "concluded",
        "signed_up",
        "later",
        "dismissed",
    }


def test_motivos_sao_os_que_o_front_manda() -> None:
    # Os mesmos de REASONS em frontend/lib/sugestoes.ts, na mesma ordem.
    assert [reason.value for reason in DismissReason] == [
        "ja-conheco",
        "muito-dificil",
        "muito-facil",
        "nao-curto-o-tema",
        "sem-tempo-agora",
        "outro-motivo",
    ]


def test_item_da_curadoria_vai_na_coluna_da_curadoria() -> None:
    entry = new_entry(3, ItemOrigin.CURATED, 12, FileStatus.NEXT)

    assert entry.girl_id == 3
    assert entry.curated_item_id == 12
    assert entry.action_id is None
    assert entry.status is FileStatus.NEXT
    assert entry_item_id(entry) == "curadoria-12"


def test_acao_vai_na_coluna_da_acao() -> None:
    entry = new_entry(3, ItemOrigin.GROUP_ACTION, 7, FileStatus.SIGNED_UP)

    assert entry.action_id == 7
    assert entry.curated_item_id is None
    assert entry_item_id(entry) == "acao-7"


def test_nao_e_pra_mim_guarda_o_motivo() -> None:
    entry = new_entry(
        3,
        ItemOrigin.CURATED,
        12,
        FileStatus.DISMISSED,
        DismissReason.MUITO_DIFICIL,
    )

    assert entry.dismiss_reason is DismissReason.MUITO_DIFICIL


def test_nao_e_pra_mim_sem_motivo_tambem_vale() -> None:
    entry = new_entry(3, ItemOrigin.CURATED, 12, FileStatus.DISMISSED)

    assert entry.dismiss_reason is None


def test_motivo_fora_do_nao_e_pra_mim_e_recusado() -> None:
    with pytest.raises(ValueError):
        new_entry(3, ItemOrigin.CURATED, 12, FileStatus.LATER, DismissReason.JA_CONHECO)


def test_restricoes_do_banco() -> None:
    # Uma fonte só por linha, um item por menina e motivo só no "Não é pra mim".
    constraints = {
        getattr(constraint, "name", None) for constraint in TABLE.constraints
    }

    assert "ck_file_entries_one_source" in constraints
    assert "ck_file_entries_reason_only_when_dismissed" in constraints
    unique_columns = {
        tuple(column.name for column in constraint.columns)
        for constraint in TABLE.constraints
        if isinstance(constraint, UniqueConstraint)
    }
    assert ("girl_id", "curated_item_id") in unique_columns
    assert ("girl_id", "action_id") in unique_columns


def test_nenhum_dado_pessoal_nem_link_no_file() -> None:
    # RN-19: o filé guarda só o estado; o link é o do item, sem nada dela.
    colunas = set(TABLE.columns.keys())

    assert colunas == {
        "id",
        "created_at",
        "updated_at",
        "girl_id",
        "curated_item_id",
        "action_id",
        "status",
        "dismiss_reason",
    }
