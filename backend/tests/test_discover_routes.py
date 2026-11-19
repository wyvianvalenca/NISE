"""Descobrir (A06·1, #86): as 5 faixas com as contagens e a última faixa aberta.

As rotas rodam com uma sessão falsa, que devolve uma base fixa de itens. Os
dados são fictícios; os códigos IBGE de Maceió e Arapiraca são só números.
"""

from datetime import date
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi.testclient import TestClient
from httpx2 import Response

from app.auth.utils import create_access_token
from app.main import app
from app.modules.actions.models import (
    Action,
    ActionFormat,
    ActionTopic,
    ActionType,
    ActionVisibility,
)
from app.modules.catalog.models import (
    CuratedItem,
    CuratedItemTopic,
    CuratedType,
    ItemKind,
    ItemLevel,
)
from app.modules.girl_file.models import FileEntry, FileStatus
from app.modules.girls.models import EffortBand, Girl, GirlTopic, StudyStage, Topic
from app.modules.suggestions.service import first_name
from app.users.models import Role, User
from tests.helpers import chamar_rota, sessao_com

MACEIO = 2704302
ARAPIRACA = 2700300

# Longe no futuro e no passado, para os testes não dependerem do dia de hoje.
FUTURO = date(2099, 3, 10)
PASSADO = date(2020, 3, 10)


def usuaria(id: int = 1, role: Role = Role.GIRL) -> User:
    return User(
        id=id, email=f"menina{id}@exemplo.com", name="Alana Ficticia", role=role
    )


def menina(
    cidade: int | None = MACEIO,
    temas: list[Topic] | None = None,
    user_id: int = 1,
    ultima: EffortBand | None = None,
) -> Girl:
    return Girl(
        id=3,
        email="alana@exemplo.com",
        name="Alana Ficticia Souza",
        user_id=user_id,
        birth_date=date(2010, 5, 20),
        city_ibge_code=cidade,
        study_stage=StudyStage.MEDIO,
        all_topics=False,
        last_band=ultima,
        topics=[GirlTopic(topic=tema) for tema in temas or [Topic.PROGRAMACAO]],
    )


def curado(
    id: int, band: EffortBand, topic: Topic = Topic.PROGRAMACAO, **campos: object
) -> CuratedItem:
    dados: dict[str, object] = {
        "id": id,
        "slug": f"item-ficticio-{id}",
        "kind": ItemKind.ACTIVITY,
        "type": CuratedType.COURSE,
        "title": f"Curso ficticio {id}",
        "source": "Plataforma ficticia",
        "description": "Um curso de exemplo.",
        "url": "https://exemplo.com/curso",
        "effort_band": band,
        "level": ItemLevel.BEGINNER,
        "format": ActionFormat.ONLINE,
        "city_ibge_code": None,
        "min_age": None,
        "cost_cents": 0,
        "duration": "~2 horas",
        "expires_on": None,
        "active": True,
        "topics": [CuratedItemTopic(topic=topic)],
        "audiences": [],
    }
    dados.update(campos)
    return CuratedItem(**dados)


def acao(id: int, cidade: int | None, **campos: object) -> tuple[Action, str]:
    """Uma ação de um dia ("Rolê com a galera"), aberta e futura, e o nome do grupo."""
    dados: dict[str, object] = {
        "id": id,
        "group_id": 1,
        "name": f"Oficina ficticia {id}",
        "type": ActionType.OFICINA,
        "starts_on": FUTURO,
        "ends_on": FUTURO,
        "format": ActionFormat.IN_PERSON if cidade else ActionFormat.ONLINE,
        "city_ibge_code": cidade,
        "visibility": ActionVisibility.OPEN,
        "registration_url": "https://forms.exemplo.com/inscricao",
        "registrations_open": True,
        "topics": [ActionTopic(topic=Topic.PROGRAMACAO)],
        "audiences": [],
    }
    dados.update(campos)
    return Action(**dados), "Grupo Ficticio"


