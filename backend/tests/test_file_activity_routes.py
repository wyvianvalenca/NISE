"""Atividade do filé (A06·4a, #119): o detalhe, "Marcar como iniciada",
"Marcar como concluída" e "Tirar do filé".

As rotas rodam com uma sessão falsa. Os dados são fictícios.
"""

from datetime import date
from unittest.mock import AsyncMock

import pytest
from fastapi.testclient import TestClient
from httpx2 import Response

from app.auth.utils import create_access_token
from app.main import app
from app.modules.catalog.models import CuratedItem, CuratedType, ItemKind
from app.modules.girl_file.models import FileEntry, FileStatus
from app.modules.girls.models import EffortBand, Girl, Topic
from app.users.models import Role, User
from tests.helpers import chamar_rota, sessao_com
from tests.test_discover_routes import FUTURO, curado, menina, usuaria
from tests.test_file_undo_routes import desfazer, sessao_do_desfazer

ITEM = "curadoria-12"
HOJE = date(2026, 11, 19)


@pytest.fixture(autouse=True)
def hoje_fixo(monkeypatch: pytest.MonkeyPatch) -> None:
    # O dia da conclusão é o de hoje em Maceió; fixo, para o teste não variar.
    monkeypatch.setattr("app.modules.girl_file.routes.today_in_maceio", lambda: HOJE)


def curso() -> CuratedItem:
    return curado(
        12,
        EffortBand.NO_MEU_RITMO,
        title="Logica ficticia com Python",
        source="Plataforma ficticia",
        description="Um curso de exemplo.",
        url="https://exemplo.com/curso-de-logica",
        duration="~10 horas",
        min_age=13,
    )


def linha(
    status: FileStatus, girl_id: int = 3, concluded_on: date | None = None
) -> FileEntry:
    return FileEntry(
        id=40,
        girl_id=girl_id,
        curated_item_id=12,
        status=status,
        concluded_on=concluded_on,
    )


def sessao_da_atividade(
    registro: Girl | None,
    linha: FileEntry | None = None,
    item: CuratedItem | None = None,
    usuario: User | None = None,
    aceite: int | None = 10,
) -> AsyncMock:
    sessao_falsa = sessao_com(usuario or usuaria())
    # session.scalar responde, em ordem: o aceite dos termos, o registro da
    # menina (com os temas), a linha que ela tem no filé para esse item (ou
    # None) e o item da curadoria.
    sessao_falsa.scalar.side_effect = [aceite, registro, linha, item]
    return sessao_falsa


async def abrir(
    sessao_falsa: AsyncMock, item: str = ITEM, user_id: int = 1
) -> Response:
    return await chamar_rota(
        app,
        "GET",
        f"/api/file/{item}",
        sessao_falsa,
        token=create_access_token(user_id),
    )


async def mudar(
    sessao_falsa: AsyncMock, status: str, item: str = ITEM, user_id: int = 1
) -> Response:
    return await chamar_rota(
        app,
        "PUT",
        f"/api/file/{item}/status",
        sessao_falsa,
        token=create_access_token(user_id),
        corpo={"status": status},
    )


# --- GET /api/file/{id}: o detalhe -------------------------------------------


async def test_detalhe_mostra_tudo_o_que_a_tela_pede() -> None:
    sessao_falsa = sessao_da_atividade(menina(), linha(FileStatus.IN_PROGRESS), curso())

    response = await abrir(sessao_falsa)

    assert response.status_code == 200
    assert response.json() == {
        "id": ITEM,
        "status": "in_progress",
        "type": "course",
        "typeLabel": "Curso online",
        "theme": "programacao",
        "band": "no-meu-ritmo",
        "title": "Logica ficticia com Python",
        "source": "Plataforma ficticia",
        "description": "Um curso de exemplo.",
        "url": "https://exemplo.com/curso-de-logica",
        "format": "online",
        "duration": "~10 horas",
        "costCents": 0,
        "minAge": 13,
        # Ela curtiu Programação, e o curso é de Programação (RF-F11.04).
        "why": "você curtiu Programação",
        "concludedOn": None,
        "firstName": "Alana",
    }
    # Só ler não muda nada.
    sessao_falsa.commit.assert_not_called()


