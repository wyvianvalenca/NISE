"""Regras do modelo de dados central (#48) que vivem no próprio banco.

Os testes leem os metadados das tabelas, sem conectar no Postgres. A migração
foi conferida contra um Postgres de verdade (upgrade, check e downgrade).
"""

from sqlalchemy import CheckConstraint, Table, UniqueConstraint

from app.db.base import Base
from app.modules.actions.models import Action  # noqa: F401 (registra as tabelas)
from app.modules.girls.models import Girl, StudyStage, Topic  # noqa: F401
from app.modules.groups.models import Group  # noqa: F401

TABLES = Base.metadata.tables


def _unique_column_sets(table: Table) -> set[tuple[str, ...]]:
    return {
        tuple(column.name for column in constraint.columns)
        for constraint in table.constraints
        if isinstance(constraint, UniqueConstraint)
    }


def test_girl_email_is_unique_so_lists_from_two_groups_share_one_record() -> None:
    # RF-F2.01: o e-mail reconhece a mesma menina em listas de grupos diferentes.
    assert TABLES["girls"].c.email.unique


def test_imported_girl_has_no_account_until_she_signs_up() -> None:
    # RN-27 e RF-F2.02: a importação não cria conta; a conta liga depois, uma só.
    assert TABLES["girls"].c.user_id.nullable
    assert ("user_id",) in _unique_column_sets(TABLES["girls"])


def test_profile_fields_are_optional_for_imported_girls() -> None:
    columns = TABLES["girls"].c
    for name in ("birth_date", "city_ibge_code", "origin_group_id", "study_stage"):
        assert columns[name].nullable, name
    assert not columns.all_topics.nullable


def test_participation_is_unique_per_girl_and_action() -> None:
    # RF-F1.08: importar a mesma lista de novo não duplica a inscrição.
    assert ("girl_id", "action_id") in _unique_column_sets(TABLES["participations"])


def test_girl_topic_is_not_repeated() -> None:
    assert ("girl_id", "topic") in _unique_column_sets(TABLES["girl_topics"])


def test_coordinator_is_linked_once_per_group() -> None:
    assert ("group_id", "user_id") in _unique_column_sets(TABLES["group_coordinators"])


def test_action_always_belongs_to_a_group() -> None:
    # RN-14: cada ação pertence a um único grupo.
    assert not TABLES["actions"].c.group_id.nullable


def test_action_checks_exist() -> None:
    names = {
        constraint.name
        for constraint in TABLES["actions"].constraints
        if isinstance(constraint, CheckConstraint)
    }
    assert names == {
        "ck_actions_ends_after_start",
        "ck_actions_in_person_has_city",
        "ck_actions_open_has_registration_url",
    }


def test_topic_and_stage_codes_match_the_front() -> None:
    # Mesmos códigos de frontend/lib/signup.ts; se um mudar, o outro tem que mudar.
    assert {topic.value for topic in Topic} == {
        "programacao",
        "robotica",
        "ia",
        "dados",
        "ciberseguranca",
        "jogos",
        "sites",
        "design",
    }
    assert {stage.value for stage in StudyStage} == {
        "fundamental",
        "medio",
        "tecnico",
        "graduacao",
        "formada",
    }