def sessao_do_descobrir(
    registro: Girl | None,
    curados: list[CuratedItem] | None = None,
    acoes: list[tuple[Action, str]] | None = None,
    file: list[FileEntry] | None = None,
    itens_do_file: list[CuratedItem] | None = None,
    usuario: User | None = None,
    aceite: int | None = 10,
) -> AsyncMock:
    sessao_falsa = sessao_com(usuario or usuaria())
    # session.scalar responde, em ordem: o aceite dos termos e o registro da
    # menina (com os temas e a última faixa aberta).
    sessao_falsa.scalar.side_effect = [aceite, registro]
    # session.scalars: os itens da curadoria, as linhas do filé e os itens delas.
    sessao_falsa.scalars.side_effect = [
        curados or [],
        file or [],
        itens_do_file or [],
    ]
    # session.execute: as ações dos grupos, com o nome do grupo.
    sessao_falsa.execute.return_value = acoes or []
    return sessao_falsa


async def abrir(sessao_falsa: AsyncMock, user_id: int = 1) -> Response:
    return await chamar_rota(
        app,
        "GET",
        "/api/discover",
        sessao_falsa,
        token=create_access_token(user_id),
    )


def contagens(response: Response) -> dict[str, int]:
    return {band["code"]: band["count"] for band in response.json()["bands"]}


# --- GET /api/discover -------------------------------------------------------


async def test_cinco_faixas_na_ordem_com_nome_e_ultima_faixa() -> None:
    sessao_falsa = sessao_do_descobrir(
        menina(ultima=EffortBand.UMA_TARDE),
        curados=[
            curado(1, EffortBand.PRIMEIROS_PASSOS),
            curado(2, EffortBand.UMA_TARDE),
            curado(3, EffortBand.UMA_TARDE),
        ],
    )

    response = await abrir(sessao_falsa)

    assert response.status_code == 200
    assert response.json() == {
        "firstName": "Alana",
        "bands": [
            {"code": "primeiros-passos", "count": 1},
            {"code": "uma-tarde", "count": 2},
            # Faixa sem sugestões vem com 0.
            {"code": "no-meu-ritmo", "count": 0},
            {"code": "role-com-a-galera", "count": 0},
            {"code": "grande-desafio", "count": 0},
        ],
        "lastBand": "uma-tarde",
    }


async def test_sem_faixa_aberta_a_ultima_vem_vazia() -> None:
    response = await abrir(sessao_do_descobrir(menina()))

    assert response.status_code == 200
    assert response.json()["lastBand"] is None
    assert set(contagens(response).values()) == {0}


def acoes_das_duas_cidades() -> list[tuple[Action, str]]:
    return [
        acao(1, MACEIO),
        acao(2, MACEIO),
        acao(3, ARAPIRACA),
        # Online: aparece para todas.
        acao(4, None),
    ]


async def test_menina_de_maceio_conta_as_presenciais_de_maceio_e_nao_as_de_arapiraca() -> (
    None
):
    response = await abrir(
        sessao_do_descobrir(menina(cidade=MACEIO), acoes=acoes_das_duas_cidades())
    )

    # As duas de Maceió e a online.
    assert contagens(response)["role-com-a-galera"] == 3


async def test_menina_de_arapiraca_ve_outra_contagem() -> None:
    response = await abrir(
        sessao_do_descobrir(menina(cidade=ARAPIRACA), acoes=acoes_das_duas_cidades())
    )

    # A de Arapiraca e a online.
    assert contagens(response)["role-com-a-galera"] == 2


async def test_sem_cidade_so_conta_as_online() -> None:
    response = await abrir(
        sessao_do_descobrir(menina(cidade=None), acoes=acoes_das_duas_cidades())
    )

    assert contagens(response)["role-com-a-galera"] == 1


async def test_acao_fechada_passada_ou_sem_inscricoes_nao_conta() -> None:
    acoes = [
        acao(1, MACEIO),
        acao(2, MACEIO, visibility=ActionVisibility.CLOSED, registration_url=None),
        acao(3, MACEIO, starts_on=PASSADO, ends_on=PASSADO),
        acao(4, MACEIO, registrations_open=False),
        # Uma ação de mais dias é "Grande desafio".
        acao(5, MACEIO, ends_on=date(2099, 3, 12)),
    ]

    response = await abrir(sessao_do_descobrir(menina(), acoes=acoes))

    assert contagens(response)["role-com-a-galera"] == 1
    assert contagens(response)["grande-desafio"] == 1


