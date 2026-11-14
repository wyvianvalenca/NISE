"""Regras dos aceites e da preferência de oportunidades que vivem no banco (#49).

Os testes leem os metadados das tabelas, sem conectar no Postgres. O trigger que
recusa UPDATE, DELETE e TRUNCATE em terms_acceptances fica na migração
765de25fc85a e foi conferido contra um Postgres de verdade.
"""

from sqlalchemy import DefaultClause, UniqueConstraint

from app.db.base import Base
from app.modules.consents.models import TermsAcceptance  # noqa: F401
from app.users.models import User  # noqa: F401

TABLES = Base.metadata.tables


def test_aceite_guarda_menina_versao_e_data() -> None:
    # RF-F7.05: cada aceite com data, hora e versão do termo.
    columns = TABLES["terms_acceptances"].c
    for name in ("user_id", "terms_version", "created_at"):
        assert not columns[name].nullable, name


def test_aceite_nao_tem_updated_at() -> None:
    # RNF-F7.01: um aceite nunca é editado, então não há data de edição.
    assert "updated_at" not in TABLES["terms_acceptances"].c


def test_aceite_da_mesma_versao_nao_se_repete() -> None:
    unique_sets = {
        tuple(column.name for column in constraint.columns)
        for constraint in TABLES["terms_acceptances"].constraints
        if isinstance(constraint, UniqueConstraint)
    }
    assert ("user_id", "terms_version") in unique_sets


def test_conta_com_aceite_nao_pode_ser_apagada() -> None:
    # Se a conta fosse apagada, o aceite iria junto. A exclusão (RF-F7.09)
    # anonimiza a usuária em vez de apagar a linha.
    (foreign_key,) = TABLES["terms_acceptances"].c.user_id.foreign_keys
    assert foreign_key.column.table.name == "users"
    assert foreign_key.ondelete == "RESTRICT"


def test_oportunidades_por_email_comeca_desligado() -> None:
    # RF-F7.06: desligado até ela dizer que quer.
    column = TABLES["users"].c.opportunity_emails
    assert not column.nullable
    assert isinstance(column.server_default, DefaultClause)
    assert str(column.server_default.arg) == "false"
    assert TABLES["users"].c.opportunity_emails_changed_at.nullable
