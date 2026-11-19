"""Seu filé (A06·3, #114): as três seções, os contadores e o desenho.

As rotas rodam com uma sessão falsa. Os dados são fictícios; os códigos IBGE
de Maceió e Arapiraca são só números.
"""

from datetime import date
from unittest.mock import AsyncMock

import pytest
from fastapi.testclient import TestClient
from httpx2 import Response

from app.auth.utils import create_access_token
from app.main import app
from app.modules.actions.models import Action, ActionFormat, ActionTopic
from app.modules.catalog.models import (
    CuratedItem,
    CuratedType,
    EffortBand,
    ItemKind,
)
from app.modules.girl_file.models import FileEntry, FileStatus
from app.modules.girl_file.schemas import FileSection
from app.modules.girl_file.service import (
    IN_FILE,
    SECTION_OF,
    details_line,
    main_theme,
)
from app.modules.girls.models import Girl, Topic
from app.users.models import Role, User
from tests.helpers import chamar_rota, sessao_com
from tests.test_discover_routes import FUTURO, MACEIO, acao, curado, menina, usuaria


def linha(
    id: int,
    status: FileStatus,
    curated_item_id: int | None = None,
    action_id: int | None = None,
) -> FileEntry:
    return FileEntry(
        id=id,
        girl_id=3,
        curated_item_id=curated_item_id,
        action_id=action_id,
        status=status,
    )


