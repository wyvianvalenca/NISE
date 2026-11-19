"""Sugestões de uma faixa (A06·2, #102): uma de cada vez, com o total do filé.

As rotas rodam com uma sessão falsa, que devolve uma base fixa de itens. Os
dados são fictícios; o código IBGE de Maceió é só um número.
"""

from unittest.mock import AsyncMock

import pytest
from fastapi.testclient import TestClient
from httpx2 import Response

from app.auth.utils import create_access_token
from app.main import app
from app.modules.actions.models import Action
from app.modules.catalog.models import (
    CuratedItem,
    CuratedItemTopic,
    CuratedType,
)
from app.modules.girl_file.models import FileEntry, FileStatus
from app.modules.girls.models import EffortBand, Girl, Topic
from app.users.models import Role, User
from tests.helpers import chamar_rota, sessao_com
from tests.test_discover_routes import MACEIO, acao, curado, menina, usuaria


def sessao_da_faixa(
    registro: Girl | None,
    curados: list[CuratedItem] | None = None,
    acoes: list[tuple[Action, str]] | None = None,
    file: list[FileEntry] | None = None,
    itens_do_file: list[CuratedItem] | None = None,
    total: int = 0,
    usuario: User | None = None,
    aceite: int | None = 10,
) -> AsyncMock:
    sessao_falsa = sessao_com(usuario or usuaria())
    # session.scalar responde, em ordem: o aceite dos termos, o registro da
    # menina (com os temas) e o total do filé.
    sessao_falsa.scalar.side_effect = [aceite, registro, total]
    # session.scalars: os itens da curadoria, as linhas do filé e os itens delas.
    sessao_falsa.scalars.side_effect = [
        curados or [],
        file or [],
        itens_do_file or [],
    ]
    # session.execute: as ações dos grupos, com o nome do grupo.
    sessao_falsa.execute.return_value = acoes or []
    return sessao_falsa


async def abrir(
    sessao_falsa: AsyncMock, faixa: str = "uma-tarde", user_id: int = 1
) -> Response:
    return await chamar_rota(
        app,
        "GET",
        f"/api/discover/{faixa}",
        sessao_falsa,
        token=create_access_token(user_id),
    )


def titulos(response: Response) -> list[str]:
    return [item["title"] for item in response.json()["items"]]


async def test_mostra_o_card_de_cada_sugestao_e_o_total_do_file() -> None:
    curso = curado(
        12,
        EffortBand.UMA_TARDE,
        title="Lógica de programação ficticia",
        source="Plataforma ficticia",
        type=CuratedType.COURSE,
        duration="~10 horas",
        cost_cents=0,
        min_age=13,
    )

    response = await abrir(sessao_da_faixa(menina(), curados=[curso], total=5))

    assert response.status_code == 200
    assert response.json() == {
        "band": "uma-tarde",
        "fileTotal": 5,
        "items": [
            {
                "id": "curadoria-12",
                "typeLabel": "Curso online",
                "title": "Lógica de programação ficticia",
                "source": "Plataforma ficticia",
                "format": "online",
                "duration": "~10 horas",
                "costCents": 0,
                "minAge": 13,
                "why": "você curtiu Programação",
            }
        ],
    }


async def test_so_as_sugestoes_da_faixa_aberta_na_ordem_das_regras() -> None:
    dois_temas = curado(3, EffortBand.UMA_TARDE, title="Programação e dados")
    dois_temas.topics.append(CuratedItemTopic(topic=Topic.DADOS))
    curados = [
        curado(1, EffortBand.UMA_TARDE, title="Só programação"),
        curado(2, EffortBand.PRIMEIROS_PASSOS, title="Outra faixa"),
        # Tem os dois temas dela: sobe para o topo (#80).
        dois_temas,
        curado(4, EffortBand.UMA_TARDE, topic=Topic.ROBOTICA, title="Outro tema"),
    ]

    response = await abrir(
        sessao_da_faixa(menina(temas=[Topic.PROGRAMACAO, Topic.DADOS]), curados)
    )

    assert titulos(response) == ["Programação e dados", "Só programação"]


