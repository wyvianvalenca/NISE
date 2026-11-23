"""Rules of the action tables that live in the database itself (#208).

Like test_core_models.py, these read the table metadata without a Postgres.
The migration was written by hand, so it is the part to check against a real
database (upgrade, check and downgrade).
"""

from sqlalchemy import CheckConstraint, Enum, Table, UniqueConstraint

from app.db.base import Base
from app.modules.actions.models import Action, ActionAudience, ActionTopic
from app.modules.girls.models import StudyStage, Topic

TABLES = Base.metadata.tables


def _unique_column_sets(table: Table) -> set[tuple[str, ...]]:
    return {
        tuple(column.name for column in constraint.columns)
        for constraint in table.constraints
        if isinstance(constraint, UniqueConstraint)
    }


def test_tags_only_accept_the_eight_topics() -> None:
    column_type = TABLES["action_topics"].c.topic.type

    assert isinstance(column_type, Enum)
    assert column_type.enum_class is Topic
    assert len(column_type.enums) == 8


def test_audience_only_accepts_the_study_stages() -> None:
    column_type = TABLES["action_audiences"].c.stage.type

    assert isinstance(column_type, Enum)
    assert column_type.enum_class is StudyStage


def test_an_action_has_each_tag_and_each_stage_at_most_once() -> None:
    assert ("action_id", "topic") in _unique_column_sets(TABLES["action_topics"])
    assert ("action_id", "stage") in _unique_column_sets(TABLES["action_audiences"])


def test_tags_and_audience_go_away_with_their_action() -> None:
    for name in ("action_topics", "action_audiences"):
        (foreign_key,) = TABLES[name].c.action_id.foreign_keys
        assert foreign_key.ondelete == "CASCADE", name


def test_the_action_relationships_cascade_to_the_new_tables() -> None:
    assert Action.audiences.property.mapper.class_ is ActionAudience
    assert Action.topics.property.mapper.class_ is ActionTopic
    assert "delete-orphan" in Action.topics.property.cascade


def test_description_is_limited_to_300_characters_in_the_database() -> None:
    checks = {
        constraint.name: str(constraint.sqltext)
        for constraint in TABLES["actions"].constraints
        if isinstance(constraint, CheckConstraint)
    }

    assert checks["ck_actions_description_max_length"] == (
        "char_length(description) <= 300"
    )


def test_optional_fields_are_optional_and_registrations_start_open() -> None:
    columns = TABLES["actions"].c
    for name in (
        "starts_at_time",
        "ends_at_time",
        "address",
        "description",
        "attendance_registered_at",
    ):
        assert columns[name].nullable, name

    assert not columns.registrations_open.nullable
    assert str(columns.registrations_open.server_default.arg) == "true"  # type: ignore[union-attr]


def test_the_status_is_computed_not_stored() -> None:
    assert "status" not in TABLES["actions"].c
