"""Filé da menina (#79): o estado de cada item. Dados fictícios."""

from datetime import UTC, datetime

import pytest
from sqlalchemy import UniqueConstraint

from app.db.base import Base
from app.modules.catalog.models import ItemOrigin
from app.modules.girl_file.models import (
    IN_FILE,
    DismissReason,
    FileStatus,
    SimilarChoice,
)
from app.modules.girl_file.service import entry_item_id, new_entry

TABLE = Base.metadata.tables["file_entries"]


def test_guarda_todos_os_estados_do_file() -> None:
    # Quero fazer, em andamento, concluído, inscrita, ver depois, não é pra mim
    # e o "Não deu" de um evento (#190).
    assert {status.value for status in FileStatus} == {
        "next",
        "in_progress",
        "concluded",
        "signed_up",
        "later",
        "dismissed",
        "did_not_go",
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


def test_sugestoes_parecidas_sao_as_que_o_front_manda() -> None:
    # Os mesmos de SIMILAR_OPTIONS em frontend/lib/atividade-feedback.ts (#80).
    assert [choice.value for choice in SimilarChoice] == [
        "mais-avancado",
        "mesmo-nivel",
        "outro-tema",
        "por-enquanto-nao",
    ]


def test_avaliacao_e_parecidas_so_numa_atividade_concluida() -> None:
    # Nota de 1 a 5, e as duas respostas só no concluído (RF-F10.09).
    checks = {
        getattr(constraint, "name", None): str(getattr(constraint, "sqltext", ""))
        for constraint in TABLE.constraints
    }

    assert checks["ck_file_entries_rating_from_1_to_5"] == "rating BETWEEN 1 AND 5"
    assert checks["ck_file_entries_feedback_only_when_concluded"] == (
        "status = 'CONCLUDED' OR (rating IS NULL AND similar_choice IS NULL)"
    )


def test_dia_da_conclusao_so_numa_atividade_concluida() -> None:
    # "Marcar como concluída" guarda o dia (#119); nas outras seções fica vazio.
    checks = {
        getattr(constraint, "name", None): str(getattr(constraint, "sqltext", ""))
        for constraint in TABLE.constraints
    }

    assert checks["ck_file_entries_concluded_on_only_when_concluded"] == (
        "status = 'CONCLUDED' OR concluded_on IS NULL"
    )


# --- Quando o item entrou no filé (RF-F5.31, D-93) -----------------------------


@pytest.mark.parametrize("status", IN_FILE)
def test_criar_ja_no_file_guarda_quando_entrou(status: FileStatus) -> None:
    entry = new_entry(3, ItemOrigin.GROUP_ACTION, 7, status)

    assert entry.filed_at is not None


@pytest.mark.parametrize("status", [FileStatus.LATER, FileStatus.DISMISSED])
def test_ver_depois_e_nao_e_pra_mim_nao_entraram_no_file(status: FileStatus) -> None:
    entry = new_entry(3, ItemOrigin.CURATED, 12, status)

    assert entry.filed_at is None


def test_sair_do_ver_depois_para_o_file_guarda_quando_entrou() -> None:
    entry = new_entry(3, ItemOrigin.CURATED, 12, FileStatus.LATER)
    antes = datetime.now(UTC)

    entry.status = FileStatus.NEXT

    assert entry.filed_at is not None
    assert antes <= entry.filed_at <= datetime.now(UTC)


def test_andar_dentro_do_file_ou_sair_e_voltar_nao_muda_a_data() -> None:
    # Próxima, em andamento, concluída: o item é o mesmo. O "Não deu" e o
    # "Desfazer" dele também não fazem dele um item novo.
    entrou = datetime(2026, 1, 10, tzinfo=UTC)
    entry = new_entry(3, ItemOrigin.GROUP_ACTION, 7, FileStatus.SIGNED_UP)
    entry.filed_at = entrou

    for status in (
        FileStatus.DID_NOT_GO,
        FileStatus.SIGNED_UP,
        FileStatus.CONCLUDED,
    ):
        entry.status = status
        assert entry.filed_at == entrou


def test_o_banco_exige_a_data_de_quem_esta_no_file() -> None:
    checks = {
        getattr(constraint, "name", None): str(getattr(constraint, "sqltext", ""))
        for constraint in TABLE.constraints
    }

    assert checks["ck_file_entries_filed_at_when_in_file"] == (
        "status NOT IN ('NEXT', 'IN_PROGRESS', 'CONCLUDED', 'SIGNED_UP')"
        " OR filed_at IS NOT NULL"
    )


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
    assert "ck_file_entries_reminder_only_when_signed_up" in constraints
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
        "rating",
        "similar_choice",
        "concluded_on",
        "reminder",
        "reminder_sent_for",
        "filed_at",
    }
