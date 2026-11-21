"""cria itens da curadoria do file

Revision ID: 49c9c3b49682
Revises: a208f1e1d0c4
Create Date: 2026-11-19 00:46:04.001303

"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "49c9c3b49682"
down_revision: str | Sequence[str] | None = "a208f1e1d0c4"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Estes tipos enum já existem (vieram com girls, girl_topics e actions), então
# as tabelas novas apontam para eles em vez de criá-los de novo.
study_stage = postgresql.ENUM(
    "FUNDAMENTAL",
    "MEDIO",
    "TECNICO",
    "GRADUACAO",
    "FORMADA",
    name="studystage",
    create_type=False,
)
topic = postgresql.ENUM(
    "PROGRAMACAO",
    "ROBOTICA",
    "IA",
    "DADOS",
    "CIBERSEGURANCA",
    "JOGOS",
    "SITES",
    "DESIGN",
    name="topic",
    create_type=False,
)
action_format = postgresql.ENUM(
    "IN_PERSON", "ONLINE", name="actionformat", create_type=False
)


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "curated_items",
        sa.Column("slug", sa.String(), nullable=False),
        sa.Column(
            "kind", sa.Enum("ACTIVITY", "EVENT", name="itemkind"), nullable=False
        ),
        sa.Column(
            "type",
            sa.Enum(
                "VIDEO",
                "QUIZ",
                "ARTICLE",
                "TUTORIAL",
                "MINI_PROJECT",
                "COURSE",
                "PERSONAL_PROJECT",
                "COMMUNITY",
                "PLAYLIST",
                "GAME",
                "OLYMPIAD",
                "CLUB",
                "COHORT_COURSE",
                "HACKATHON",
                "INTERNSHIP",
                "OTHER",
                name="curatedtype",
            ),
            nullable=False,
        ),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("source", sa.String(), nullable=False),
        sa.Column("description", sa.String(), nullable=False),
        sa.Column("url", sa.String(), nullable=False),
        sa.Column(
            "effort_band",
            sa.Enum(
                "PRIMEIROS_PASSOS",
                "UMA_TARDE",
                "NO_MEU_RITMO",
                "ROLE_COM_A_GALERA",
                "GRANDE_DESAFIO",
                name="effortband",
            ),
            nullable=False,
        ),
        sa.Column(
            "level",
            sa.Enum("BEGINNER", "INTERMEDIATE", "ADVANCED", name="itemlevel"),
            nullable=False,
        ),
        sa.Column("format", action_format, nullable=False),
        sa.Column("city_ibge_code", sa.Integer(), nullable=True),
        sa.Column("min_age", sa.Integer(), nullable=True),
        sa.Column(
            "cost_cents", sa.Integer(), server_default=sa.text("0"), nullable=False
        ),
        sa.Column("duration", sa.String(), nullable=False),
        sa.Column("expires_on", sa.Date(), nullable=True),
        sa.Column(
            "active", sa.Boolean(), server_default=sa.text("true"), nullable=False
        ),
        sa.Column("starts_on", sa.Date(), nullable=True),
        sa.Column("ends_on", sa.Date(), nullable=True),
        sa.Column("registration_deadline", sa.Date(), nullable=True),
        sa.Column("prerequisites", sa.String(), nullable=True),
        sa.Column(
            "updated_at",
            sa.TIMESTAMP(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column(
            "created_at",
            sa.TIMESTAMP(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "format = 'ONLINE' OR city_ibge_code IS NOT NULL",
            name="ck_curated_items_in_person_has_city",
        ),
        sa.CheckConstraint(
            "kind = 'ACTIVITY' OR (starts_on IS NOT NULL AND ends_on IS NOT NULL)",
            name="ck_curated_items_event_has_dates",
        ),
        sa.CheckConstraint(
            "kind = 'EVENT' OR (starts_on IS NULL AND ends_on IS NULL"
            " AND registration_deadline IS NULL AND prerequisites IS NULL)",
            name="ck_curated_items_activity_has_no_event_fields",
        ),
        sa.CheckConstraint(
            "ends_on >= starts_on", name="ck_curated_items_ends_after_start"
        ),
        sa.CheckConstraint(
            "url LIKE 'https://%'", name="ck_curated_items_url_is_https"
        ),
        sa.CheckConstraint(
            "cost_cents >= 0", name="ck_curated_items_cost_not_negative"
        ),
        sa.CheckConstraint(
            "min_age >= 0", name="ck_curated_items_min_age_not_negative"
        ),
        sa.ForeignKeyConstraint(["city_ibge_code"], ["cities.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("slug"),
    )
    op.create_table(
        "curated_item_audiences",
        sa.Column("curated_item_id", sa.Integer(), nullable=False),
        sa.Column("stage", study_stage, nullable=False),
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column(
            "created_at",
            sa.TIMESTAMP(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["curated_item_id"], ["curated_items.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("curated_item_id", "stage"),
    )
    op.create_index(
        op.f("ix_curated_item_audiences_curated_item_id"),
        "curated_item_audiences",
        ["curated_item_id"],
        unique=False,
    )
    op.create_table(
        "curated_item_topics",
        sa.Column("curated_item_id", sa.Integer(), nullable=False),
        sa.Column("topic", topic, nullable=False),
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column(
            "created_at",
            sa.TIMESTAMP(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["curated_item_id"], ["curated_items.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("curated_item_id", "topic"),
    )
    op.create_index(
        op.f("ix_curated_item_topics_curated_item_id"),
        "curated_item_topics",
        ["curated_item_id"],
        unique=False,
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(
        op.f("ix_curated_item_topics_curated_item_id"),
        table_name="curated_item_topics",
    )
    op.drop_table("curated_item_topics")
    op.drop_index(
        op.f("ix_curated_item_audiences_curated_item_id"),
        table_name="curated_item_audiences",
    )
    op.drop_table("curated_item_audiences")
    op.drop_table("curated_items")
    # O drop_table não apaga os tipos enum do Postgres; sem isto, subir de novo
    # falha. Só os criados aqui: topic, studystage e actionformat são de antes.
    for enum_name in ("itemkind", "curatedtype", "effortband", "itemlevel"):
        sa.Enum(name=enum_name).drop(op.get_bind(), checkfirst=True)
