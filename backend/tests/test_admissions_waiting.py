"""K06 Ingressantes · meninas com indício sem resposta (C8, #318).

Sessão falsa, como nos outros testes do back; a consulta também foi conferida
contra um Postgres de verdade, como descrito no PR. Cada teste diz o critério
de aceite que cobre.
"""

from collections.abc import Sequence
from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock

from sqlalchemy.dialects import postgresql

from app.auth.utils import create_access_token
from app.main import app
from app.modules.admissions.service import list_waiting_girls
from app.users.models import Role, User
from tests.helpers import chamar_rota

URL = "/api/coordinator/enrollments"
AGORA = datetime(2026, 10, 20, 12, 0, tzinfo=UTC)


def sessao(
    total_esperando: int, esperando: Sequence[tuple[int, str]] = ()
) -> AsyncMock:
    # scalar: quantas meninas esperam. execute: as que cabem na página.
    sessao_falsa = AsyncMock()
    sessao_falsa.scalar.return_value = total_esperando
    resultado = MagicMock()
    resultado.tuples.return_value.all.return_value = list(esperando)
    sessao_falsa.execute.return_value = resultado
    return sessao_falsa


def sql(chamada: object) -> str:
    return str(
        chamada.compile(  # type: ignore[attr-defined]
            dialect=postgresql.dialect(),  # type: ignore[no-untyped-call]
            compile_kwargs={"literal_binds": True},
        )
    )


# --- A rota -------------------------------------------------------------------


def katia() -> User:
    return User(
        id=1, email="katia@exemplo.com", name="Katia Ficticia", role=Role.COORDINATOR
    )


def sessao_da_rota(
    esperando: Sequence[tuple[int, str]], total: int = 0, total_esperando: int = 0
) -> AsyncMock:
    sessao_falsa = AsyncMock()
    sessao_falsa.get.return_value = katia()
    sessao_falsa.scalars.return_value = MagicMock(all=MagicMock(return_value=[5]))
    sessao_falsa.scalar.side_effect = [total, total_esperando]
    da_pagina = MagicMock()
    da_pagina.tuples.return_value.all.return_value = []
    das_que_esperam = MagicMock()
    das_que_esperam.tuples.return_value.all.return_value = list(esperando)
    sessao_falsa.execute.side_effect = [da_pagina, das_que_esperam]
    return sessao_falsa


async def test_a_menina_esperando_vem_so_com_o_nome_curto() -> None:
    # Critério: "Maria F." e mais nada dela; curso e instituição o back nem lê,
    # então a tela mostra "—" (RN-21).
    esperando = [(8, "Maria Ficticia")]

    response = await chamar_rota(
        app,
        "GET",
        URL,
        sessao_da_rota(esperando, total_esperando=1),
        create_access_token(1),
    )

    assert response.status_code == 200
    assert response.json()["waiting"] == [{"girlName": "Maria F."}]
    assert response.json()["waitingTotal"] == 1


async def test_ela_nao_entra_na_contagem_da_lista() -> None:
    # Critério: não conta no número de "Quem ingressou".
    response = await chamar_rota(
        app,
        "GET",
        URL,
        sessao_da_rota([(8, "Maria Ficticia")], total=0, total_esperando=1),
        create_access_token(1),
    )

    assert response.json()["total"] == 0
    assert response.json()["items"] == []


async def test_o_grupo_dela_vem_da_sessao() -> None:
    # Critério (RNF-G.03): só a coordenadora do grupo da menina vê a linha.
    sessao_falsa = sessao_da_rota([(8, "Maria Ficticia")], total_esperando=1)

    await chamar_rota(
        app, "GET", f"{URL}?group_id=6", sessao_falsa, create_access_token(1)
    )

    consulta = sql(sessao_falsa.execute.call_args_list[1].args[0])
    assert "actions.group_id = 5" in consulta
    assert "group_id = 6" not in consulta


# --- Depois de todas as que ingressaram, em páginas de 15 ---------------------


async def test_vem_depois_das_que_ingressaram_na_mesma_pagina() -> None:
    # Critério: depois de todas as que ingressaram. Com 3 delas na página, sobra
    # lugar para 12 das que esperam, a partir da primeira.
    sessao_falsa = sessao(2, [(8, "Maria Ficticia"), (9, "Joana Ficticia")])

    linhas, total = await list_waiting_girls(
        sessao_falsa, 5, page=1, entered_total=3, entered_shown=3, now=AGORA
    )

    assert total == 2
    assert len(linhas) == 2
    consulta = sql(sessao_falsa.execute.call_args.args[0])
    assert "LIMIT 12 OFFSET 0" in consulta