async def test_item_vencido_ou_desativado_nao_conta() -> None:
    curados = [
        curado(1, EffortBand.NO_MEU_RITMO),
        curado(2, EffortBand.NO_MEU_RITMO, expires_on=PASSADO),
        curado(3, EffortBand.NO_MEU_RITMO, active=False),
    ]

    response = await abrir(sessao_do_descobrir(menina(), curados=curados))

    assert contagens(response)["no-meu-ritmo"] == 1


async def test_contagem_segue_temas_etapa_e_idade() -> None:
    curados = [
        curado(1, EffortBand.PRIMEIROS_PASSOS),
        # Tema que ela não escolheu.
        curado(2, EffortBand.PRIMEIROS_PASSOS, topic=Topic.ROBOTICA),
        # Idade mínima acima da dela (16 anos).
        curado(3, EffortBand.PRIMEIROS_PASSOS, min_age=18),
    ]

    response = await abrir(sessao_do_descobrir(menina(), curados=curados))

    assert contagens(response)["primeiros-passos"] == 1


async def test_item_que_ja_esta_no_file_nao_conta() -> None:
    no_file = curado(1, EffortBand.UMA_TARDE)
    curados = [no_file, curado(2, EffortBand.UMA_TARDE)]
    file = [FileEntry(girl_id=3, curated_item_id=1, status=FileStatus.LATER)]

    response = await abrir(
        sessao_do_descobrir(
            menina(), curados=curados, file=file, itens_do_file=[no_file]
        )
    )

    assert contagens(response)["uma-tarde"] == 1


async def test_le_so_o_registro_da_menina_da_sessao() -> None:
    sessao_falsa = sessao_do_descobrir(
        menina(user_id=2, ultima=EffortBand.GRANDE_DESAFIO), usuario=usuaria(id=2)
    )

    response = await abrir(sessao_falsa, user_id=2)

    assert response.status_code == 200
    # A busca do registro usa o id da sessão; a última faixa vem desse registro.
    busca_da_menina = sessao_falsa.scalar.await_args_list[1].args[0]
    assert busca_da_menina.compile().params == {"user_id_1": 2}
    assert response.json()["lastBand"] == "grande-desafio"


async def test_conta_sem_registro_de_menina_responde_404() -> None:
    response = await abrir(sessao_do_descobrir(None))

    assert response.status_code == 404
    assert response.json() == {"error": "profile_not_found"}


async def test_descobrir_sem_sessao_responde_401() -> None:
    response = await chamar_rota(
        app, "GET", "/api/discover", sessao_do_descobrir(menina())
    )

    assert response.status_code == 401


async def test_descobrir_e_so_para_menina() -> None:
    sessao_falsa = sessao_do_descobrir(menina(), usuario=usuaria(role=Role.COORDINATOR))

    response = await abrir(sessao_falsa)

    assert response.status_code == 403


async def test_descobrir_exige_o_aceite_dos_termos() -> None:
    response = await abrir(sessao_do_descobrir(menina(), aceite=None))

    assert response.status_code == 403
    assert response.json() == {"error": "terms_not_accepted"}


@pytest.mark.parametrize(
    ("nome", "esperado"),
    [
        ("Alana Ficticia", "Alana"),
        ("  Bia   Exemplo ", "Bia"),
        ("Clara", "Clara"),
        ("", ""),
    ],
)
def test_primeiro_nome(nome: str, esperado: str) -> None:
    assert first_name(nome) == esperado


# --- PUT /api/discover/last-band ---------------------------------------------


def sessao_da_gravacao(
    registro: Girl | None,
    usuario: User | None = None,
    aceite: int | None = 10,
) -> AsyncMock:
    # session.scalar responde, em ordem: o aceite dos termos e o registro da menina.
    sessao_falsa = sessao_com(usuario or usuaria())
    sessao_falsa.scalar.side_effect = [aceite, registro]
    # session.add é síncrono.
    sessao_falsa.add = MagicMock()
    return sessao_falsa


async def gravar(
    sessao_falsa: AsyncMock, corpo: dict[str, object], user_id: int = 1
) -> Response:
    return await chamar_rota(
        app,
        "PUT",
        "/api/discover/last-band",
        sessao_falsa,
        token=create_access_token(user_id),
        corpo=corpo,
    )


