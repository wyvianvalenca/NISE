"""A escolha numa sugestão (A06·2, A06·2a, #102): "Quero fazer", "Talvez depois"
e "Não é pra mim" com o motivo opcional, e o novo total do filé.

As rotas rodam com uma sessão falsa. Os dados são fictícios; os códigos IBGE
de Maceió e Arapiraca são só números.
"""

from datetime import date
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi.testclient import TestClient
from httpx2 import Response

from app.auth.utils import create_access_token
from app.main import app
from app.modules.actions.models import Action, ActionFormat, ActionVisibility
from app.modules.catalog.models import CuratedItem, EffortBand
from app.modules.girl_file.models import (
    DismissReason,
    FileEntry,
    FileStatus,
    SimilarChoice,
)
from app.modules.girl_file.schemas import Choice
from app.modules.girl_file.service import CHOICE_STATUS, IN_FILE
from app.modules.girls.models import Girl
from app.users.models import Role, User
from tests.helpers import chamar_rota, sessao_com
from tests.test_discover_routes import ARAPIRACA, MACEIO, acao, curado, menina, usuaria

ITEM = "curadoria-12"


def item_visivel() -> CuratedItem:
    return curado(12, EffortBand.UMA_TARDE)


def sessao_da_escolha(
    registro: Girl | None,
    item: CuratedItem | Action | None = None,
    linha: FileEntry | None = None,
    total: int = 6,
    usuario: User | None = None,
    aceite: int | None = 10,
) -> AsyncMock:
    sessao_falsa = sessao_com(usuario or usuaria())
    # session.scalar responde, em ordem: o aceite dos termos, o registro da
    # menina, o item do catálogo, a linha que ela já tem no filé para esse item
    # (ou None) e o novo total do filé.
    sessao_falsa.scalar.side_effect = [aceite, registro, item, linha, total]
    # session.add é síncrono.
    sessao_falsa.add = MagicMock()
    return sessao_falsa


async def escolher(
    sessao_falsa: AsyncMock,
    corpo: dict[str, object],
    item: str = ITEM,
    user_id: int = 1,
) -> Response:
    return await chamar_rota(
        app,
        "PUT",
        f"/api/file/{item}",
        sessao_falsa,
        token=create_access_token(user_id),
        corpo=corpo,
    )


def linha_gravada(sessao_falsa: AsyncMock) -> FileEntry:
    gravada = sessao_falsa.add.call_args.args[0]
    assert isinstance(gravada, FileEntry)
    return gravada


# --- As três escolhas ---------------------------------------------------------


async def test_quero_fazer_poe_o_item_no_file_e_devolve_o_total() -> None:
    sessao_falsa = sessao_da_escolha(menina(), item_visivel(), total=6)

    response = await escolher(sessao_falsa, {"choice": "quero-fazer"})

    assert response.status_code == 200
    assert response.json() == {"fileTotal": 6}
    gravada = linha_gravada(sessao_falsa)
    assert gravada.girl_id == 3
    assert gravada.curated_item_id == 12
    assert gravada.action_id is None
    assert gravada.status is FileStatus.NEXT
    assert gravada.dismiss_reason is None
    sessao_falsa.commit.assert_awaited_once()


async def test_talvez_depois_vai_para_o_ver_depois() -> None:
    sessao_falsa = sessao_da_escolha(menina(), item_visivel(), total=5)

    response = await escolher(sessao_falsa, {"choice": "talvez-depois"})

    assert response.status_code == 200
    assert response.json() == {"fileTotal": 5}
    assert linha_gravada(sessao_falsa).status is FileStatus.LATER


async def test_nao_e_pra_mim_guarda_o_motivo() -> None:
    sessao_falsa = sessao_da_escolha(menina(), item_visivel(), total=5)

    response = await escolher(
        sessao_falsa, {"choice": "nao-e-pra-mim", "reason": "muito-dificil"}
    )

    assert response.status_code == 200
    gravada = linha_gravada(sessao_falsa)
    assert gravada.status is FileStatus.DISMISSED
    assert gravada.dismiss_reason is DismissReason.MUITO_DIFICIL


async def test_nao_e_pra_mim_sem_motivo_e_o_pular() -> None:
    sessao_falsa = sessao_da_escolha(menina(), item_visivel(), total=5)

    response = await escolher(sessao_falsa, {"choice": "nao-e-pra-mim"})

    assert response.status_code == 200
    gravada = linha_gravada(sessao_falsa)
    assert gravada.status is FileStatus.DISMISSED
    assert gravada.dismiss_reason is None


@pytest.mark.parametrize("motivo", list(DismissReason))
async def test_aceita_os_seis_motivos_da_lista(motivo: DismissReason) -> None:
    sessao_falsa = sessao_da_escolha(menina(), item_visivel())

    response = await escolher(
        sessao_falsa, {"choice": "nao-e-pra-mim", "reason": motivo.value}
    )

    assert response.status_code == 200
    assert linha_gravada(sessao_falsa).dismiss_reason is motivo


