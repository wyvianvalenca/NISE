"""Ingresso, aprovação e indício de lista oficial (#270).

Como os outros testes do back, estes não conectam no Postgres: leem os
metadados das tabelas ou o SQL que a função mandou para uma sessão falsa. A
migração e as funções foram conferidas contra um Postgres de verdade (upgrade,
check, downgrade e um roteiro com dados fictícios), como descrito no PR.
"""

from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, MagicMock

import pytest
from sqlalchemy import Table, UniqueConstraint

from app.db.base import Base
from app.modules.actions.models import Action  # noqa: F401 (registra as tabelas)
from app.modules.admissions.exceptions import MatchForbiddenError
from app.modules.admissions.models import (
    AdmissionOrigin,
    CourseLevel,
    DismissedMatch,
    ListMatch,
    OfficialList,
)
from app.modules.admissions.service import (
    MATCH_DAYS,
    create_match,
    delete_expired_matches,
    dismiss_match,
    girl_has_open_match,
    match_flag_for_coordinator,
    open_matches_of_girl,
)
from app.modules.cities.models import City  # noqa: F401
from app.modules.girls.models import Girl  # noqa: F401
from app.modules.groups.models import Group  # noqa: F401
from app.users.models import Role, User

TABLES = Base.metadata.tables
AGORA = datetime(2026, 11, 18, 12, 0, tzinfo=UTC)
LISTA = OfficialList(
    id=7, institution="UFAL", selection_process="Sisu 2027", call="1ª chamada"
)


def _unique_column_sets(table: Table) -> set[tuple[str, ...]]:
    return {
        tuple(column.name for column in constraint.columns)
        for constraint in table.constraints
        if isinstance(constraint, UniqueConstraint)
    }


def _sql(sessao_falsa: AsyncMock, metodo: str = "scalar") -> str:
    statement = getattr(sessao_falsa, metodo).call_args.args[0]
    return str(statement.compile(compile_kwargs={"literal_binds": True}))


def _sessao(scalar: object = None, lista: list[object] | None = None) -> AsyncMock:
    sessao_falsa = AsyncMock()
    sessao_falsa.scalar.return_value = scalar
    sessao_falsa.scalars.return_value = MagicMock(
        all=MagicMock(return_value=lista or [])
    )
    # session.add é síncrono: com AsyncMock, viraria uma corrotina nunca aguardada.
    sessao_falsa.add = MagicMock()
    return sessao_falsa


# --- Tabelas -----------------------------------------------------------------


def test_lista_oficial_guarda_so_os_metadados_da_chamada() -> None:
    # RF-F31.05, RNF-F31.01, RN-23: nenhuma linha, nome, nota ou modalidade.
    assert set(TABLES["official_lists"].c.keys()) == {
        "id",
        "created_at",
        "institution",
        "selection_process",
        "call",
        "url",
    }
    assert ("institution", "selection_process", "call") in _unique_column_sets(
        TABLES["official_lists"]
    )


def test_indicio_nao_guarda_nenhum_dado_da_lista_alem_do_curso() -> None:
    assert set(TABLES["list_matches"].c.keys()) == {
        "id",
        "created_at",
        "girl_id",
        "official_list_id",
        "course",
        "level",
        "expires_at",
        "answered_at",
    }


def test_um_indicio_por_menina_e_chamada() -> None:
    for tabela in ("list_matches", "dismissed_matches", "approvals"):
        assert ("girl_id", "official_list_id") in _unique_column_sets(TABLES[tabela]), (
            tabela
        )


def test_marca_de_indicio_apagado_guarda_so_menina_e_chamada() -> None:
    # RF-F31.06: a marca não tem nenhum dado da lista.
    assert set(TABLES["dismissed_matches"].c.keys()) == {
        "id",
        "created_at",
        "girl_id",
        "official_list_id",
    }


def test_ingresso_tem_data_e_origem_obrigatorias() -> None:
    # RF-F6.03
    colunas = TABLES["enrollments"].c
    for nome in ("enrolled_on", "origin", "level", "course", "institution"):
        assert not colunas[nome].nullable, nome


def test_aprovacao_fica_separada_do_ingresso() -> None:
    # RN-22: aprovação não é ingresso.
    assert "approvals" in TABLES
    assert "enrolled_on" not in TABLES["approvals"].c


def test_codigos_de_nivel_e_origem() -> None:
    assert {nivel.value for nivel in CourseLevel} == {"tecnico", "graduacao"}
    assert {origem.value for origem in AdmissionOrigin} == {
        "self_declared",
        "official_list",
    }


# --- Criar indício -----------------------------------------------------------


async def test_cria_indicio_que_vence_em_30_dias() -> None:
    sessao_falsa = _sessao(scalar=False)

    indicio = await create_match(
        sessao_falsa, 3, LISTA, "Ciência da Computação", CourseLevel.GRADUACAO, AGORA
    )

    assert indicio is not None
    assert indicio.girl_id == 3
    assert indicio.official_list is LISTA
    assert indicio.expires_at == AGORA + timedelta(days=MATCH_DAYS)
    assert indicio.answered_at is None
    sessao_falsa.add.assert_called_once_with(indicio)