async def test_primeira_faixa_aberta_e_gravada() -> None:
    registro = menina()
    sessao_falsa = sessao_da_gravacao(registro)

    response = await gravar(sessao_falsa, {"band": "no-meu-ritmo"})

    assert response.status_code == 204
    assert registro.last_band is EffortBand.NO_MEU_RITMO
    sessao_falsa.commit.assert_awaited_once()


async def test_abrir_outra_faixa_troca_a_gravada() -> None:
    registro = menina(ultima=EffortBand.UMA_TARDE)
    sessao_falsa = sessao_da_gravacao(registro)

    response = await gravar(sessao_falsa, {"band": "grande-desafio"})

    assert response.status_code == 204
    assert registro.last_band is EffortBand.GRANDE_DESAFIO
    # Troca a faixa no registro dela, sem criar nada.
    sessao_falsa.add.assert_not_called()
    sessao_falsa.commit.assert_awaited_once()


async def test_grava_so_no_registro_da_menina_da_sessao() -> None:
    registro = menina(user_id=2)
    sessao_falsa = sessao_da_gravacao(registro, usuario=usuaria(id=2))

    # Um id de outra menina no corpo é ignorado: vale a sessão.
    response = await gravar(
        sessao_falsa, {"band": "uma-tarde", "girlId": 4, "girl_id": 4}, user_id=2
    )

    assert response.status_code == 204
    busca_da_menina = sessao_falsa.scalar.await_args_list[1].args[0]
    assert busca_da_menina.compile().params == {"user_id_1": 2}
    assert registro.last_band is EffortBand.UMA_TARDE


@pytest.mark.parametrize(
    "corpo",
    [{"band": "maratona"}, {"band": None}, {}],
)
async def test_faixa_fora_das_cinco_e_recusada(corpo: dict[str, object]) -> None:
    sessao_falsa = sessao_da_gravacao(menina())

    response = await gravar(sessao_falsa, corpo)

    assert response.status_code == 422
    sessao_falsa.commit.assert_not_called()


async def test_gravacao_sem_registro_de_menina_responde_404() -> None:
    sessao_falsa = sessao_da_gravacao(None)

    response = await gravar(sessao_falsa, {"band": "uma-tarde"})

    assert response.status_code == 404
    assert response.json() == {"error": "profile_not_found"}
    sessao_falsa.commit.assert_not_called()


async def test_gravacao_sem_sessao_responde_401() -> None:
    sessao_falsa = sessao_da_gravacao(menina())

    response = await chamar_rota(
        app,
        "PUT",
        "/api/discover/last-band",
        sessao_falsa,
        corpo={"band": "uma-tarde"},
    )

    assert response.status_code == 401
    sessao_falsa.commit.assert_not_called()


async def test_gravacao_e_so_para_menina() -> None:
    sessao_falsa = sessao_da_gravacao(menina(), usuario=usuaria(role=Role.COORDINATOR))

    response = await gravar(sessao_falsa, {"band": "uma-tarde"})

    assert response.status_code == 403
    sessao_falsa.commit.assert_not_called()


async def test_gravacao_exige_o_aceite_dos_termos() -> None:
    sessao_falsa = sessao_da_gravacao(menina(), aceite=None)

    response = await gravar(sessao_falsa, {"band": "uma-tarde"})

    assert response.status_code == 403
    assert response.json() == {"error": "terms_not_accepted"}
    sessao_falsa.commit.assert_not_called()


# --- OpenAPI -----------------------------------------------------------------


def test_openapi_mostra_as_rotas_do_descobrir(client: TestClient) -> None:
    openapi = client.get("/openapi.json").json()

    assert "get" in openapi["paths"]["/api/discover"]
    assert "put" in openapi["paths"]["/api/discover/last-band"]
    assert list(openapi["components"]["schemas"]["DiscoverOut"]["properties"]) == [
        "firstName",
        "bands",
        "lastBand",
    ]
    assert openapi["components"]["schemas"]["EffortBand"]["enum"] == [
        "primeiros-passos",
        "uma-tarde",
        "no-meu-ritmo",
        "role-com-a-galera",
        "grande-desafio",
    ]