async def test_item_ja_escolhido_nao_volta() -> None:
    escolhido = curado(1, EffortBand.UMA_TARDE, title="Já escolhido")
    curados = [escolhido, curado(2, EffortBand.UMA_TARDE, title="Ainda não")]
    file = [FileEntry(girl_id=3, curated_item_id=1, status=FileStatus.DISMISSED)]

    response = await abrir(
        sessao_da_faixa(menina(), curados, file=file, itens_do_file=[escolhido])
    )

    assert titulos(response) == ["Ainda não"]


async def test_acao_do_grupo_vem_sem_custo_e_sem_idade_minima() -> None:
    response = await abrir(
        sessao_da_faixa(menina(), acoes=[acao(7, MACEIO)]), faixa="role-com-a-galera"
    )

    item = response.json()["items"][0]
    assert item["id"] == "acao-7"
    assert item["typeLabel"] == "Oficina"
    assert item["source"] == "Grupo Ficticio"
    assert item["format"] == "in_person"
    assert item["duration"] == "1 dia"
    # As ações não têm custo nem idade mínima: o card esconde os dois chips.
    assert item["costCents"] is None
    assert item["minAge"] is None


async def test_quem_pediu_de_tudo_tem_o_proprio_por_que() -> None:
    de_tudo = menina(temas=[Topic.ROBOTICA])
    de_tudo.all_topics = True

    response = await abrir(sessao_da_faixa(de_tudo, [curado(1, EffortBand.UMA_TARDE)]))

    assert response.json()["items"][0]["why"] == "você pediu pra ver de tudo"


async def test_faixa_sem_sugestoes_vem_vazia() -> None:
    response = await abrir(sessao_da_faixa(menina(), total=2), faixa="grande-desafio")

    assert response.status_code == 200
    assert response.json() == {
        "band": "grande-desafio",
        "fileTotal": 2,
        "items": [],
    }


async def test_le_so_o_registro_e_o_file_da_menina_da_sessao() -> None:
    sessao_falsa = sessao_da_faixa(menina(user_id=2), usuario=usuaria(id=2))

    response = await abrir(sessao_falsa, user_id=2)

    assert response.status_code == 200
    busca_da_menina = sessao_falsa.scalar.await_args_list[1].args[0]
    assert busca_da_menina.compile().params == {"user_id_1": 2}
    # O total conta só as linhas dela, e só o que entrou no filé.
    busca_do_total = sessao_falsa.scalar.await_args_list[2].args[0]
    params = busca_do_total.compile().params
    assert params["girl_id_1"] == 3
    assert set(params["status_1"]) == {
        FileStatus.NEXT,
        FileStatus.IN_PROGRESS,
        FileStatus.CONCLUDED,
        FileStatus.SIGNED_UP,
    }


@pytest.mark.parametrize("faixa", ["maratona", "last-band", "UMA-TARDE"])
async def test_faixa_fora_das_cinco_responde_422(faixa: str) -> None:
    response = await abrir(sessao_da_faixa(menina()), faixa=faixa)

    assert response.status_code == 422


async def test_conta_sem_registro_de_menina_responde_404() -> None:
    response = await abrir(sessao_da_faixa(None))

    assert response.status_code == 404
    assert response.json() == {"error": "profile_not_found"}


async def test_sem_sessao_responde_401() -> None:
    response = await chamar_rota(
        app, "GET", "/api/discover/uma-tarde", sessao_da_faixa(menina())
    )

    assert response.status_code == 401


async def test_e_so_para_menina() -> None:
    sessao_falsa = sessao_da_faixa(menina(), usuario=usuaria(role=Role.COORDINATOR))

    response = await abrir(sessao_falsa)

    assert response.status_code == 403


async def test_exige_o_aceite_dos_termos() -> None:
    response = await abrir(sessao_da_faixa(menina(), aceite=None))

    assert response.status_code == 403
    assert response.json() == {"error": "terms_not_accepted"}


def test_openapi_mostra_a_rota_da_faixa(client: TestClient) -> None:
    openapi = client.get("/openapi.json").json()

    assert "get" in openapi["paths"]["/api/discover/{band}"]
    schemas = openapi["components"]["schemas"]
    assert list(schemas["BandSuggestionsOut"]["properties"]) == [
        "band",
        "fileTotal",
        "items",
    ]
    assert list(schemas["SuggestionCardOut"]["properties"]) == [
        "id",
        "typeLabel",
        "title",
        "source",
        "format",
        "duration",
        "costCents",
        "minAge",
        "why",
    ]
