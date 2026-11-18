"""Regras das respostas das meninas e da presença que vivem no banco (#149).

Os testes leem os metadados das tabelas, sem conectar no Postgres. A migração
6b42559424b2 foi conferida contra um Postgres de verdade (upgrade, check,
downgrade e as restrições abaixo com dados fictícios).
"""

from sqlalchemy import CheckConstraint, UniqueConstraint

from app.db.base import Base
from app.modules.actions.models import Participation  # noqa: F401
from app.modules.answers.models import Answer, AnswerStage  # noqa: F401

TABLES = Base.metadata.tables


def test_presenca_comeca_vazia() -> None:
    # Ninguém está presente até a coordenadora registrar a presença (F3).
    assert TABLES["participations"].c.attended_at.nullable


def test_resposta_liga_menina_acao_e_etapa() -> None:
    # RF-F4.07: a resposta fica ligada à menina, à ação e à etapa.
    columns = TABLES["answers"].c
    for name in ("girl_id", "action_id", "stage", "created_at"):
        assert not columns[name].nullable, name


def test_comentario_e_opcional() -> None:
    # RF-F4.03a: o comentário é opcional.
    assert TABLES["answers"].c.comment.nullable


def test_resposta_nao_tem_updated_at() -> None:
    # Uma resposta não é editada.
    assert "updated_at" not in TABLES["answers"].c


def test_segunda_resposta_da_mesma_etapa_e_recusada_pelo_banco() -> None:
    unique_sets = {
        tuple(column.name for column in constraint.columns)
        for constraint in TABLES["answers"].constraints
        if isinstance(constraint, UniqueConstraint)
    }
    assert ("girl_id", "action_id", "stage") in unique_sets


def test_nota_vai_de_1_a_5_e_e_obrigatoria_na_avaliacao() -> None:
    names = {
        constraint.name
        for constraint in TABLES["answers"].constraints
        if isinstance(constraint, CheckConstraint)
    }
    assert names == {"ck_answers_score_1_to_5", "ck_answers_rating_has_score"}


def test_respostas_somem_com_a_menina_e_com_a_acao() -> None:
    for column in ("girl_id", "action_id"):
        (foreign_key,) = TABLES["answers"].c[column].foreign_keys
        assert foreign_key.ondelete == "CASCADE", column


def test_etapas_sao_avaliacao_3_e_6_meses() -> None:
    # RF-F4.07: avaliação, 3 meses e 6 meses.
    assert {stage.value for stage in AnswerStage} == {
        "rating",
        "three_months",
        "six_months",
    }