@pytest.mark.parametrize(
    ("status", "secao"),
    [
        (FileStatus.NEXT, "next"),
        (FileStatus.IN_PROGRESS, "in_progress"),
        (FileStatus.CONCLUDED, "concluded"),
    ],
)
async def test_cada_status_vem_com_a_sua_secao(status: FileStatus, secao: str) -> None:
    sessao_falsa = sessao_da_atividade(menina(), linha(status), curso())

    response = await abrir(sessao_falsa)

    assert response.status_code == 200
    assert response.json()["status"] == secao


async def test_concluida_vem_com_o_dia_da_conclusao() -> None:
    sessao_falsa = sessao_da_atividade(
        menina(), linha(FileStatus.CONCLUDED, concluded_on=date(2026, 11, 2)), curso()
    )

    response = await abrir(sessao_falsa)

    assert response.json()["concludedOn"] == "2026-11-02"


async def test_sem_regra_que_explique_o_por_que_pra_voce_vem_vazio() -> None:
    # Ela curtiu Programação; o item é de Robótica.
    item = curado(12, EffortBand.UMA_TARDE, topic=Topic.ROBOTICA)
    sessao_falsa = sessao_da_atividade(menina(), linha(FileStatus.NEXT), item)

    response = await abrir(sessao_falsa)

    assert response.json()["why"] is None
    assert response.json()["theme"] == "robotica"


async def test_item_que_saiu_das_sugestoes_continua_abrindo() -> None:
    # Desativado ou vencido, ele continua no filé dela.
    item = curso()
    item.active = False
    item.expires_on = date(2020, 1, 1)
    sessao_falsa = sessao_da_atividade(menina(), linha(FileStatus.NEXT), item)

    response = await abrir(sessao_falsa)

    assert response.status_code == 200


@pytest.mark.parametrize("status", [FileStatus.LATER, FileStatus.DISMISSED])
async def test_ver_depois_e_nao_e_pra_mim_nao_estao_no_file(
    status: FileStatus,
) -> None:
    sessao_falsa = sessao_da_atividade(menina(), linha(status), curso())

    response = await abrir(sessao_falsa)

    assert response.status_code == 404
    assert response.json() == {"error": "item_not_found"}


async def test_item_sem_escolha_dela_responde_404() -> None:
    sessao_falsa = sessao_da_atividade(menina(), linha=None, item=curso())

    response = await abrir(sessao_falsa)

    assert response.status_code == 404
    assert response.json() == {"error": "item_not_found"}


async def test_evento_nao_abre_aqui() -> None:
    # Um evento abre a A06·4b (#118), não esta tela.
    evento = curado(
        12,
        EffortBand.GRANDE_DESAFIO,
        kind=ItemKind.EVENT,
        type=CuratedType.HACKATHON,
        starts_on=FUTURO,
        ends_on=FUTURO,
    )
    sessao_falsa = sessao_da_atividade(menina(), linha(FileStatus.NEXT), evento)

    response = await abrir(sessao_falsa)

    assert response.status_code == 404
    assert response.json() == {"error": "item_not_found"}


@pytest.mark.parametrize("item", ["acao-7", "12", "curadoria-abc", "evento-12"])
async def test_acao_de_grupo_ou_id_invalido_responde_404(item: str) -> None:
    # Uma ação de grupo é sempre um evento: nem chega a buscar a linha.
    sessao_falsa = sessao_da_atividade(menina())

    response = await abrir(sessao_falsa, item=item)

    assert response.status_code == 404
    assert response.json() == {"error": "item_not_found"}
    assert sessao_falsa.scalar.await_count == 2


# --- PUT /api/file/{id}/status: a mudança de status ---------------------------


async def test_marcar_como_iniciada_leva_para_em_andamento() -> None:
    escolha = linha(FileStatus.NEXT)
    sessao_falsa = sessao_da_atividade(menina(), escolha, curso())

    response = await mudar(sessao_falsa, "in_progress")

    assert response.status_code == 200
    # A resposta já vem com a seção nova, para a tela trocar o selo e os botões.
    assert response.json()["status"] == "in_progress"
    assert response.json()["concludedOn"] is None
    assert escolha.status is FileStatus.IN_PROGRESS
    assert escolha.concluded_on is None
    sessao_falsa.commit.assert_awaited_once()


