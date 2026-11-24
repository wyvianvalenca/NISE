"""K06 Ingressantes · card "Busca nas listas de ingressantes" (C8, #317).

Sessão falsa, como nos outros testes do back. Cada teste diz o critério de
aceite que cobre.
"""

from datetime import UTC, date, datetime
from unittest.mock import AsyncMock

from sqlalchemy.dialects import postgresql

from app.auth.utils import create_access_token
from app.main import app
from app.modules.admissions.service import get_list_search
from app.modules.admissions.utils import add_months
from app.users.models import Role, User
from tests.helpers import chamar_rota

URL = "/api/coordinator/list-search"
# 10 de out de 2026, meio-dia em Maceió (UTC-3).
ULTIMA = datetime(2026, 10, 10, 15, 0, tzinfo=UTC)


def usuaria(role: Role = Role.COORDINATOR) -> User:
    return User(id=1, email="katia@exemplo.com", name="Katia Ficticia", role=role)


def sessao(user: User | None, ultima: datetime | None) -> AsyncMock:
    # get: a usuária da sessão. scalar: a data da última rodada (max).
    sessao_falsa = AsyncMock()
    sessao_falsa.get.return_value = user
    sessao_falsa.scalar.return_value = ultima
    return sessao_falsa


async def test_sem_login_responde_401() -> None:
    response = await chamar_rota(app, "GET", URL, sessao(None, ULTIMA))

    assert response.status_code == 401


async def test_menina_recebe_403() -> None:
    response = await chamar_rota(
        app, "GET", URL, sessao(usuaria(Role.GIRL), ULTIMA), create_access_token(1)
    )

    assert response.status_code == 403


async def test_fontes_e_datas_da_ultima_e_da_proxima_busca() -> None:
    # Critérios: o chip "UFAL" (sem IFAL, que depende da #274; sem UNEAL nem
    # SISU), a data da última busca e a da próxima.
    response = await chamar_rota(
        app, "GET", URL, sessao(usuaria(), ULTIMA), create_access_token(1)
    )

    assert response.status_code == 200
    assert response.json() == {
        "sources": ["UFAL"],
        "lastSearchAt": "2026-10-10T15:00:00Z",
        "nextSearchOn": "2027-01-10",
    }


async def test_a_resposta_so_tem_fontes_e_datas() -> None:
    # Critério: nenhum nome, número de achadas nem lista de quem foi achada
    # (RN-24, RN-21).
    response = await chamar_rota(
        app, "GET", URL, sessao(usuaria(), ULTIMA), create_access_token(1)
    )

    assert set(response.json()) == {"sources", "lastSearchAt", "nextSearchOn"}


async def test_sem_busca_ainda_as_datas_vao_como_null() -> None:
    # Pergunta aberta 2: a tela diz que ainda não houve busca.
    response = await chamar_rota(
        app, "GET", URL, sessao(usuaria(), None), create_access_token(1)
    )

    assert response.json() == {
        "sources": ["UFAL"],
        "lastSearchAt": None,
        "nextSearchOn": None,
    }


async def test_toda_coordenadora_ve_as_mesmas_datas() -> None:
    # Critério: a busca não é por grupo, então a consulta não filtra por grupo
    # nem por quem pede.
    sessao_falsa = sessao(usuaria(), ULTIMA)

    await get_list_search(sessao_falsa)

    statement = sessao_falsa.scalar.call_args.args[0]
    sql = str(statement.compile(dialect=postgresql.dialect()))  # type: ignore[no-untyped-call]
    assert "max(list_search_runs.created_at)" in sql
    assert "WHERE" not in sql
    sessao_falsa.scalars.assert_not_called()


async def test_a_data_da_ultima_busca_e_o_dia_em_maceio() -> None:
    # 11 de out à 01:00 UTC ainda é dia 10 em Maceió; a próxima conta daí.
    tarde = datetime(2026, 10, 11, 1, 0, tzinfo=UTC)

    resultado = await get_list_search(sessao(None, tarde))

    assert resultado.next_search_on == date(2027, 1, 10)


def test_somar_meses_fica_no_ultimo_dia_do_mes_curto() -> None:
    assert add_months(date(2026, 10, 10), 3) == date(2027, 1, 10)
    assert add_months(date(2026, 10, 31), 4) == date(2027, 2, 28)
    assert add_months(date(2027, 11, 30), 3) == date(2028, 2, 29)
    assert add_months(date(2026, 1, 15), 12) == date(2027, 1, 15)
