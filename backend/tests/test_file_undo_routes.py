"""O "Desfazer" de uma escolha numa sugestão (A06·2, #106, RF-F10.05): apaga a
escolha dela sobre um item, com o motivo do "Não é pra mim", e devolve o novo
total do filé.

As rotas rodam com uma sessão falsa. Os dados são fictícios.
"""

from unittest.mock import AsyncMock

import pytest
from fastapi.testclient import TestClient
from httpx2 import Response

from app.auth.utils import create_access_token
from app.main import app
from app.modules.girl_file.models import DismissReason, FileEntry, FileStatus
from app.modules.girls.models import Girl
from app.users.models import Role, User
from tests.helpers import chamar_rota, sessao_com, sql_do_postgres
from tests.test_discover_routes import menina, usuaria

ITEM = "curadoria-12"


def linha(
    status: FileStatus,
    reason: DismissReason | None = None,
    girl_id: int = 3,
) -> FileEntry:
    return FileEntry(
        id=40,
        girl_id=girl_id,
        curated_item_id=12,
        status=status,
        dismiss_reason=reason,
    )


def sessao_do_desfazer(
    registro: Girl | None,
    linha: FileEntry | None = None,
    total: int = 5,
    usuario: User | None = None,
    aceite: int | None = 10,
) -> AsyncMock:
    sessao_falsa = sessao_com(usuario or usuaria())
    # session.scalar responde, em ordem: o aceite dos termos, o registro da
    # menina, a linha que ela tem no filé para esse item (ou None) e o novo
    # total do filé.
    sessao_falsa.scalar.side_effect = [aceite, registro, linha, total]
    return sessao_falsa


async def desfazer(
    sessao_falsa: AsyncMock, item: str = ITEM, user_id: int = 1
) -> Response:
    return await chamar_rota(
        app,
        "DELETE",
        f"/api/file/{item}",
        sessao_falsa,
        token=create_access_token(user_id),
    )


# --- As três escolhas ---------------------------------------------------------


async def test_desfazer_quero_fazer_tira_do_file_e_devolve_o_total() -> None:
    escolha = linha(FileStatus.NEXT)
    sessao_falsa = sessao_do_desfazer(menina(), escolha, total=5)

    response = await desfazer(sessao_falsa)

    assert response.status_code == 200
    # O total vem do banco depois de apagar: a pílula "Meu filé" desce.
    assert response.json() == {"fileTotal": 5}
    sessao_falsa.delete.assert_awaited_once_with(escolha)
    sessao_falsa.commit.assert_awaited_once()


async def test_desfazer_talvez_depois_apaga_a_escolha() -> None:
    escolha = linha(FileStatus.LATER)
    sessao_falsa = sessao_do_desfazer(menina(), escolha)

    response = await desfazer(sessao_falsa)

    assert response.status_code == 200
    sessao_falsa.delete.assert_awaited_once_with(escolha)
    sessao_falsa.commit.assert_awaited_once()


async def test_desfazer_nao_e_pra_mim_apaga_a_escolha_e_o_motivo() -> None:
    # O motivo fica na mesma linha; apagar a linha apaga o motivo junto.
    escolha = linha(FileStatus.DISMISSED, DismissReason.MUITO_DIFICIL)
    sessao_falsa = sessao_do_desfazer(menina(), escolha)

    response = await desfazer(sessao_falsa)

    assert response.status_code == 200
    sessao_falsa.delete.assert_awaited_once_with(escolha)
    sessao_falsa.commit.assert_awaited_once()


async def test_desfazer_numa_acao_de_grupo_busca_pela_coluna_da_acao() -> None:
    escolha = FileEntry(id=41, girl_id=3, action_id=7, status=FileStatus.NEXT)
    sessao_falsa = sessao_do_desfazer(menina(), escolha)

    response = await desfazer(sessao_falsa, item="acao-7")

    assert response.status_code == 200
    busca_da_linha = sessao_falsa.scalar.await_args_list[2].args[0]
    assert busca_da_linha.compile().params == {"girl_id_1": 3, "action_id_1": 7}
    sessao_falsa.delete.assert_awaited_once_with(escolha)


# --- Sem escolha para desfazer ------------------------------------------------


async def test_item_sem_escolha_nao_faz_nada() -> None:
    sessao_falsa = sessao_do_desfazer(menina(), linha=None, total=5)

    response = await desfazer(sessao_falsa)

    assert response.status_code == 200
    assert response.json() == {"fileTotal": 5}
    sessao_falsa.delete.assert_not_called()
    sessao_falsa.commit.assert_not_called()


async def test_desfazer_duas_vezes_da_o_mesmo_resultado() -> None:
    escolha = linha(FileStatus.NEXT)
    sessao_falsa = sessao_com(usuaria())
    # Na primeira chamada a linha existe; na segunda ela já foi apagada.
    sessao_falsa.scalar.side_effect = [10, menina(), escolha, 5, 10, menina(), None, 5]

    primeira = await desfazer(sessao_falsa)
    segunda = await desfazer(sessao_falsa)

    assert primeira.status_code == 200
    assert segunda.status_code == 200
    assert primeira.json() == segunda.json() == {"fileTotal": 5}
    sessao_falsa.delete.assert_awaited_once_with(escolha)
    sessao_falsa.commit.assert_awaited_once()


async def test_item_que_nao_aparece_mais_nas_sugestoes_tambem_e_desfeito() -> None:
    # A rota não confere se o item ainda é sugerível: uma ação que fechou
    # depois da escolha também precisa poder ser desfeita.
    escolha = FileEntry(id=41, girl_id=3, action_id=7, status=FileStatus.LATER)
    sessao_falsa = sessao_do_desfazer(menina(), escolha)

    response = await desfazer(sessao_falsa, item="acao-7")

    assert response.status_code == 200
    sessao_falsa.delete.assert_awaited_once_with(escolha)