async def test_marcar_como_concluida_guarda_o_dia() -> None:
    escolha = linha(FileStatus.IN_PROGRESS)
    sessao_falsa = sessao_da_atividade(menina(), escolha, curso())

    response = await mudar(sessao_falsa, "concluded")

    assert response.status_code == 200
    assert response.json()["status"] == "concluded"
    assert response.json()["concludedOn"] == "2026-11-19"
    # Para o "Você conseguiu, <nome>!" da celebração.
    assert response.json()["firstName"] == "Alana"
    assert escolha.status is FileStatus.CONCLUDED
    assert escolha.concluded_on == HOJE
    sessao_falsa.commit.assert_awaited_once()


@pytest.mark.parametrize(
    ("atual", "pedido"),
    [
        # Da próxima direto para concluída: precisa passar por em andamento.
        (FileStatus.NEXT, "concluded"),
        # Voltar não existe.
        (FileStatus.IN_PROGRESS, "next"),
        (FileStatus.CONCLUDED, "in_progress"),
        (FileStatus.CONCLUDED, "next"),
        # Repetir a seção atual também não.
        (FileStatus.NEXT, "next"),
        (FileStatus.IN_PROGRESS, "in_progress"),
        (FileStatus.CONCLUDED, "concluded"),
    ],
)
async def test_outro_salto_e_recusado(atual: FileStatus, pedido: str) -> None:
    escolha = linha(atual)
    sessao_falsa = sessao_da_atividade(menina(), escolha, curso())

    response = await mudar(sessao_falsa, pedido)

    assert response.status_code == 409
    assert response.json() == {"error": "invalid_status_change"}
    assert escolha.status is atual
    assert escolha.concluded_on is None
    sessao_falsa.commit.assert_not_called()


@pytest.mark.parametrize("corpo", [{"status": "signed_up"}, {"status": "x"}, {}])
async def test_status_fora_da_lista_responde_422(corpo: dict[str, object]) -> None:
    sessao_falsa = sessao_da_atividade(menina(), linha(FileStatus.NEXT), curso())

    response = await chamar_rota(
        app,
        "PUT",
        f"/api/file/{ITEM}/status",
        sessao_falsa,
        token=create_access_token(1),
        corpo=corpo,
    )

    assert response.status_code == 422
    sessao_falsa.commit.assert_not_called()


async def test_mudar_um_item_fora_do_file_responde_404() -> None:
    sessao_falsa = sessao_da_atividade(menina(), linha(FileStatus.LATER), curso())

    response = await mudar(sessao_falsa, "in_progress")

    assert response.status_code == 404
    assert response.json() == {"error": "item_not_found"}
    sessao_falsa.commit.assert_not_called()


# --- "Tirar do filé": DELETE /api/file/{id} (#108) ----------------------------


@pytest.mark.parametrize("status", [FileStatus.NEXT, FileStatus.IN_PROGRESS])
async def test_tirar_do_file_vale_para_proxima_e_em_andamento(
    status: FileStatus,
) -> None:
    # Apagar a linha tira do filé, e o item volta a poder ser sugerido.
    escolha = linha(status)
    sessao_falsa = sessao_do_desfazer(menina(), escolha, total=4)

    response = await desfazer(sessao_falsa)

    assert response.status_code == 200
    assert response.json() == {"fileTotal": 4}
    sessao_falsa.delete.assert_awaited_once_with(escolha)
    sessao_falsa.commit.assert_awaited_once()


async def test_tirar_do_file_uma_atividade_concluida_e_recusado() -> None:
    escolha = linha(FileStatus.CONCLUDED, concluded_on=date(2026, 11, 2))
    sessao_falsa = sessao_do_desfazer(menina(), escolha)

    response = await desfazer(sessao_falsa)

    assert response.status_code == 409
    assert response.json() == {"error": "concluded_cannot_be_removed"}
    sessao_falsa.delete.assert_not_called()
    sessao_falsa.commit.assert_not_called()


