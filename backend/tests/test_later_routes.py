"""Ver depois (A06·2b, #110): o que ela guardou com "Talvez depois", com o
filtro por faixa, sem os itens vencidos.

As rotas rodam com uma sessão falsa. Os dados são fictícios; os códigos IBGE
de Maceió e Arapiraca são só números.
"""

from datetime import date, timedelta
from unittest.mock import AsyncMock

import pytest
from fastapi.testclient import TestClient
from httpx2 import Response

from app.auth.utils import create_access_token
from app.main import app
from app.modules.actions.models import Action, ActionFormat
from app.modules.catalog.models import CuratedItem, CuratedType, EffortBand, ItemKind
from app.modules.girl_file.models import FileEntry, FileStatus
from app.modules.girl_file.service import later_details_line
from app.modules.girls.models import Girl
from app.users.models import Role, User
from tests.helpers import chamar_rota, sessao_com
from tests.test_discover_routes import (
    ARAPIRACA,
    FUTURO,
    MACEIO,
    PASSADO,
    acao,
    curado,
    menina,
    usuaria,
)
from tests.test_file_choice_routes import escolher, item_visivel, sessao_da_escolha
from tests.test_file_undo_routes import desfazer, sessao_do_desfazer


def guardado(
    id: int, curated_item_id: int | None = None, action_id: int | None = None
) -> FileEntry:
    return FileEntry(
        id=id,
        girl_id=3,
        curated_item_id=curated_item_id,
        action_id=action_id,
        status=FileStatus.LATER,
    )


def sessao_do_ver_depois(
    registro: Girl | None,
    linhas: list[FileEntry] | None = None,
    curados: list[CuratedItem] | None = None,
    acoes: list[Action] | None = None,
    cidades: list[tuple[int, str]] | None = None,
    usuario: User | None = None,
    aceite: int | None = 10,
) -> AsyncMock:
    sessao_falsa = sessao_com(usuario or usuaria())
    # session.scalar responde, em ordem: o aceite dos termos e o registro da menina.
    sessao_falsa.scalar.side_effect = [aceite, registro]
    # session.scalars: as linhas guardadas e, só quando há, os itens da
    # curadoria e as ações dos grupos dessas linhas.
    respostas: list[object] = [linhas or []]
    if curados:
        respostas.append(curados)
    if acoes:
        respostas.append(acoes)
    sessao_falsa.scalars.side_effect = respostas
    # session.execute: os nomes das cidades dos presenciais.
    sessao_falsa.execute.return_value = cidades or []
    return sessao_falsa


async def abrir(
    sessao_falsa: AsyncMock, consulta: str = "", user_id: int = 1
) -> Response:
    return await chamar_rota(
        app,
        "GET",
        f"/api/later{consulta}",
        sessao_falsa,
        token=create_access_token(user_id),
    )


def titulos(response: Response) -> list[str]:
    return [item["title"] for item in response.json()["items"]]


# Uma base fixa, como no Figma: um hackathon presencial em Maceió, uma playlist
# curta e uma oficina de grupo de dois dias.
HACKATHON = curado(
    1,
    EffortBand.GRANDE_DESAFIO,
    kind=ItemKind.EVENT,
    type=CuratedType.HACKATHON,
    title="Hackathon ficticio",
    format=ActionFormat.IN_PERSON,
    city_ibge_code=MACEIO,
    duration="2 dias",
    starts_on=FUTURO,
    ends_on=FUTURO + timedelta(days=1),
    registration_deadline=date(2099, 2, 28),
)
PLAYLIST = curado(
    2,
    EffortBand.PRIMEIROS_PASSOS,
    type=CuratedType.PLAYLIST,
    title="Playlist ficticia",
    duration="~40 min",
)
OFICINA, _ = acao(
    7, MACEIO, name="Oficina ficticia de dois dias", ends_on=FUTURO + timedelta(1)
)


def sessao_com_tres_guardados() -> AsyncMock:
    # O banco já devolve as linhas do guardado mais recente para o mais antigo.
    linhas = [
        guardado(12, curated_item_id=2),
        guardado(11, action_id=7),
        guardado(10, curated_item_id=1),
    ]
    return sessao_do_ver_depois(
        menina(),
        linhas=linhas,
        curados=[HACKATHON, PLAYLIST],
        acoes=[OFICINA],
        cidades=[(MACEIO, "Maceió")],
    )


# --- A lista ------------------------------------------------------------------


async def test_lista_vazia() -> None:
    response = await abrir(sessao_do_ver_depois(menina()))

    assert response.status_code == 200
    assert response.json() == {"firstName": "Alana", "items": []}


async def test_lista_o_que_ela_guardou_do_mais_recente_para_o_mais_antigo() -> None:
    sessao_falsa = sessao_com_tres_guardados()

    response = await abrir(sessao_falsa)

    assert response.status_code == 200
    assert titulos(response) == [
        "Playlist ficticia",
        "Oficina ficticia de dois dias",
        "Hackathon ficticio",
    ]
    # A ordem vem da busca: a escolha mais recente primeiro.
    busca_das_linhas = str(sessao_falsa.scalars.await_args_list[0].args[0])
    assert (
        "ORDER BY file_entries.updated_at DESC, file_entries.id DESC"
        in busca_das_linhas
    )