async def test_nao_cria_de_novo_o_indicio_da_mesma_chamada() -> None:
    # Já existe indício, marca, aprovação ou ingresso dessa chamada (RF-F31.06).
    sessao_falsa = _sessao(scalar=True)

    indicio = await create_match(
        sessao_falsa, 3, LISTA, "Ciência da Computação", CourseLevel.GRADUACAO, AGORA
    )

    assert indicio is None
    sessao_falsa.add.assert_not_called()


async def test_a_checagem_olha_indicio_marca_aprovacao_e_ingresso() -> None:
    sessao_falsa = _sessao(scalar=False)

    await create_match(sessao_falsa, 3, LISTA, "x", CourseLevel.GRADUACAO, AGORA)

    sql = _sql(sessao_falsa)
    for tabela in ("list_matches", "dismissed_matches", "approvals", "enrollments"):
        assert f"FROM {tabela}" in sql, tabela
    assert "official_list_id = 7" in sql


# --- Ler o indício -----------------------------------------------------------


async def test_menina_le_so_os_proprios_indicios_abertos() -> None:
    sessao_falsa = _sessao()

    await open_matches_of_girl(sessao_falsa, 3, AGORA)

    sql = _sql(sessao_falsa, "scalars")
    assert "list_matches.girl_id = 3" in sql
    assert "list_matches.answered_at IS NULL" in sql
    assert "list_matches.expires_at >" in sql


async def test_flag_diz_so_se_existe_indicio_aberto() -> None:
    sessao_falsa = _sessao(scalar=True)

    assert await girl_has_open_match(sessao_falsa, 3, AGORA) is True
    sql = _sql(sessao_falsa)
    assert sql.startswith("SELECT EXISTS")
    assert "list_matches.answered_at IS NULL" in sql


# --- O fato para a coordenadora (RF-F5.10) ----------------------------------


def _usuaria(papel: Role) -> User:
    return User(id=10, email="conta@exemplo.test", name="Conta", role=papel)


async def test_coordenadora_do_grupo_recebe_so_sim_ou_nao() -> None:
    # 1º scalar: ela coordena um grupo da menina; 2º: existe indício aberto.
    sessao_falsa = _sessao()
    sessao_falsa.scalar.side_effect = [True, True]

    resposta = await match_flag_for_coordinator(
        sessao_falsa, _usuaria(Role.COORDINATOR), 3, AGORA
    )

    assert resposta is True
    sessao_falsa.scalars.assert_not_called()


async def test_coordenadora_de_outro_grupo_nao_recebe_nada() -> None:
    sessao_falsa = _sessao(scalar=False)

    with pytest.raises(MatchForbiddenError):
        await match_flag_for_coordinator(
            sessao_falsa, _usuaria(Role.COORDINATOR), 3, AGORA
        )

    # Parou na permissão: nem chegou a perguntar pelo indício.
    assert sessao_falsa.scalar.await_count == 1
    sql = _sql(sessao_falsa)
    assert "group_coordinators.user_id = 10" in sql
    assert "girls.origin_group_id" in sql
    assert "participations.girl_id = 3" in sql


@pytest.mark.parametrize("papel", [Role.NISE_TEAM, Role.GIRL])
async def test_curadoria_e_menina_nao_recebem_o_fato(papel: Role) -> None:
    sessao_falsa = _sessao(scalar=True)

    with pytest.raises(MatchForbiddenError):
        await match_flag_for_coordinator(sessao_falsa, _usuaria(papel), 3, AGORA)

    sessao_falsa.scalar.assert_not_called()


# --- Apagar ------------------------------------------------------------------


async def test_apagar_deixa_so_a_marca_da_menina_e_da_chamada() -> None:
    sessao_falsa = _sessao()
    indicio = ListMatch(girl_id=3, official_list_id=7, course="x")

    await dismiss_match(sessao_falsa, indicio)

    marca = sessao_falsa.add.call_args.args[0]
    assert isinstance(marca, DismissedMatch)
    assert (marca.girl_id, marca.official_list_id) == (3, 7)
    sessao_falsa.delete.assert_awaited_once_with(indicio)


async def test_rotina_apaga_os_vencidos_sem_resposta() -> None:
    vencidos = [
        ListMatch(girl_id=3, official_list_id=7, course="x"),
        ListMatch(girl_id=4, official_list_id=7, course="x"),
    ]
    sessao_falsa = _sessao(lista=list(vencidos))

    apagados = await delete_expired_matches(sessao_falsa, AGORA)

    assert apagados == 2
    assert sessao_falsa.delete.await_count == 2
    assert sessao_falsa.add.call_count == 2
    sessao_falsa.commit.assert_awaited_once()
    sql = _sql(sessao_falsa, "scalars")
    assert "list_matches.answered_at IS NULL" in sql
    assert "list_matches.expires_at <=" in sql