def sessao_do_file(
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
    # session.scalars: as linhas do filé e, só quando há, os itens da curadoria
    # e as ações dos grupos dessas linhas.
    respostas: list[object] = [linhas or []]
    if curados:
        respostas.append(curados)
    if acoes:
        respostas.append(acoes)
    sessao_falsa.scalars.side_effect = respostas
    # session.execute: os nomes das cidades dos presenciais.
    sessao_falsa.execute.return_value = cidades or []
    return sessao_falsa


async def abrir(sessao_falsa: AsyncMock, user_id: int = 1) -> Response:
    return await chamar_rota(
        app,
        "GET",
        "/api/file",
        sessao_falsa,
        token=create_access_token(user_id),
    )


def titulos(response: Response, secao: str) -> list[str]:
    return [item["title"] for item in response.json()[secao]["items"]]


def contadores(response: Response) -> dict[str, int]:
    corpo = response.json()
    return {
        secao: corpo[secao]["count"] for secao in ["inProgress", "next", "concluded"]
    }


# Uma base fixa com itens nas três seções, como no Figma.
CURSO = curado(1, EffortBand.NO_MEU_RITMO, title="Logica ficticia", duration="~10 h")
VIDEO = curado(
    2,
    EffortBand.PRIMEIROS_PASSOS,
    topic=Topic.ROBOTICA,
    type=CuratedType.VIDEO,
    title="Video ficticio",
    duration="~15 min",
)
QUIZ = curado(
    3,
    EffortBand.PRIMEIROS_PASSOS,
    topic=Topic.IA,
    type=CuratedType.QUIZ,
    title="Quiz ficticio",
    duration="~10 min",
)
HACKATHON = curado(
    4,
    EffortBand.GRANDE_DESAFIO,
    kind=ItemKind.EVENT,
    type=CuratedType.HACKATHON,
    title="Hackathon ficticio",
    format=ActionFormat.IN_PERSON,
    city_ibge_code=MACEIO,
    starts_on=FUTURO,
    ends_on=FUTURO,
    registration_deadline=date(2099, 2, 28),
)
OFICINA, _ = acao(7, MACEIO, name="Oficina ficticia de robos")
OFICINA.topics = [ActionTopic(topic=Topic.ROBOTICA)]


def sessao_com_as_tres_secoes() -> AsyncMock:
    linhas = [
        linha(10, FileStatus.CONCLUDED, curated_item_id=3),
        linha(11, FileStatus.NEXT, curated_item_id=4),
        linha(12, FileStatus.IN_PROGRESS, curated_item_id=1),
        linha(13, FileStatus.CONCLUDED, curated_item_id=2),
        linha(14, FileStatus.NEXT, action_id=7),
    ]
    return sessao_do_file(
        menina(),
        linhas=linhas,
        curados=[CURSO, VIDEO, QUIZ, HACKATHON],
        acoes=[OFICINA],
        cidades=[(MACEIO, "Maceió")],
    )


# --- As três seções -----------------------------------------------------------


async def test_file_vazio_tem_as_tres_secoes_com_zero() -> None:
    response = await abrir(sessao_do_file(menina()))

    assert response.status_code == 200
    assert response.json() == {
        "firstName": "Alana",
        "inProgress": {"count": 0, "items": []},
        "next": {"count": 0, "items": []},
        "concluded": {"count": 0, "items": []},
        "squares": [],
    }


async def test_cada_item_fica_na_secao_do_seu_status() -> None:
    response = await abrir(sessao_com_as_tres_secoes())

    assert response.status_code == 200
    assert titulos(response, "inProgress") == ["Logica ficticia"]
    # Na ordem em que entraram no filé.
    assert titulos(response, "next") == [
        "Hackathon ficticio",
        "Oficina ficticia de robos",
    ]
    assert titulos(response, "concluded") == ["Quiz ficticio", "Video ficticio"]


async def test_os_contadores_batem_com_os_itens() -> None:
    response = await abrir(sessao_com_as_tres_secoes())

    assert contadores(response) == {"inProgress": 1, "next": 2, "concluded": 2}
    corpo = response.json()
    for secao in ["inProgress", "next", "concluded"]:
        assert corpo[secao]["count"] == len(corpo[secao]["items"])


async def test_cada_item_tem_tema_tipo_titulo_e_detalhes() -> None:
    response = await abrir(sessao_com_as_tres_secoes())
    corpo = response.json()

    assert corpo["inProgress"]["items"] == [
        {
            "id": "curadoria-1",
            "theme": "programacao",
            "typeLabel": "Curso online",
            "title": "Logica ficticia",
            "details": "Online · ~10 h",
            "deadline": None,
        }
    ]
    hackathon, oficina = corpo["next"]["items"]
    # O evento mostra o prazo de inscrição; o presencial mostra a cidade.
    assert hackathon == {
        "id": "curadoria-4",
        "theme": "programacao",
        "typeLabel": "Hackathon",
        "title": "Hackathon ficticio",
        "details": "Presencial · Maceió",
        "deadline": "2099-02-28",
    }
    # A ação de grupo não tem prazo, só "inscrições abertas".
    assert oficina == {
        "id": "acao-7",
        "theme": "robotica",
        "typeLabel": "Oficina",
        "title": "Oficina ficticia de robos",
        "details": "Presencial · Maceió",
        "deadline": None,
    }


async def test_desenho_tem_um_quadradinho_por_item_pelo_tema_e_pela_secao() -> None:
    response = await abrir(sessao_com_as_tres_secoes())

    # Concluídos primeiro, depois em andamento, depois próximas; em cada seção,
    # agrupados por tema na ordem da tela de interesses (RF-F10.07).
    assert response.json()["squares"] == [
        {"theme": "robotica", "section": "concluded"},
        {"theme": "ia", "section": "concluded"},
        {"theme": "programacao", "section": "in_progress"},
        {"theme": "programacao", "section": "next"},
        {"theme": "robotica", "section": "next"},
    ]


async def test_evento_inscrita_fica_nas_proximas_aventuras() -> None:
    sessao_falsa = sessao_do_file(
        menina(),
        linhas=[linha(10, FileStatus.SIGNED_UP, curated_item_id=4)],
        curados=[HACKATHON],
        cidades=[(MACEIO, "Maceió")],
    )

    response = await abrir(sessao_falsa)

    assert titulos(response, "next") == ["Hackathon ficticio"]
    assert contadores(response) == {"inProgress": 0, "next": 1, "concluded": 0}


async def test_le_so_o_que_entrou_no_file() -> None:
    sessao_falsa = sessao_do_file(menina())

    await abrir(sessao_falsa)

    # O "Ver depois" e o "Não é pra mim" ficam de fora da busca.
    busca_das_linhas = sessao_falsa.scalars.await_args_list[0].args[0]
    assert busca_das_linhas.compile().params["status_1"] == IN_FILE
    assert FileStatus.LATER not in IN_FILE
    assert FileStatus.DISMISSED not in IN_FILE
    # Todo status que entra no filé tem uma seção na tela.
    assert set(SECTION_OF) == set(IN_FILE)


async def test_item_online_sem_cidade_nao_busca_cidades() -> None:
    sessao_falsa = sessao_do_file(
        menina(),
        linhas=[linha(10, FileStatus.NEXT, curated_item_id=1)],
        curados=[CURSO],
    )

    response = await abrir(sessao_falsa)

    assert response.status_code == 200
    sessao_falsa.execute.assert_not_called()


async def test_nao_ha_porcentagem_nem_comparacao_com_outras_meninas() -> None:
    response = await abrir(sessao_com_as_tres_secoes())
    corpo = response.json()

    # RN-28: só o nome dela, as três seções e o desenho; nenhum outro número.
    assert set(corpo) == {"firstName", "inProgress", "next", "concluded", "squares"}
    for secao in ["inProgress", "next", "concluded"]:
        assert set(corpo[secao]) == {"count", "items"}
    assert "%" not in response.text


# --- Regras puras -------------------------------------------------------------


@pytest.mark.parametrize(
    ("temas", "esperado"),
    [
        ([Topic.PROGRAMACAO], Topic.PROGRAMACAO),
        # Vários temas: vale o primeiro na ordem da tela de interesses.
        ([Topic.DESIGN, Topic.IA], Topic.IA),
        ([], None),
    ],
)
def test_tema_principal(temas: list[Topic], esperado: Topic | None) -> None:
    assert main_theme(temas) is esperado


@pytest.mark.parametrize(
    ("formato", "cidade", "esperado"),
    [
        (ActionFormat.ONLINE, None, "Online · ~6 h"),
        (ActionFormat.IN_PERSON, "Arapiraca", "Presencial · Arapiraca"),
        (ActionFormat.IN_PERSON, None, "Presencial"),
    ],
)
def test_linha_de_detalhes(
    formato: ActionFormat, cidade: str | None, esperado: str
) -> None:
    assert details_line(formato, "~6 h", cidade) == esperado


def test_status_que_entram_no_file_e_suas_secoes() -> None:
    assert SECTION_OF == {
        FileStatus.NEXT: FileSection.NEXT,
        FileStatus.SIGNED_UP: FileSection.NEXT,
        FileStatus.IN_PROGRESS: FileSection.IN_PROGRESS,
        FileStatus.CONCLUDED: FileSection.CONCLUDED,
    }


# --- Permissões (RNF-G.03) ----------------------------------------------------


async def test_ve_so_o_file_da_menina_da_sessao() -> None:
    # Outra menina (user 2, registro 3) abre o filé: as buscas usam o id da
    # sessão e o registro achado, nunca um id vindo da requisição.
    sessao_falsa = sessao_do_file(menina(user_id=2), usuario=usuaria(id=2))

    response = await abrir(sessao_falsa, user_id=2)

    assert response.status_code == 200
    busca_da_menina = sessao_falsa.scalar.await_args_list[1].args[0]
    assert busca_da_menina.compile().params == {"user_id_1": 2}
    busca_das_linhas = sessao_falsa.scalars.await_args_list[0].args[0]
    assert busca_das_linhas.compile().params["girl_id_1"] == 3


async def test_nao_da_para_pedir_o_file_de_outra_menina_pela_url() -> None:
    # Não existe GET com id: o filé é sempre o da sessão.
    response = await chamar_rota(
        app,
        "GET",
        "/api/file/9",
        sessao_do_file(menina()),
        token=create_access_token(1),
    )

    assert response.status_code == 405


async def test_conta_sem_registro_de_menina_responde_404() -> None:
    response = await abrir(sessao_do_file(None))

    assert response.status_code == 404
    assert response.json() == {"error": "profile_not_found"}


async def test_sem_sessao_responde_401() -> None:
    response = await chamar_rota(app, "GET", "/api/file", sessao_do_file(menina()))

    assert response.status_code == 401


async def test_file_e_so_para_menina() -> None:
    sessao_falsa = sessao_do_file(menina(), usuario=usuaria(role=Role.COORDINATOR))

    response = await abrir(sessao_falsa)

    assert response.status_code == 403


async def test_file_exige_o_aceite_dos_termos() -> None:
    response = await abrir(sessao_do_file(menina(), aceite=None))

    assert response.status_code == 403
    assert response.json() == {"error": "terms_not_accepted"}


def test_rota_aparece_no_openapi(client: TestClient) -> None:
    schema = client.get("/openapi.json").json()

    rota = schema["paths"]["/api/file"]["get"]
    assert rota["responses"]["200"]["content"]["application/json"]["schema"] == {
        "$ref": "#/components/schemas/FileOut"
    }
    secoes = schema["components"]["schemas"]["FileSection"]["enum"]
    assert secoes == ["in_progress", "next", "concluded"]