async def test_acao_de_grupo_vai_na_coluna_da_acao() -> None:
    oficina, _ = acao(7, MACEIO)
    sessao_falsa = sessao_da_escolha(menina(), oficina)

    response = await escolher(sessao_falsa, {"choice": "quero-fazer"}, item="acao-7")

    assert response.status_code == 200
    gravada = linha_gravada(sessao_falsa)
    assert gravada.action_id == 7
    assert gravada.curated_item_id is None


def test_cada_escolha_tem_o_seu_lugar_no_file() -> None:
    assert CHOICE_STATUS == {
        Choice.QUERO_FAZER: FileStatus.NEXT,
        Choice.TALVEZ_DEPOIS: FileStatus.LATER,
        Choice.NAO_E_PRA_MIM: FileStatus.DISMISSED,
    }
    # A pílula "Meu filé" não conta o "Ver depois" nem o "Não é pra mim".
    assert FileStatus.LATER not in IN_FILE
    assert FileStatus.DISMISSED not in IN_FILE


def test_escolhas_sao_as_que_o_front_manda() -> None:
    # Os mesmos de Choice em frontend/lib/sugestoes.ts.
    assert [choice.value for choice in Choice] == [
        "quero-fazer",
        "talvez-depois",
        "nao-e-pra-mim",
    ]


# --- Motivo e escolha inválidos -----------------------------------------------


@pytest.mark.parametrize(
    "corpo",
    [
        # Motivo fora da lista fechada da A06·2a.
        {"choice": "nao-e-pra-mim", "reason": "chato"},
        {"choice": "nao-e-pra-mim", "reason": "Muito difícil"},
        # Motivo só vale no "Não é pra mim".
        {"choice": "quero-fazer", "reason": "muito-dificil"},
        {"choice": "talvez-depois", "reason": "sem-tempo-agora"},
        # Escolha fora das três.
        {"choice": "talvez"},
        {"choice": None},
        {},
    ],
)
async def test_motivo_ou_escolha_fora_da_lista_e_recusado(
    corpo: dict[str, object],
) -> None:
    sessao_falsa = sessao_da_escolha(menina(), item_visivel())

    response = await escolher(sessao_falsa, corpo)

    assert response.status_code == 422
    sessao_falsa.add.assert_not_called()
    sessao_falsa.commit.assert_not_called()


# --- Escolher de novo ---------------------------------------------------------


async def test_escolher_de_novo_troca_a_escolha_sem_duplicar() -> None:
    linha = FileEntry(
        id=40,
        girl_id=3,
        curated_item_id=12,
        status=FileStatus.DISMISSED,
        dismiss_reason=DismissReason.SEM_TEMPO_AGORA,
    )
    sessao_falsa = sessao_da_escolha(menina(), item_visivel(), linha=linha, total=6)

    response = await escolher(sessao_falsa, {"choice": "quero-fazer"})

    assert response.status_code == 200
    assert response.json() == {"fileTotal": 6}
    # A mesma linha muda; nenhuma outra é criada.
    sessao_falsa.add.assert_not_called()
    assert linha.status is FileStatus.NEXT
    assert linha.dismiss_reason is None
    sessao_falsa.commit.assert_awaited_once()


async def test_trocar_uma_atividade_concluida_apaga_a_avaliacao() -> None:
    # A nota e as "sugestões parecidas" só valem no concluído (restrição do banco).
    linha = FileEntry(
        id=41,
        girl_id=3,
        curated_item_id=12,
        status=FileStatus.CONCLUDED,
        rating=5,
        similar_choice=SimilarChoice.MAIS_AVANCADO,
    )
    sessao_falsa = sessao_da_escolha(menina(), item_visivel(), linha=linha)

    response = await escolher(sessao_falsa, {"choice": "talvez-depois"})

    assert response.status_code == 200
    assert linha.status is FileStatus.LATER
    assert linha.rating is None
    assert linha.similar_choice is None


# --- Permissões (RNF-G.03) ----------------------------------------------------


async def test_mexe_so_na_linha_da_menina_da_sessao() -> None:
    # Outra menina (girl_id 9) já tem esse item no filé dela. A busca usa o id
    # da menina da sessão, então não acha a linha da outra e cria a dela.
    sessao_falsa = sessao_da_escolha(
        menina(user_id=2), item_visivel(), linha=None, usuario=usuaria(id=2)
    )

    response = await escolher(
        sessao_falsa,
        {"choice": "quero-fazer", "girlId": 9, "girl_id": 9},
        user_id=2,
    )

    assert response.status_code == 200
    busca_da_menina = sessao_falsa.scalar.await_args_list[1].args[0]
    assert busca_da_menina.compile().params == {"user_id_1": 2}
    busca_da_linha = sessao_falsa.scalar.await_args_list[3].args[0]
    assert busca_da_linha.compile().params == {
        "girl_id_1": 3,
        "curated_item_id_1": 12,
    }
    busca_do_total = sessao_falsa.scalar.await_args_list[4].args[0]
    assert busca_do_total.compile().params["girl_id_1"] == 3
    # O corpo com o id de outra menina é ignorado.
    assert linha_gravada(sessao_falsa).girl_id == 3


