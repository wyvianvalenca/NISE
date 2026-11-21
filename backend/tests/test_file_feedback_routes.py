"""Avaliação da atividade concluída (A06·5, #123, RF-F10.09): a nota de 1 a 5 e
o pedido de sugestões parecidas, as duas opcionais.

As rotas rodam com uma sessão falsa. Os dados são fictícios.
"""

from unittest.mock import AsyncMock

import pytest
from fastapi.testclient import TestClient
from httpx2 import Response

from app.auth.utils import create_access_token
from app.main import app
from app.modules.catalog.models import (
    CuratedItem,
    CuratedType,
    ItemKind,
    ItemLevel,
)
from app.modules.girl_file.models import FileEntry, FileStatus, SimilarChoice
from app.modules.girls.models import EffortBand, Girl, Topic
from app.modules.suggestions.service import load_choices, rank
from app.users.models import Role, User
from tests.helpers import chamar_rota, sessao_com
from tests.test_discover_routes import FUTURO, curado, menina, usuaria
from tests.test_suggestions_service import item, perfil

ITEM = "curadoria-12"


def curso() -> CuratedItem:
    # Um curso intermediário de Programação.
    return curado(12, EffortBand.NO_MEU_RITMO, level=ItemLevel.INTERMEDIATE)


def linha(status: FileStatus = FileStatus.CONCLUDED, girl_id: int = 3) -> FileEntry:
    return FileEntry(id=40, girl_id=girl_id, curated_item_id=12, status=status)


def sessao_da_avaliacao(
    registro: Girl | None,
    linha: FileEntry | None = None,
    item: CuratedItem | None = None,
    usuario: User | None = None,
    aceite: int | None = 10,
) -> AsyncMock:
    sessao_falsa = sessao_com(usuario or usuaria())
    # session.scalar responde, em ordem: o aceite dos termos, o registro da
    # menina, a linha que ela tem no filé para esse item (ou None) e o item da
    # curadoria.
    sessao_falsa.scalar.side_effect = [aceite, registro, linha, item]
    return sessao_falsa


async def avaliar(
    sessao_falsa: AsyncMock,
    corpo: dict[str, object],
    item: str = ITEM,
    user_id: int = 1,
) -> Response:
    return await chamar_rota(
        app,
        "PUT",
        f"/api/file/{item}/feedback",
        sessao_falsa,
        token=create_access_token(user_id),
        corpo=corpo,
    )


# --- O que ela escolheu ---------------------------------------------------------


async def test_nota_e_sugestoes_parecidas_juntas() -> None:
    concluida = linha()
    sessao_falsa = sessao_da_avaliacao(menina(), concluida, curso())

    response = await avaliar(sessao_falsa, {"rating": 4, "similar": "mais-avancado"})

    assert response.status_code == 204
    assert concluida.rating == 4
    assert concluida.similar_choice is SimilarChoice.MAIS_AVANCADO
    sessao_falsa.commit.assert_awaited_once()


async def test_nota_sem_sugestoes_parecidas() -> None:
    concluida = linha()
    sessao_falsa = sessao_da_avaliacao(menina(), concluida, curso())

    response = await avaliar(sessao_falsa, {"rating": 2})

    assert response.status_code == 204
    assert concluida.rating == 2
    assert concluida.similar_choice is None
    sessao_falsa.commit.assert_awaited_once()


async def test_sugestoes_parecidas_sem_nota() -> None:
    concluida = linha()
    sessao_falsa = sessao_da_avaliacao(menina(), concluida, curso())

    response = await avaliar(sessao_falsa, {"rating": None, "similar": "outro-tema"})

    assert response.status_code == 204
    assert concluida.rating is None
    assert concluida.similar_choice is SimilarChoice.OUTRO_TEMA


@pytest.mark.parametrize("similar", [choice.value for choice in SimilarChoice])
async def test_aceita_as_quatro_opcoes_da_tela(similar: str) -> None:
    concluida = linha()
    sessao_falsa = sessao_da_avaliacao(menina(), concluida, curso())

    response = await avaliar(sessao_falsa, {"similar": similar})

    assert response.status_code == 204
    assert concluida.similar_choice is SimilarChoice(similar)