# --- Permissões (RNF-G.03) ----------------------------------------------------


async def test_nao_abre_a_atividade_de_outra_menina() -> None:
    # Outra menina (girl_id 9) tem esse item no filé. A busca usa o id da menina
    # da sessão (girl_id 3), então não acha a linha da outra.
    sessao_falsa = sessao_da_atividade(
        menina(user_id=2), linha=None, usuario=usuaria(id=2)
    )

    response = await abrir(sessao_falsa, user_id=2)

    assert response.status_code == 404
    assert response.json() == {"error": "item_not_found"}
    busca_da_menina = sessao_falsa.scalar.await_args_list[1].args[0]
    assert busca_da_menina.compile().params == {"user_id_1": 2}
    busca_da_linha = sessao_falsa.scalar.await_args_list[2].args[0]
    assert busca_da_linha.compile().params == {
        "girl_id_1": 3,
        "curated_item_id_1": 12,
    }


async def test_nao_muda_a_atividade_de_outra_menina() -> None:
    sessao_falsa = sessao_da_atividade(
        menina(user_id=2), linha=None, usuario=usuaria(id=2)
    )

    response = await mudar(sessao_falsa, "in_progress", user_id=2)

    assert response.status_code == 404
    busca_da_linha = sessao_falsa.scalar.await_args_list[2].args[0]
    assert busca_da_linha.compile().params["girl_id_1"] == 3
    sessao_falsa.commit.assert_not_called()


async def test_conta_sem_registro_de_menina_responde_404() -> None:
    sessao_falsa = sessao_da_atividade(None)

    abrir_resposta = await abrir(sessao_falsa)
    sessao_falsa = sessao_da_atividade(None)
    mudar_resposta = await mudar(sessao_falsa, "in_progress")

    assert abrir_resposta.status_code == 404
    assert abrir_resposta.json() == {"error": "profile_not_found"}
    assert mudar_resposta.status_code == 404
    assert mudar_resposta.json() == {"error": "profile_not_found"}


@pytest.mark.parametrize(
    ("metodo", "url"),
    [("GET", f"/api/file/{ITEM}"), ("PUT", f"/api/file/{ITEM}/status")],
)
async def test_sem_sessao_responde_401(metodo: str, url: str) -> None:
    sessao_falsa = sessao_da_atividade(menina(), linha(FileStatus.NEXT), curso())

    response = await chamar_rota(
        app, metodo, url, sessao_falsa, corpo={"status": "in_progress"}
    )

    assert response.status_code == 401
    sessao_falsa.commit.assert_not_called()


async def test_e_so_para_menina() -> None:
    sessao_falsa = sessao_da_atividade(
        menina(),
        linha(FileStatus.NEXT),
        curso(),
        usuario=usuaria(role=Role.COORDINATOR),
    )

    response = await mudar(sessao_falsa, "in_progress")

    assert response.status_code == 403
    sessao_falsa.commit.assert_not_called()


async def test_exige_o_aceite_dos_termos() -> None:
    sessao_falsa = sessao_da_atividade(
        menina(), linha(FileStatus.NEXT), curso(), aceite=None
    )

    response = await abrir(sessao_falsa)

    assert response.status_code == 403
    assert response.json() == {"error": "terms_not_accepted"}


# --- OpenAPI ------------------------------------------------------------------


def test_openapi_mostra_as_rotas_da_atividade(client: TestClient) -> None:
    openapi = client.get("/openapi.json").json()

    detalhe = openapi["paths"]["/api/file/{item_id}"]["get"]
    resposta = detalhe["responses"]["200"]["content"]["application/json"]["schema"]
    assert resposta == {"$ref": "#/components/schemas/ActivityOut"}

    mudanca = openapi["paths"]["/api/file/{item_id}/status"]["put"]
    corpo = mudanca["requestBody"]["content"]["application/json"]["schema"]
    assert corpo == {"$ref": "#/components/schemas/StatusIn"}
    assert "409" in mudanca["responses"]

    tirar = openapi["paths"]["/api/file/{item_id}"]["delete"]
    assert "409" in tirar["responses"]