async def test_conta_sem_registro_de_menina_responde_404() -> None:
    sessao_falsa = sessao_da_escolha(None)

    response = await escolher(sessao_falsa, {"choice": "quero-fazer"})

    assert response.status_code == 404
    assert response.json() == {"error": "profile_not_found"}
    sessao_falsa.commit.assert_not_called()


async def test_sem_sessao_responde_401() -> None:
    sessao_falsa = sessao_da_escolha(menina(), item_visivel())

    response = await chamar_rota(
        app, "PUT", f"/api/file/{ITEM}", sessao_falsa, corpo={"choice": "quero-fazer"}
    )

    assert response.status_code == 401
    sessao_falsa.commit.assert_not_called()


async def test_e_so_para_menina() -> None:
    sessao_falsa = sessao_da_escolha(
        menina(), item_visivel(), usuario=usuaria(role=Role.COORDINATOR)
    )

    response = await escolher(sessao_falsa, {"choice": "quero-fazer"})

    assert response.status_code == 403
    sessao_falsa.commit.assert_not_called()


async def test_exige_o_aceite_dos_termos() -> None:
    sessao_falsa = sessao_da_escolha(menina(), item_visivel(), aceite=None)

    response = await escolher(sessao_falsa, {"choice": "quero-fazer"})

    assert response.status_code == 403
    assert response.json() == {"error": "terms_not_accepted"}
    sessao_falsa.commit.assert_not_called()


# --- Item que ela não poderia escolher ----------------------------------------


@pytest.mark.parametrize(
    "item", ["12", "curadoria-", "curadoria-abc", "evento-12", "curadoria-²"]
)
async def test_id_de_item_invalido_responde_404(item: str) -> None:
    sessao_falsa = sessao_da_escolha(menina(), item_visivel())

    response = await escolher(sessao_falsa, {"choice": "quero-fazer"}, item=item)

    assert response.status_code == 404
    assert response.json() == {"error": "item_not_found"}
    sessao_falsa.add.assert_not_called()
    sessao_falsa.commit.assert_not_called()


@pytest.mark.parametrize(
    "item",
    [
        None,  # não existe
        curado(12, EffortBand.UMA_TARDE, active=False),
        curado(12, EffortBand.UMA_TARDE, expires_on=date(2020, 1, 1)),
        # Presencial de outra cidade (RN-16).
        curado(
            12,
            EffortBand.UMA_TARDE,
            format=ActionFormat.IN_PERSON,
            city_ibge_code=ARAPIRACA,
        ),
    ],
)
async def test_item_da_curadoria_que_ela_nao_ve_responde_404(
    item: CuratedItem | None,
) -> None:
    sessao_falsa = sessao_da_escolha(menina(cidade=MACEIO), item)

    response = await escolher(sessao_falsa, {"choice": "quero-fazer"})

    assert response.status_code == 404
    assert response.json() == {"error": "item_not_found"}
    sessao_falsa.add.assert_not_called()
    sessao_falsa.commit.assert_not_called()


@pytest.mark.parametrize(
    "campos",
    [
        {"visibility": ActionVisibility.CLOSED, "registration_url": None},
        {"registrations_open": False},
        {"starts_on": date(2020, 3, 10), "ends_on": date(2020, 3, 10)},
    ],
)
async def test_acao_fechada_ou_passada_responde_404(campos: dict[str, object]) -> None:
    oficina, _ = acao(7, MACEIO, **campos)
    sessao_falsa = sessao_da_escolha(menina(), oficina)

    response = await escolher(sessao_falsa, {"choice": "quero-fazer"}, item="acao-7")

    assert response.status_code == 404
    assert response.json() == {"error": "item_not_found"}
    sessao_falsa.commit.assert_not_called()


# --- OpenAPI ------------------------------------------------------------------


def test_openapi_mostra_a_rota_da_escolha(client: TestClient) -> None:
    openapi = client.get("/openapi.json").json()

    assert "put" in openapi["paths"]["/api/file/{item_id}"]
    schemas = openapi["components"]["schemas"]
    assert schemas["Choice"]["enum"] == [
        "quero-fazer",
        "talvez-depois",
        "nao-e-pra-mim",
    ]
    assert schemas["DismissReason"]["enum"] == [
        "ja-conheco",
        "muito-dificil",
        "muito-facil",
        "nao-curto-o-tema",
        "sem-tempo-agora",
        "outro-motivo",
    ]
    assert list(schemas["ChoiceOut"]["properties"]) == ["fileTotal"]