async def test_enviar_de_novo_troca_a_resposta_anterior() -> None:
    # A mesma linha nas duas vezes: continua uma resposta só por atividade.
    concluida = linha()
    concluida.rating = 5
    concluida.similar_choice = SimilarChoice.MAIS_AVANCADO
    sessao_falsa = sessao_da_avaliacao(menina(), concluida, curso())

    response = await avaliar(sessao_falsa, {"similar": "mesmo-nivel"})

    assert response.status_code == 204
    # A nota que não veio fica vazia: a resposta nova substitui a antiga inteira.
    assert concluida.rating is None
    assert concluida.similar_choice is SimilarChoice.MESMO_NIVEL
    sessao_falsa.add.assert_not_called()


@pytest.mark.parametrize(
    "corpo",
    [
        # "Pular" não chama a rota; uma chamada sem nada escolhido é recusada.
        {},
        {"rating": None, "similar": None},
        # Nota fora de 1 a 5.
        {"rating": 0},
        {"rating": 6},
        {"rating": 3.5},
        # A nota é um inteiro de verdade: texto, 3.0 e true não viram número.
        {"rating": "3"},
        {"rating": 3.0},
        {"rating": True},
        # Opção que não está na tela.
        {"similar": "qualquer-coisa"},
        # Campo que a tela não manda.
        {"rating": 4, "comentario": "oi"},
    ],
)
async def test_corpo_invalido_responde_422_e_nao_guarda_nada(
    corpo: dict[str, object],
) -> None:
    concluida = linha()
    sessao_falsa = sessao_da_avaliacao(menina(), concluida, curso())

    response = await avaliar(sessao_falsa, corpo)

    assert response.status_code == 422
    assert concluida.rating is None
    assert concluida.similar_choice is None
    sessao_falsa.commit.assert_not_called()


# --- Só numa atividade concluída do filé dela -----------------------------------


@pytest.mark.parametrize("status", [FileStatus.NEXT, FileStatus.IN_PROGRESS])
async def test_atividade_nao_concluida_e_recusada(status: FileStatus) -> None:
    escolha = linha(status)
    sessao_falsa = sessao_da_avaliacao(menina(), escolha, curso())

    response = await avaliar(sessao_falsa, {"rating": 5})

    assert response.status_code == 409
    assert response.json() == {"error": "activity_not_concluded"}
    assert escolha.rating is None
    sessao_falsa.commit.assert_not_called()


@pytest.mark.parametrize("status", [FileStatus.LATER, FileStatus.DISMISSED])
async def test_item_fora_do_file_responde_404(status: FileStatus) -> None:
    sessao_falsa = sessao_da_avaliacao(menina(), linha(status), curso())

    response = await avaliar(sessao_falsa, {"rating": 5})

    assert response.status_code == 404
    assert response.json() == {"error": "item_not_found"}
    sessao_falsa.commit.assert_not_called()


async def test_evento_nao_e_avaliado_aqui() -> None:
    # Um evento concluído não pede nota nesta tela (não está no Figma).
    evento = curado(
        12,
        EffortBand.GRANDE_DESAFIO,
        kind=ItemKind.EVENT,
        type=CuratedType.HACKATHON,
        starts_on=FUTURO,
        ends_on=FUTURO,
    )
    sessao_falsa = sessao_da_avaliacao(menina(), linha(), evento)

    response = await avaliar(sessao_falsa, {"rating": 5})

    assert response.status_code == 404
    assert response.json() == {"error": "item_not_found"}
    sessao_falsa.commit.assert_not_called()


@pytest.mark.parametrize(
    "item_id", ["acao-7", "12", "curadoria-abc", "curadoria-2147483648", "curadoria-03"]
)
async def test_acao_de_grupo_ou_id_invalido_responde_404(item_id: str) -> None:
    sessao_falsa = sessao_da_avaliacao(menina())

    response = await avaliar(sessao_falsa, {"rating": 5}, item=item_id)

    assert response.status_code == 404
    assert response.json() == {"error": "item_not_found"}
    sessao_falsa.commit.assert_not_called()


# --- As sugestões da próxima rodada (RF-F10.09, RF-F11.05) ------------------------