async def test_pagina_cheia_de_ingressantes_nao_traz_as_que_esperam() -> None:
    # 15 ingressantes enchem a página 1: a linha vai para a próxima página, mas
    # o total (o chip) continua certo.
    sessao_falsa = sessao(1, [(8, "Maria Ficticia")])

    linhas, total = await list_waiting_girls(
        sessao_falsa, 5, page=1, entered_total=15, entered_shown=15, now=AGORA
    )

    assert (list(linhas), total) == ([], 1)
    sessao_falsa.execute.assert_not_awaited()


async def test_na_ultima_pagina_ela_e_a_ultima_linha() -> None:
    # 17 ingressantes: a página 2 tem 2 delas, e sobra lugar para as que esperam,
    # a partir da primeira.
    sessao_falsa = sessao(1, [(8, "Maria Ficticia")])

    linhas, _ = await list_waiting_girls(
        sessao_falsa, 5, page=2, entered_total=17, entered_shown=2, now=AGORA
    )

    assert len(linhas) == 1
    assert "LIMIT 13 OFFSET 0" in sql(sessao_falsa.execute.call_args.args[0])


async def test_as_que_esperam_continuam_de_onde_a_pagina_anterior_parou() -> None:
    # 14 ingressantes e 3 esperando: a página 1 leva 1 delas, e a 2 as outras 2.
    sessao_falsa = sessao(3, [(9, "Joana Ficticia"), (10, "Lara Ficticia")])

    await list_waiting_girls(
        sessao_falsa, 5, page=2, entered_total=14, entered_shown=0, now=AGORA
    )

    assert "LIMIT 15 OFFSET 1" in sql(sessao_falsa.execute.call_args.args[0])


async def test_ordem_de_quem_espera_ha_mais_tempo_primeiro_e_o_id_desempata() -> None:
    sessao_falsa = sessao(2, [(8, "Maria Ficticia")])

    await list_waiting_girls(
        sessao_falsa, 5, page=1, entered_total=0, entered_shown=0, now=AGORA
    )

    consulta = sql(sessao_falsa.execute.call_args.args[0])
    assert "ORDER BY anon_1.waiting_since, girls.id" in consulta


async def test_sem_ninguem_esperando_nao_consulta_as_linhas() -> None:
    sessao_falsa = sessao(0)

    linhas, total = await list_waiting_girls(
        sessao_falsa, 5, page=1, entered_total=3, entered_shown=3, now=AGORA
    )

    assert (list(linhas), total) == ([], 0)
    sessao_falsa.execute.assert_not_awaited()


# --- Quem aparece e o que a consulta lê ---------------------------------------


async def test_so_indicio_sem_resposta_e_dentro_do_prazo() -> None:
    # Critério: a linha some quando ela responde ("Sou eu" preenche answered_at;
    # "Não sou eu" apaga o indício) ou quando passa o prazo de 30 dias
    # (RF-F31.06). Uma menina com mais de um indício é uma linha só.
    sessao_falsa = sessao(1, [(8, "Maria Ficticia")])

    await list_waiting_girls(
        sessao_falsa, 5, page=1, entered_total=0, entered_shown=0, now=AGORA
    )

    consulta = sql(sessao_falsa.scalar.call_args.args[0])
    assert "list_matches.answered_at IS NULL" in consulta
    assert "list_matches.expires_at > '2026-10-20 12:00:00+00:00'" in consulta
    assert "GROUP BY list_matches.girl_id" in consulta


async def test_so_meninas_do_grupo_com_conta_e_presenca() -> None:
    # Critério (RNF-G.03, RN-01): outro grupo e quem chegou sozinha ficam fora.
    sessao_falsa = sessao(1, [(8, "Maria Ficticia")])

    await list_waiting_girls(
        sessao_falsa, 5, page=1, entered_total=0, entered_shown=0, now=AGORA
    )

    consulta = sql(sessao_falsa.execute.call_args.args[0])
    assert "girls.user_id IS NOT NULL" in consulta
    assert "girls.origin_group_id IS NOT NULL" in consulta
    assert "participations.attended_at IS NOT NULL" in consulta
    assert "actions.group_id = 5" in consulta


async def test_a_consulta_nunca_le_lista_curso_nem_instituicao_do_indicio() -> None:
    # Critério: a coordenadora nunca vê em que lista, curso ou instituição a
    # menina foi achada (RN-21, RNF-F31.02).
    sessao_falsa = sessao(1, [(8, "Maria Ficticia")])

    await list_waiting_girls(
        sessao_falsa, 5, page=1, entered_total=0, entered_shown=0, now=AGORA
    )

    for chamada in (sessao_falsa.scalar.call_args, sessao_falsa.execute.call_args):
        consulta = sql(chamada.args[0])
        for coluna in ("course", "level", "official_list", "institution", "call"):
            assert coluna not in consulta
