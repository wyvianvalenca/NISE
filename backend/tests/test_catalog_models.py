"""Regras das tabelas da curadoria que ficam no próprio banco (#79).

Como em test_actions_models.py, os testes leem os metadados das tabelas, sem
Postgres. A migração foi conferida num banco de verdade (upgrade, check e
downgrade).
"""

from sqlalchemy import CheckConstraint, Enum, Table, UniqueConstraint

from app.db.base import Base

# Importar o model registra as tabelas da curadoria nos metadados.
from app.modules.catalog.models import CuratedItem  # noqa: F401
from app.modules.girls.models import StudyStage, Topic

TABLES = Base.metadata.tables


def _check_names(table: Table) -> set[str]:
    return {
        str(constraint.name)
        for constraint in table.constraints
        if isinstance(constraint, CheckConstraint)
    }


def _unique_column_sets(table: Table) -> set[tuple[str, ...]]:
    return {
        tuple(column.name for column in constraint.columns)
        for constraint in table.constraints
        if isinstance(constraint, UniqueConstraint)
    }


def test_temas_do_item_sao_os_temas_do_perfil() -> None:
    # A mesma lista (e o mesmo tipo enum no Postgres) de girl_topics (#56).
    item_type = TABLES["curated_item_topics"].c.topic.type
    girl_type = TABLES["girl_topics"].c.topic.type

    assert isinstance(item_type, Enum) and isinstance(girl_type, Enum)
    assert item_type.enum_class is Topic
    assert item_type.name == girl_type.name


def test_publico_aceita_so_as_etapas_de_estudo() -> None:
    column_type = TABLES["curated_item_audiences"].c.stage.type

    assert isinstance(column_type, Enum)
    assert column_type.enum_class is StudyStage


def test_cada_tema_e_cada_etapa_no_maximo_uma_vez_por_item() -> None:
    assert ("curated_item_id", "topic") in _unique_column_sets(
        TABLES["curated_item_topics"]
    )
    assert ("curated_item_id", "stage") in _unique_column_sets(
        TABLES["curated_item_audiences"]
    )


def test_slug_e_unico_para_a_carga_nao_duplicar() -> None:
    assert ("slug",) in _unique_column_sets(TABLES["curated_items"])


def test_restricoes_do_item() -> None:
    assert _check_names(TABLES["curated_items"]) >= {
        "ck_curated_items_in_person_has_city",
        "ck_curated_items_event_has_dates",
        "ck_curated_items_activity_has_no_event_fields",
        "ck_curated_items_ends_after_start",
        "ck_curated_items_url_is_https",
        "ck_curated_items_cost_not_negative",
        "ck_curated_items_min_age_not_negative",
    }


def test_item_nasce_ativo_e_gratis() -> None:
    columns = TABLES["curated_items"].c

    assert columns.active.server_default is not None
    assert columns.cost_cents.server_default is not None
    assert columns.active.nullable is False
    assert columns.expires_on.nullable is True
