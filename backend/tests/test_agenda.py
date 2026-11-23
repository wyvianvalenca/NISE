"""As rotas da agenda (A14): "Pra responder" (#266, #295) e as datas (#295).

Os serviços são trocados por respostas prontas: aqui importa o que cada rota
devolve e quem ela deixa entrar. As consultas estão em test_agenda_db.py.
Dados fictícios.
"""

from datetime import date
from unittest.mock import AsyncMock

import pytest
from httpx2 import Response

from app.auth.utils import create_access_token
from app.main import app
from app.modules.agenda import routes
from app.modules.agenda.schemas import UpcomingItemOut
from app.modules.answers.schemas import PendingRatingOut
from app.modules.followup.models import FollowupRound
from app.modules.followup.schemas import CurrentFollowupOut
from app.modules.girls.models import Girl
from app.users.models import Role, User
from tests.helpers import chamar_rota

MARIA = User(id=1, email="maria@exemplo.test", name="Maria Fictícia", role=Role.GIRL)
GIRL = Girl(id=3, email="maria@exemplo.test", name="Maria Fictícia", user_id=1)

AVALIACAO = PendingRatingOut(
    action_id=7,
    action_name="Oficina de Python",
    group_name="Rendeiras",
    starts_on=date(2026, 3, 1),
    city_name=None,
)


def _sessao(usuaria: User, aceite: int | None = 10) -> AsyncMock:
    # get(User) para o login; scalar: 1º o aceite dos termos (o id, ou None),
    # 2º a menina da conta.
    sessao_falsa = AsyncMock()
    sessao_falsa.get.return_value = usuaria
    sessao_falsa.scalar.side_effect = [aceite, GIRL]
    return sessao_falsa


@pytest.fixture
def servico(monkeypatch: pytest.MonkeyPatch) -> dict[str, AsyncMock]:
    falsos = {
        "girl_has_open_match": AsyncMock(return_value=False),
        "list_pending_ratings": AsyncMock(return_value=[]),
        "get_current_followup": AsyncMock(return_value=None),
        "list_upcoming": AsyncMock(return_value=[]),
    }
    for nome, falso in falsos.items():
        monkeypatch.setattr(routes, nome, falso)
    return falsos


async def _get(url: str, sessao: AsyncMock) -> Response:
    return await chamar_rota(app, "GET", url, sessao, token=create_access_token(1))


# --- GET /api/agenda/to-answer -------------------------------------------------


async def test_sem_nada_pra_responder(servico: dict[str, AsyncMock]) -> None:
    response = await _get("/api/agenda/to-answer", _sessao(MARIA))

    assert response.status_code == 200
    assert response.json() == {
        "list_match": False,
        "ratings": [],
        "followup": None,
    }


async def test_avaliacoes_e_questionario_aberto_vem_em_camel_case(
    servico: dict[str, AsyncMock],
) -> None:
    servico["girl_has_open_match"].return_value = True
    servico["list_pending_ratings"].return_value = [AVALIACAO]
    servico["get_current_followup"].return_value = CurrentFollowupOut(
        round=FollowupRound.THREE_MONTHS,
        last_day=date(2026, 5, 14),
        first_name="Maria",
        answered=False,
    )

    response = await _get("/api/agenda/to-answer", _sessao(MARIA))

    assert response.json() == {
        "list_match": True,
        "ratings": [
            {
                "actionId": 7,
                "actionName": "Oficina de Python",
                "groupName": "Rendeiras",
                "startsOn": "2026-03-01",
                "cityName": None,
            }
        ],
        # Só a rodada e o último dia: nem o nome dela vai (RNF-F31.02).
        "followup": {"round": "three_months", "lastDay": "2026-05-14"},
    }
    servico["list_pending_ratings"].assert_awaited_once()
    assert servico["list_pending_ratings"].await_args_list[0].args[1] == 1  # user_id


async def test_questionario_respondido_sai_de_pra_responder(
    servico: dict[str, AsyncMock],
) -> None:
    # RN-39: respondeu, sai.
    servico["get_current_followup"].return_value = CurrentFollowupOut(
        round=FollowupRound.THREE_MONTHS,
        last_day=date(2026, 5, 14),
        first_name="Maria",
        answered=True,
    )

    response = await _get("/api/agenda/to-answer", _sessao(MARIA))

    assert response.json()["followup"] is None


async def test_questionario_fechado_nao_aparece(servico: dict[str, AsyncMock]) -> None:
    # RN-39: passados os 30 dias, get_current_followup devolve None.
    response = await _get("/api/agenda/to-answer", _sessao(MARIA))

    assert response.json()["followup"] is None


# --- GET /api/agenda/dates ------------------------------------------------------


async def test_datas_vem_em_camel_case(servico: dict[str, AsyncMock]) -> None:
    servico["list_upcoming"].return_value = [
        UpcomingItemOut(
            kind="date",
            on=date(2026, 12, 8),
            title="ENEM, 1º dia",
            details=None,
            round=None,
        ),
        UpcomingItemOut(
            kind="followup",
            on=date(2027, 1, 15),
            title=None,
            details=None,
            round=FollowupRound.TWELVE_MONTHS,
        ),
    ]

    response = await _get("/api/agenda/dates", _sessao(MARIA))

    assert response.status_code == 200
    assert response.json() == {
        "upcoming": [
            {
                "kind": "date",
                "on": "2026-12-08",
                "title": "ENEM, 1º dia",
                "details": None,
                "round": None,
            },
            {
                "kind": "followup",
                "on": "2027-01-15",
                "title": None,
                "details": None,
                "round": "twelve_months",
            },
        ]
    }
    # A consulta é da conta da sessão e de hoje em diante.
    args = servico["list_upcoming"].await_args_list[0].args
    assert args[1] == 1
    assert isinstance(args[2], date)


# --- quem entra ------------------------------------------------------------------


@pytest.mark.parametrize("url", ["/api/agenda/to-answer", "/api/agenda/dates"])
async def test_sem_o_aceite_da_versao_atual_dos_termos_da_403(
    url: str, servico: dict[str, AsyncMock]
) -> None:
    # Mesma regra da A19 (RN-20): nada sai antes do aceite.
    response = await _get(url, _sessao(MARIA, aceite=None))

    assert response.status_code == 403
    assert response.json() == {"error": "terms_not_accepted"}


@pytest.mark.parametrize("url", ["/api/agenda/to-answer", "/api/agenda/dates"])
@pytest.mark.parametrize("papel", [Role.COORDINATOR, Role.NISE_TEAM])
async def test_coordenadora_e_curadoria_nao_recebem_nada(
    url: str, papel: Role, servico: dict[str, AsyncMock]
) -> None:
    conta = User(id=2, email="conta@exemplo.test", name="Conta", role=papel)

    response = await chamar_rota(
        app, "GET", url, _sessao(conta), token=create_access_token(2)
    )

    assert response.status_code == 403
    for falso in servico.values():
        falso.assert_not_called()


@pytest.mark.parametrize("url", ["/api/agenda/to-answer", "/api/agenda/dates"])
async def test_sem_login_da_401(url: str, servico: dict[str, AsyncMock]) -> None:
    response = await chamar_rota(app, "GET", url, _sessao(MARIA))

    assert response.status_code == 401
