"""Rotas do questionário de acompanhamento (#293).

O serviço é trocado por respostas prontas: aqui só importa o que cada rota
devolve e o que ela recusa antes de chegar ao serviço. A lógica das rodadas e
a resposta única estão em test_followup_db.py e test_followup_rounds.py.
Dados fictícios.
"""

from datetime import date
from unittest.mock import AsyncMock

import pytest
from httpx2 import Response

from app.auth.utils import create_access_token
from app.main import app
from app.modules.followup import routes
from app.modules.followup.models import FollowupRound
from app.modules.followup.schemas import CurrentFollowupOut
from app.modules.followup.service import FollowupResult
from app.users.models import Role, User
from tests.helpers import chamar_rota, sessao_com


def bia(role: Role = Role.GIRL) -> User:
    return User(id=1, email="bia@exemplo.test", name="Bia Fictícia", role=role)


def sessao(usuaria: User, aceite: int | None = 10) -> AsyncMock:
    # session.scalar procura o aceite dos termos (o id dele, ou None).
    sessao_falsa = sessao_com(usuaria)
    sessao_falsa.scalar.return_value = aceite
    return sessao_falsa


@pytest.fixture
def servico(monkeypatch: pytest.MonkeyPatch) -> dict[str, AsyncMock]:
    falsos = {
        "get_current_followup": AsyncMock(return_value=None),
        "record_followup": AsyncMock(return_value=FollowupResult.SAVED),
    }
    for nome, falso in falsos.items():
        monkeypatch.setattr(routes, nome, falso)
    return falsos


# --- GET /api/followup/current ------------------------------------------------


async def test_rodada_aberta_vem_em_camel_case(servico: dict[str, AsyncMock]) -> None:
    servico["get_current_followup"].return_value = CurrentFollowupOut(
        round=FollowupRound.THREE_MONTHS,
        last_day=date(2026, 5, 14),
        first_name="Bia",
        answered=False,
    )

    response = await chamar_rota(
        app, "GET", "/api/followup/current", sessao(bia()), token=create_access_token(1)
    )

    assert response.status_code == 200
    assert response.json() == {
        "round": "three_months",
        "lastDay": "2026-05-14",
        "firstName": "Bia",
        "answered": False,
    }


async def test_sem_rodada_aberta_vem_null(servico: dict[str, AsyncMock]) -> None:
    response = await chamar_rota(
        app, "GET", "/api/followup/current", sessao(bia()), token=create_access_token(1)
    )

    assert response.status_code == 200
    assert response.json() is None


async def test_sem_sessao_recebe_401(servico: dict[str, AsyncMock]) -> None:
    response = await chamar_rota(app, "GET", "/api/followup/current", sessao(bia()))

    assert response.status_code == 401


async def test_coordenadora_nao_tem_questionario(
    servico: dict[str, AsyncMock],
) -> None:
    # Ela só vê o próprio questionário; ninguém vê o de outra (D-61).
    response = await chamar_rota(
        app,
        "GET",
        "/api/followup/current",
        sessao(bia(Role.COORDINATOR)),
        token=create_access_token(1),
    )

    assert response.status_code == 403


async def test_sem_aceite_dos_termos_recebe_403(servico: dict[str, AsyncMock]) -> None:
    response = await chamar_rota(
        app,
        "GET",
        "/api/followup/current",
        sessao(bia(), aceite=None),
        token=create_access_token(1),
    )

    assert response.status_code == 403
    assert response.json() == {"error": "terms_not_accepted"}


# --- GET /api/followup/options ------------------------------------------------


async def test_opcoes_vem_na_ordem_do_figma() -> None:
    response = await chamar_rota(
        app, "GET", "/api/followup/options", sessao(bia()), token=create_access_token(1)
    )

    assert response.status_code == 200
    opcoes = response.json()
    assert [o["label"] for o in opcoes["computingViews"]] == [
        "Algo que quero seguir",
        "Gosto, mas não sei se quero seguir",
        "Já não me interessa tanto",
        "Não é pra mim",
    ]
    assert [o["label"] for o in opcoes["futureSelves"]] == [
        "Com certeza",
        "Talvez",
        "Acho que não",
    ]
    assert [o["label"] for o in opcoes["activities"]] == [
        "Fiz um curso online",
        "Fui a um evento ou oficina",
        "Estudei por conta própria",
        "Entrei num projeto ou grupo",
        "Nada disso ainda",
    ]
    assert [o["label"] for o in opcoes["helps"]] == [
        "Mentoria",
        "Cursos online",
        "Estágio",
        "Eventos e oficinas",
        "Outra coisa",
    ]
    assert [(o["code"], o["label"]) for o in opcoes["courseStatuses"]] == [
        ("tecnico", "Curso técnico"),
        ("graduacao", "Graduação"),
        ("trying", "Tô tentando entrar"),
        ("not_yet", "Ainda não"),
    ]
    assert [(o["code"], o["label"]) for o in opcoes["courses"]] == [
        ("sistemas_informacao", "Sistemas de Informação"),
        ("ciencia_computacao", "Ciência da Computação"),
        ("engenharia_computacao", "Engenharia de Computação"),
        ("redes", "Redes de computadores"),
        ("outro", "Outro curso"),
    ]