@pytest.mark.parametrize(
    "item", ["12", "curadoria-", "curadoria-abc", "evento-12", "curadoria-²"]
)
async def test_id_de_item_invalido_responde_404(item: str) -> None:
    sessao_falsa = sessao_do_desfazer(menina())

    response = await desfazer(sessao_falsa, item=item)

    assert response.status_code == 404
    assert response.json() == {"error": "item_not_found"}
    sessao_falsa.delete.assert_not_called()
    sessao_falsa.commit.assert_not_called()


# --- O que não sai do filé (tabela de status da #78) --------------------------


async def test_concluida_nao_sai_do_file() -> None:
    escolha = linha(FileStatus.CONCLUDED)
    sessao_falsa = sessao_do_desfazer(menina(), escolha)

    response = await desfazer(sessao_falsa)

    assert response.status_code == 409
    assert response.json() == {"error": "concluded_cannot_be_removed"}
    sessao_falsa.delete.assert_not_called()
    sessao_falsa.commit.assert_not_called()


async def test_tirar_do_file_um_evento_em_que_ela_se_inscreveu() -> None:
    # "Não vou mais" virou "Tirar do filé" na A06·4b (#184, D-39).
    escolha = FileEntry(id=41, girl_id=3, action_id=7, status=FileStatus.SIGNED_UP)
    sessao_falsa = sessao_do_desfazer(menina(), escolha)

    response = await desfazer(sessao_falsa, item="acao-7")

    assert response.status_code == 200
    sessao_falsa.delete.assert_awaited_once_with(escolha)
    sessao_falsa.commit.assert_awaited_once()


async def test_tirar_do_file_uma_atividade_em_andamento_apaga_a_escolha() -> None:
    escolha = linha(FileStatus.IN_PROGRESS)
    sessao_falsa = sessao_do_desfazer(menina(), escolha)

    response = await desfazer(sessao_falsa)

    assert response.status_code == 200
    sessao_falsa.delete.assert_awaited_once_with(escolha)


async def test_a_linha_e_travada_antes_de_apagar() -> None:
    sessao_falsa = sessao_do_desfazer(menina(), linha(FileStatus.NEXT))

    await desfazer(sessao_falsa)

    # SELECT ... FOR UPDATE: um "Marcar como concluída" ao mesmo tempo espera, e
    # este pedido decide pelo status que ele deixou.
    busca_da_linha = sessao_falsa.scalar.await_args_list[2].args[0]
    assert "FOR UPDATE" in sql_do_postgres(busca_da_linha)


# --- Permissões (RNF-G.03) ----------------------------------------------------


async def test_nao_apaga_a_escolha_de_outra_menina() -> None:
    # Outra menina (girl_id 9) tem esse item no filé. A busca usa o id da menina
    # da sessão (girl_id 3), então não acha a linha da outra e nada é apagado.
    sessao_falsa = sessao_do_desfazer(
        menina(user_id=2), linha=None, usuario=usuaria(id=2)
    )

    response = await desfazer(sessao_falsa, user_id=2)

    assert response.status_code == 200
    busca_da_menina = sessao_falsa.scalar.await_args_list[1].args[0]
    assert busca_da_menina.compile().params == {"user_id_1": 2}
    busca_da_linha = sessao_falsa.scalar.await_args_list[2].args[0]
    assert busca_da_linha.compile().params == {
        "girl_id_1": 3,
        "curated_item_id_1": 12,
    }
    busca_do_total = sessao_falsa.scalar.await_args_list[3].args[0]
    assert busca_do_total.compile().params["girl_id_1"] == 3
    sessao_falsa.delete.assert_not_called()
    sessao_falsa.commit.assert_not_called()


async def test_conta_sem_registro_de_menina_responde_404() -> None:
    sessao_falsa = sessao_do_desfazer(None)

    response = await desfazer(sessao_falsa)

    assert response.status_code == 404
    assert response.json() == {"error": "profile_not_found"}
    sessao_falsa.delete.assert_not_called()


async def test_sem_sessao_responde_401() -> None:
    sessao_falsa = sessao_do_desfazer(menina(), linha(FileStatus.NEXT))

    response = await chamar_rota(app, "DELETE", f"/api/file/{ITEM}", sessao_falsa)

    assert response.status_code == 401
    sessao_falsa.delete.assert_not_called()


async def test_e_so_para_menina() -> None:
    sessao_falsa = sessao_do_desfazer(
        menina(), linha(FileStatus.NEXT), usuario=usuaria(role=Role.COORDINATOR)
    )

    response = await desfazer(sessao_falsa)

    assert response.status_code == 403
    sessao_falsa.delete.assert_not_called()


async def test_exige_o_aceite_dos_termos() -> None:
    sessao_falsa = sessao_do_desfazer(menina(), linha(FileStatus.NEXT), aceite=None)

    response = await desfazer(sessao_falsa)

    assert response.status_code == 403
    assert response.json() == {"error": "terms_not_accepted"}
    sessao_falsa.delete.assert_not_called()


# --- OpenAPI ------------------------------------------------------------------


def test_openapi_mostra_a_rota_do_desfazer(client: TestClient) -> None:
    openapi = client.get("/openapi.json").json()

    rota = openapi["paths"]["/api/file/{item_id}"]["delete"]
    resposta = rota["responses"]["200"]["content"]["application/json"]["schema"]
    assert resposta == {"$ref": "#/components/schemas/ChoiceOut"}
    assert "requestBody" not in rota