async def test_le_so_o_que_ela_guardou_com_talvez_depois() -> None:
    sessao_falsa = sessao_do_ver_depois(menina())

    await abrir(sessao_falsa)

    # O filé e o "Não é pra mim" ficam de fora da busca.
    busca_das_linhas = sessao_falsa.scalars.await_args_list[0].args[0]
    assert busca_das_linhas.compile().params["status_1"] is FileStatus.LATER


async def test_cada_cartao_tem_tipo_faixa_titulo_detalhes_e_prazo() -> None:
    response = await abrir(sessao_com_tres_guardados())
    playlist, oficina, hackathon = response.json()["items"]

    assert playlist == {
        "id": "curadoria-2",
        "kind": "atividade",
        "band": "primeiros-passos",
        "typeLabel": "Playlist",
        "title": "Playlist ficticia",
        "details": "Online · ~40 min",
        "deadline": None,
    }
    # A ação de grupo é um evento de dois dias, sem prazo de inscrição.
    assert oficina == {
        "id": "acao-7",
        "kind": "evento",
        "band": "grande-desafio",
        "typeLabel": "Oficina",
        "title": "Oficina ficticia de dois dias",
        "details": "Presencial · Maceió · 2 dias",
        "deadline": None,
    }
    # O evento da curadoria mostra o prazo de inscrição.
    assert hackathon == {
        "id": "curadoria-1",
        "kind": "evento",
        "band": "grande-desafio",
        "typeLabel": "Hackathon",
        "title": "Hackathon ficticio",
        "details": "Presencial · Maceió · 2 dias",
        "deadline": "2099-02-28",
    }


# --- O filtro por faixa (RF-F10.06) -------------------------------------------


async def test_filtro_por_faixa_mostra_so_os_itens_dela() -> None:
    response = await abrir(sessao_com_tres_guardados(), "?band=grande-desafio")

    assert response.status_code == 200
    assert titulos(response) == [
        "Oficina ficticia de dois dias",
        "Hackathon ficticio",
    ]


async def test_filtro_de_uma_faixa_sem_itens_devolve_lista_vazia() -> None:
    response = await abrir(sessao_com_tres_guardados(), "?band=uma-tarde")

    assert response.status_code == 200
    assert response.json()["items"] == []


async def test_faixa_fora_das_cinco_responde_422() -> None:
    response = await abrir(sessao_do_ver_depois(menina()), "?band=maratona")

    assert response.status_code == 422


# --- Itens vencidos (RF-F11.07) -----------------------------------------------


@pytest.mark.parametrize(
    "vencido",
    [
        curado(5, EffortBand.UMA_TARDE, expires_on=PASSADO),
        curado(5, EffortBand.UMA_TARDE, active=False),
        # Um evento que já começou, ou com as inscrições encerradas.
        curado(
            5,
            EffortBand.UMA_TARDE,
            kind=ItemKind.EVENT,
            starts_on=PASSADO,
            ends_on=PASSADO,
        ),
        curado(
            5,
            EffortBand.UMA_TARDE,
            kind=ItemKind.EVENT,
            starts_on=FUTURO,
            ends_on=FUTURO,
            registration_deadline=PASSADO,
        ),
        # Presencial de outra cidade: o "+ Quero fazer" também recusaria.
        curado(
            5,
            EffortBand.UMA_TARDE,
            format=ActionFormat.IN_PERSON,
            city_ibge_code=ARAPIRACA,
        ),
    ],
)
async def test_item_da_curadoria_que_venceu_nao_aparece(vencido: CuratedItem) -> None:
    sessao_falsa = sessao_do_ver_depois(
        menina(),
        linhas=[guardado(12, curated_item_id=2), guardado(11, curated_item_id=5)],
        curados=[PLAYLIST, vencido],
        cidades=[(ARAPIRACA, "Arapiraca")],
    )

    response = await abrir(sessao_falsa)

    assert response.status_code == 200
    assert titulos(response) == ["Playlist ficticia"]


@pytest.mark.parametrize(
    "campos",
    [
        {"starts_on": PASSADO, "ends_on": PASSADO},
        {"registrations_open": False},
    ],
)
async def test_acao_que_passou_ou_fechou_nao_aparece(
    campos: dict[str, object],
) -> None:
    fechada, _ = acao(8, MACEIO, **campos)
    sessao_falsa = sessao_do_ver_depois(
        menina(),
        linhas=[guardado(11, action_id=8)],
        acoes=[fechada],
        cidades=[(MACEIO, "Maceió")],
    )

    response = await abrir(sessao_falsa)

    assert response.status_code == 200
    assert response.json()["items"] == []