# --- POST /api/followup/answers -------------------------------------------------


async def enviar(corpo: dict[str, object]) -> Response:
    return await chamar_rota(
        app,
        "POST",
        "/api/followup/answers",
        sessao(bia()),
        token=create_access_token(1),
        corpo=corpo,
    )


async def test_envio_grava_e_responde_204(servico: dict[str, AsyncMock]) -> None:
    response = await enviar(
        {
            "round": "three_months",
            "computingView": "want_to_follow",
            "activities": ["event", "event"],
        }
    )

    assert response.status_code == 204
    chamada = servico["record_followup"].await_args
    assert chamada is not None
    dados = chamada.args[2]
    # A mesma escolha duas vezes vale como uma.
    assert [a.value for a in dados.activities] == ["event"]


async def test_rodada_fechada_responde_404(servico: dict[str, AsyncMock]) -> None:
    servico["record_followup"].return_value = FollowupResult.NO_OPEN_ROUND

    response = await enviar({"round": "three_months", "futureSelf": "maybe"})

    assert response.status_code == 404
    assert response.json() == {"error": "no_open_round"}


async def test_segunda_resposta_responde_409(servico: dict[str, AsyncMock]) -> None:
    servico["record_followup"].return_value = FollowupResult.ALREADY_ANSWERED

    response = await enviar({"round": "three_months", "futureSelf": "maybe"})

    assert response.status_code == 409
    assert response.json() == {"error": "already_answered"}


@pytest.mark.parametrize(
    "corpo",
    [
        # Nada respondido: "Agora não" é que não grava nada.
        {"round": "three_months"},
        {"round": "three_months", "comment": "   "},
        # "Nada disso ainda" não vem junto com outras escolhas.
        {"round": "three_months", "activities": ["none_yet", "event"]},
        # Códigos fora das listas.
        {"round": "three_months", "computingView": "talvez"},
        {"round": "dois_meses", "futureSelf": "maybe"},
        # Comentário maior que o campo da tela.
        {"round": "three_months", "comment": "a" * 501},
        # Pergunta 3: o nível pede o curso; "Outro curso" pede o nome.
        {"round": "three_months", "courseStatus": "graduacao"},
        {"round": "three_months", "courseStatus": "tecnico", "course": "outro"},
        {
            "round": "three_months",
            "courseStatus": "tecnico",
            "course": "outro",
            "otherCourse": "   ",
        },
        # O nome digitado só vale para "Outro curso".
        {
            "round": "three_months",
            "courseStatus": "tecnico",
            "course": "redes",
            "otherCourse": "Eletrônica",
        },
        {"round": "three_months", "courseStatus": "tecnico", "course": "matematica"},
        # "Tô tentando entrar" e "Ainda não" não levam dados de curso.
        {"round": "three_months", "courseStatus": "trying", "course": "redes"},
        {"round": "three_months", "courseStatus": "not_yet", "institution": "UFAL"},
        {"round": "three_months", "course": "redes"},
        # Textos maiores que os campos da tela.
        {
            "round": "three_months",
            "courseStatus": "tecnico",
            "course": "outro",
            "otherCourse": "a" * 121,
        },
        {
            "round": "three_months",
            "courseStatus": "tecnico",
            "course": "redes",
            "institution": "a" * 121,
        },
        # Campo desconhecido: a menina vem sempre da sessão, nunca do corpo.
        {"round": "three_months", "futureSelf": "maybe", "girlId": 1},
    ],
)
async def test_envio_invalido_e_recusado(
    servico: dict[str, AsyncMock], corpo: dict[str, object]
) -> None:
    response = await enviar(corpo)

    assert response.status_code == 422
    servico["record_followup"].assert_not_awaited()