async def test_algo_mais_avancado_traz_programacao_mais_avancada_primeiro() -> None:
    # Ela concluiu um curso intermediário de Programação e pediu "Algo mais avançado".
    concluida = linha()
    sessao_falsa = sessao_da_avaliacao(menina(), concluida, curso())
    response = await avaliar(sessao_falsa, {"similar": "mais-avancado"})
    assert response.status_code == 204

    # A próxima rodada lê a linha que a rota acabou de gravar (#80).
    leitura = AsyncMock()
    leitura.scalars.side_effect = [[concluida], [curso()]]
    escolhas = await load_choices(leitura, 3)
    catalogo = [
        item(1, [Topic.PROGRAMACAO], level=ItemLevel.BEGINNER),
        item(2, [Topic.DADOS], level=ItemLevel.ADVANCED),
        item(3, [Topic.PROGRAMACAO], level=ItemLevel.ADVANCED),
    ]
    ordem = [
        sugestao.id
        for sugestao in rank(catalogo, perfil(Topic.PROGRAMACAO, Topic.DADOS), escolhas)
    ]

    assert ordem == ["curadoria-3", "curadoria-1", "curadoria-2"]


async def test_nota_alta_tambem_pesa_na_proxima_rodada() -> None:
    concluida = linha()
    sessao_falsa = sessao_da_avaliacao(menina(), concluida, curso())
    await avaliar(sessao_falsa, {"rating": 5})

    leitura = AsyncMock()
    leitura.scalars.side_effect = [[concluida], [curso()]]
    escolhas = await load_choices(leitura, 3)
    # Sem a nota, Dados viria antes, pela ordem do catálogo.
    catalogo = [
        item(1, [Topic.DADOS]),
        item(2, [Topic.PROGRAMACAO]),
    ]
    ordem = [
        sugestao.id
        for sugestao in rank(catalogo, perfil(Topic.PROGRAMACAO, Topic.DADOS), escolhas)
    ]

    assert ordem == ["curadoria-2", "curadoria-1"]


# --- Permissões (RNF-G.03) --------------------------------------------------------


async def test_nao_avalia_a_atividade_de_outra_menina() -> None:
    # Outra menina tem esse item concluído. A busca usa o id da menina da
    # sessão (girl_id 3), então não acha a linha da outra.
    sessao_falsa = sessao_da_avaliacao(
        menina(user_id=2), linha=None, usuario=usuaria(id=2)
    )

    response = await avaliar(sessao_falsa, {"rating": 5}, user_id=2)

    assert response.status_code == 404
    assert response.json() == {"error": "item_not_found"}
    busca_da_menina = sessao_falsa.scalar.await_args_list[1].args[0]
    assert busca_da_menina.compile().params == {"user_id_1": 2}
    busca_da_linha = sessao_falsa.scalar.await_args_list[2].args[0]
    assert busca_da_linha.compile().params == {
        "girl_id_1": 3,
        "curated_item_id_1": 12,
    }
    sessao_falsa.commit.assert_not_called()


async def test_conta_sem_registro_de_menina_responde_404() -> None:
    sessao_falsa = sessao_da_avaliacao(None)

    response = await avaliar(sessao_falsa, {"rating": 5})

    assert response.status_code == 404
    assert response.json() == {"error": "profile_not_found"}


async def test_sem_sessao_responde_401() -> None:
    sessao_falsa = sessao_da_avaliacao(menina(), linha(), curso())

    response = await chamar_rota(
        app, "PUT", f"/api/file/{ITEM}/feedback", sessao_falsa, corpo={"rating": 5}
    )

    assert response.status_code == 401
    sessao_falsa.commit.assert_not_called()


async def test_e_so_para_menina() -> None:
    sessao_falsa = sessao_da_avaliacao(
        menina(), linha(), curso(), usuario=usuaria(role=Role.COORDINATOR)
    )

    response = await avaliar(sessao_falsa, {"rating": 5})

    assert response.status_code == 403
    sessao_falsa.commit.assert_not_called()


async def test_exige_o_aceite_dos_termos() -> None:
    sessao_falsa = sessao_da_avaliacao(menina(), linha(), curso(), aceite=None)

    response = await avaliar(sessao_falsa, {"rating": 5})

    assert response.status_code == 403
    assert response.json() == {"error": "terms_not_accepted"}
    sessao_falsa.commit.assert_not_called()


# --- OpenAPI --------------------------------------------------------------------


def test_openapi_mostra_a_rota_da_avaliacao(client: TestClient) -> None:
    openapi = client.get("/openapi.json").json()

    rota = openapi["paths"]["/api/file/{item_id}/feedback"]["put"]
    corpo = rota["requestBody"]["content"]["application/json"]["schema"]
    assert corpo == {"$ref": "#/components/schemas/FeedbackIn"}
    assert set(rota["responses"]) >= {"204", "403", "404", "409", "422"}

    esquema = openapi["components"]["schemas"]["FeedbackIn"]["properties"]
    assert set(esquema) == {"rating", "similar"}