async def test_item_vencido_continua_guardado() -> None:
    vencido = curado(5, EffortBand.UMA_TARDE, expires_on=PASSADO)
    sessao_falsa = sessao_do_ver_depois(
        menina(), linhas=[guardado(11, curated_item_id=5)], curados=[vencido]
    )

    await abrir(sessao_falsa)

    # Só some da tela: a rota não apaga nem muda a escolha dela.
    sessao_falsa.delete.assert_not_called()
    sessao_falsa.commit.assert_not_called()


# --- "+ Quero fazer" e "Remover" ----------------------------------------------


async def test_quero_fazer_troca_o_talvez_depois_e_o_item_sai_do_ver_depois() -> None:
    # "+ Quero fazer" usa PUT /api/file/{id} (#104) na mesma linha guardada.
    linha = FileEntry(id=40, girl_id=3, curated_item_id=12, status=FileStatus.LATER)
    sessao_falsa = sessao_da_escolha(menina(), item_visivel(), linha=linha, total=6)

    response = await escolher(sessao_falsa, {"choice": "quero-fazer"})

    assert response.status_code == 200
    assert response.json() == {"fileTotal": 6}
    sessao_falsa.add.assert_not_called()
    assert linha.status is FileStatus.NEXT


async def test_remover_apaga_a_escolha_e_o_item_pode_ser_sugerido_de_novo() -> None:
    # "Remover" usa DELETE /api/file/{id} (#108): sem a linha, o item volta às sugestões.
    linha = FileEntry(id=40, girl_id=3, curated_item_id=12, status=FileStatus.LATER)
    sessao_falsa = sessao_do_desfazer(menina(), linha)

    response = await desfazer(sessao_falsa)

    assert response.status_code == 200
    sessao_falsa.delete.assert_awaited_once_with(linha)
    sessao_falsa.commit.assert_awaited_once()


# --- Regras puras -------------------------------------------------------------


@pytest.mark.parametrize(
    ("formato", "cidade", "esperado"),
    [
        (ActionFormat.ONLINE, None, "Online · ~40 min"),
        (ActionFormat.IN_PERSON, "Maceió", "Presencial · Maceió · ~40 min"),
        (ActionFormat.IN_PERSON, None, "Presencial · ~40 min"),
    ],
)
def test_linha_de_detalhes(
    formato: ActionFormat, cidade: str | None, esperado: str
) -> None:
    assert later_details_line(formato, "~40 min", cidade) == esperado


# --- Permissões (RNF-G.03) ----------------------------------------------------


async def test_ve_so_a_lista_da_menina_da_sessao() -> None:
    # Outra menina (user 2, registro 3) abre o Ver depois: as buscas usam o id
    # da sessão e o registro achado, nunca um id vindo da requisição.
    sessao_falsa = sessao_do_ver_depois(menina(user_id=2), usuario=usuaria(id=2))

    response = await abrir(sessao_falsa, user_id=2)

    assert response.status_code == 200
    busca_da_menina = sessao_falsa.scalar.await_args_list[1].args[0]
    assert busca_da_menina.compile().params == {"user_id_1": 2}
    busca_das_linhas = sessao_falsa.scalars.await_args_list[0].args[0]
    assert busca_das_linhas.compile().params["girl_id_1"] == 3


async def test_nao_da_para_pedir_a_lista_de_outra_menina_pela_url() -> None:
    # Não existe rota com id: a lista é sempre a da sessão.
    response = await chamar_rota(
        app,
        "GET",
        "/api/later/9",
        sessao_do_ver_depois(menina()),
        token=create_access_token(1),
    )

    assert response.status_code == 404


async def test_conta_sem_registro_de_menina_responde_404() -> None:
    response = await abrir(sessao_do_ver_depois(None))

    assert response.status_code == 404
    assert response.json() == {"error": "profile_not_found"}


async def test_sem_sessao_responde_401() -> None:
    response = await chamar_rota(
        app, "GET", "/api/later", sessao_do_ver_depois(menina())
    )

    assert response.status_code == 401


async def test_ver_depois_e_so_para_menina() -> None:
    sessao_falsa = sessao_do_ver_depois(
        menina(), usuario=usuaria(role=Role.COORDINATOR)
    )

    response = await abrir(sessao_falsa)

    assert response.status_code == 403


async def test_ver_depois_exige_o_aceite_dos_termos() -> None:
    response = await abrir(sessao_do_ver_depois(menina(), aceite=None))

    assert response.status_code == 403
    assert response.json() == {"error": "terms_not_accepted"}


def test_rota_aparece_no_openapi(client: TestClient) -> None:
    schema = client.get("/openapi.json").json()

    rota = schema["paths"]["/api/later"]["get"]
    assert rota["responses"]["200"]["content"]["application/json"]["schema"] == {
        "$ref": "#/components/schemas/LaterOut"
    }
    filtro = rota["parameters"][0]
    assert filtro["name"] == "band"
    assert filtro["required"] is False
    cartao = schema["components"]["schemas"]["LaterItemOut"]["properties"]
    assert set(cartao) == {
        "id",
        "kind",
        "band",
        "typeLabel",
        "title",
        "details",
        "deadline",
    }
