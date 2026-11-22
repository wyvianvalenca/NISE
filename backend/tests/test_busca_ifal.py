"""Busca nas listas de convocação do IFAL, em PDF (#274).

Nenhum dado real e nenhuma chamada de rede: a API do IFAL é imitada por um
MockTransport, e os PDFs são fictícios, gerados em tests/ifal_ficticio.py no
layout que o spike anotou.
"""

import builtins
import json
import logging
import os
import tempfile
import threading
from collections.abc import Callable
from datetime import UTC, datetime
from typing import Any
from unittest.mock import AsyncMock, MagicMock

import httpx2
import pytest

from app.config import settings
from app.main import app
from app.modules.admissions import search
from app.modules.admissions.copeve import (
    ROBOT_USER_AGENT,
    ReportFormatError,
    ReportUnavailableError,
)
from app.modules.admissions.ifal import (
    LISTING_CAP,
    TargetCourse,
    is_convocation,
    is_other_course,
    parse_convocation,
)
from app.modules.admissions.models import (
    Approval,
    CourseLevel,
    Enrollment,
    ListMatch,
    ListSearchRun,
    OfficialList,
)
from app.modules.admissions.schemas import MatchAnswerIn, MatchResult
from app.modules.admissions.search import run_ifal_round
from app.modules.admissions.service import answer_match
from tests.copeve_ficticio import nome_ficticio
from tests.ifal_ficticio import HEADER, Linha, lista_pdf, montar_pdf, pdf_imagem

ALVO = TargetCourse("Sistemas de Informação", "Maceió")
SELECAO = 101
PROCESSO = "SiSU 2027"
API = "https://ifal.exemplo.test/api"
CLASSIFICADOS = "Resultado Final - Classificados"
AGORA = datetime(2026, 11, 18, 12, 0, tzinfo=UTC)


@pytest.fixture(autouse=True)
def configuracao(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "list_search_enabled", True)
    monkeypatch.setattr(settings, "ifal_api_url", API)
    monkeypatch.setattr(settings, "ifal_selections", {SELECAO: PROCESSO})
    monkeypatch.setattr(
        settings, "ifal_target_courses", [("Sistemas de Informação", "Maceió")]
    )


# --- Títulos -----------------------------------------------------------------


@pytest.mark.parametrize(
    "titulo",
    [
        "Candidatos Classificados - Chamada Regular (Com direito à matrícula)",
        "Resultado Final - Classificados",
        "Resultado Final - Classificados - Sistemas de Informação - Maceió",
        "Edital de Convocação para a Matrícula Presencial em 1ª Chamada",
    ],
)
def test_titulos_de_convocacao(titulo: str) -> None:
    assert is_convocation(titulo)


@pytest.mark.parametrize(
    "titulo",
    [
        "Lista de Espera SiSU 2021.2 - Candidatos em ordem alfabética",
        "Resultado Final - Suplentes - Sistemas de Informação - Maceió",
        "Resultado Preliminar - Classificados",
        "Candidatos Desclassificados",
        "Edital de Abertura",
        "Retificação do Resultado Final - Classificados",
    ],
)
def test_titulos_que_nao_sao_convocacao(titulo: str) -> None:
    assert not is_convocation(titulo)


def test_lista_de_outro_curso_pelo_titulo() -> None:
    assert is_other_course("Resultado Final - Classificados - Química - Maceió", [ALVO])
    assert is_other_course(
        "Resultado Final - Classificados - Sistemas de Informação - Arapiraca", [ALVO]
    )
    assert not is_other_course(
        "Resultado Final - Classificados - Sistemas de Informação - Maceió", [ALVO]
    )
    # Sem curso no título: pode ter qualquer curso dentro.
    assert not is_other_course(CLASSIFICADOS, [ALVO])


@pytest.mark.parametrize(
    "titulo",
    [
        # Três ou mais trechos, mas o último não é um campus: lista com todos os cursos.
        "Resultado Final - 2ª Chamada - Lista de Classificados",
        "SiSU 2027 - Convocados - 1ª Chamada",
        "Resultado Final - Classificados - Chamada Regular",
        # Termina num campus, mas o trecho antes é a chamada: lista do campus todo.
        "SiSU 2027 - 1ª Chamada - Maceió",
        "SiSU 2027 - Convocados - Arapiraca",
    ],
)
def test_titulo_com_tracos_sem_campus_no_fim_e_baixado(titulo: str) -> None:
    assert is_convocation(titulo)
    assert not is_other_course(titulo, [ALVO])


def test_campus_do_curso_alvo_conta_mesmo_fora_da_lista_de_campi() -> None:
    alvo = TargetCourse("Sistemas de Informação", "Campus Novo")

    assert is_other_course(
        "Resultado Final - Classificados - Química - Campus Novo", [alvo]
    )
    assert not is_other_course(
        "Resultado Final - Classificados - Sistemas de Informação - Campus Novo", [alvo]
    )


# --- Leitura do PDF ----------------------------------------------------------


def test_le_todas_as_paginas_e_normaliza_os_nomes() -> None:
    linhas = [Linha(nome_ficticio(i)) for i in range(120)]

    lista = parse_convocation(lista_pdf(linhas), CLASSIFICADOS, [ALVO])

    assert lista.rows_read == 120
    assert [item.name for item in lista.convoked][:2] == [
        "ana clara lima da ficticia",
        "beatriz clara lima da ficticia",
    ]
    assert {item.course for item in lista.convoked} == {ALVO}
    # Só nome e curso; inscrição, posição, concorrência e nota nunca (RN-23).
    assert set(vars(lista.convoked[0])) == {"name", "course"}


def test_asterisco_depois_do_nome_ou_da_concorrencia_e_ignorado() -> None:
    linhas = [Linha(nome_ficticio(0) + "*"), Linha(nome_ficticio(1), "L1*")]

    lista = parse_convocation(lista_pdf(linhas), CLASSIFICADOS, [ALVO])

    assert [item.name for item in lista.convoked] == [
        "ana clara lima da ficticia",
        "beatriz clara lima da ficticia",
    ]


def test_so_cursos_alvo() -> None:
    lista = parse_convocation(
        lista_pdf([Linha(nome_ficticio(0))], curso="Licenciatura em Química"),
        CLASSIFICADOS,
        [ALVO],
    )

    assert lista.rows_read == 1
    assert lista.convoked == []


def test_mesmo_curso_em_outro_campus_nao_e_alvo() -> None:
    lista = parse_convocation(
        lista_pdf([Linha(nome_ficticio(0))], campus="Arapiraca"),
        CLASSIFICADOS,
        [ALVO],
    )

    assert lista.convoked == []


def test_cada_pagina_vale_pelo_curso_do_topo() -> None:
    alvo = lista_pdf([Linha(nome_ficticio(0))])
    outro = lista_pdf([Linha(nome_ficticio(1))], curso="Licenciatura em Química")

    def conteudo(pdf: bytes) -> str:
        texto = pdf.decode("latin-1")
        return texto[texto.index("stream\n") + 7 : texto.index("endstream")]

    lista = parse_convocation(
        montar_pdf([conteudo(alvo), conteudo(outro)]), CLASSIFICADOS, [ALVO]
    )

    assert lista.rows_read == 2
    assert [item.name for item in lista.convoked] == ["ana clara lima da ficticia"]


@pytest.mark.parametrize("rodape", ["{n}", "Página {n} de 3"])
def test_rodape_com_o_numero_da_pagina_nao_e_candidato(rodape: str) -> None:
    # "1" sozinho no pé da página começa com dígito, mas não é uma linha.
    linhas = [Linha(nome_ficticio(i)) for i in range(120)]

    lista = parse_convocation(lista_pdf(linhas, rodape=rodape), CLASSIFICADOS, [ALVO])

    assert lista.rows_read == 120


def test_rodape_com_recurso_nao_troca_o_curso_da_pagina_seguinte() -> None:
    # "Recurso" tem "curso" dentro. A 2ª página começa direto no cabeçalho, então
    # o rodapé da 1ª é o único texto antes dela: o curso continua o do topo.
    linhas = [Linha(nome_ficticio(i)) for i in range(60)]
    pdf = lista_pdf(linhas, rodape="Recurso: prazo de 2 dias", topo_so_na_primeira=True)

    lista = parse_convocation(pdf, CLASSIFICADOS, [ALVO])

    assert lista.rows_read == 60
    assert len(lista.convoked) == 60


@pytest.mark.parametrize(
    "topo",
    [
        ["INSTITUTO FEDERAL DE ALAGOAS", "CONCURSO SISU 2027"],
        ["INSTITUTO FEDERAL DE ALAGOAS", "PERCURSO DA MATRÍCULA: VEJA O EDITAL"],
        [
            "INSTITUTO FEDERAL DE ALAGOAS",
            "Dúvidas sobre o curso: procure a coordenação",
        ],
    ],
)
def test_topo_sem_curso_mantem_o_curso_do_titulo(topo: list[str]) -> None:
    titulo = "Resultado Final - Classificados - Sistemas de Informação - Maceió"

    lista = parse_convocation(
        lista_pdf([Linha(nome_ficticio(0))], topo=topo), titulo, [ALVO]
    )

    assert [item.name for item in lista.convoked] == ["ana clara lima da ficticia"]


def test_topo_com_outro_curso_sem_dois_pontos_tira_do_alvo() -> None:
    # "CURSO QUÍMICA" no começo da linha diz o curso, mesmo sem "Curso:".
    lista = parse_convocation(
        lista_pdf(
            [Linha(nome_ficticio(0))],
            topo=["INSTITUTO FEDERAL DE ALAGOAS", "CURSO LICENCIATURA EM QUÍMICA"],
        ),
        "Resultado Final - Classificados - Sistemas de Informação - Maceió",
        [ALVO],
    )

    assert lista.rows_read == 1
    assert lista.convoked == []


def _conteudo(pdf: bytes) -> str:
    """Os operadores de texto da única página de um PDF de lista_pdf."""
    texto = pdf.decode("latin-1")
    return texto[texto.index("stream\n") + 7 : texto.index("endstream")]


@pytest.mark.parametrize(
    "abertura",
    [
        "Classificados do Curso de Agronomia - Campus Satuba",
        "TÉCNICO EM AGROPECUÁRIA - CAMPUS SATUBA",
        "1.2 Curso: Agronomia",
    ],
)
def test_trecho_de_outro_curso_depois_do_alvo_nao_fica_com_o_alvo(
    abertura: str,
) -> None:
    # 2 nomes de SI, depois um trecho aberto só com a frase: os 3 do outro curso
    # não podem ir para SI (a menina receberia "É você na lista?" do curso errado).
    alvo = lista_pdf([Linha(nome_ficticio(0)), Linha(nome_ficticio(1))])
    outro = lista_pdf(
        [Linha(nome_ficticio(i)) for i in range(2, 5)],
        topo=["INSTITUTO FEDERAL DE ALAGOAS", abertura],
    )

    lista = parse_convocation(
        montar_pdf([_conteudo(alvo), _conteudo(outro)]), CLASSIFICADOS, [ALVO]
    )

    assert lista.rows_read == 5
    assert [item.name for item in lista.convoked] == [
        "ana clara lima da ficticia",
        "beatriz clara lima da ficticia",
    ]


@pytest.mark.parametrize(
    "topo",
    [
        ["INSTITUTO FEDERAL DE ALAGOAS", "Campus: Maceió"],
        ["INSTITUTO FEDERAL DE ALAGOAS", "CAMPUS MACEIO"],
        [
            "INSTITUTO FEDERAL DE ALAGOAS",
            "Curso: Bacharelado em Sistemas de Informação",
        ],
    ],
)
def test_topo_so_com_o_campus_ou_so_com_o_curso_do_alvo_mantem_os_nomes(
    topo: list[str],
) -> None:
    titulo = "Resultado Final - Classificados - Sistemas de Informação - Maceió"

    lista = parse_convocation(
        lista_pdf([Linha(nome_ficticio(0))], topo=topo), titulo, [ALVO]
    )

    assert [item.name for item in lista.convoked] == ["ana clara lima da ficticia"]


@pytest.mark.parametrize(
    "topo",
    [
        ["INSTITUTO FEDERAL DE ALAGOAS", "Campus: Arapiraca"],
        ["INSTITUTO FEDERAL DE ALAGOAS", "Curso: Licenciatura em Química"],
        ["INSTITUTO FEDERAL DE ALAGOAS", "TÉCNICO EM AGROPECUÁRIA - CAMPUS MACEIÓ"],
    ],
)
def test_topo_so_com_outro_campus_ou_outro_curso_tira_do_alvo(
    topo: list[str],
) -> None:
    titulo = "Resultado Final - Classificados - Sistemas de Informação - Maceió"

    lista = parse_convocation(
        lista_pdf([Linha(nome_ficticio(0))], topo=topo), titulo, [ALVO]
    )

    assert lista.rows_read == 1
    assert lista.convoked == []


def test_pdf_imagem_para_a_rodada() -> None:
    with pytest.raises(ReportFormatError):
        parse_convocation(pdf_imagem(), CLASSIFICADOS, [ALVO])


def test_arquivo_que_nao_e_pdf_para_a_rodada() -> None:
    with pytest.raises(ReportFormatError):
        parse_convocation(b"<html>Manutencao</html>", CLASSIFICADOS, [ALVO])


def test_cabecalho_sem_nome_para_a_rodada() -> None:
    cabecalho = [c if c != "Nome" else "Candidato" for c in HEADER]

    with pytest.raises(ReportFormatError):
        parse_convocation(
            lista_pdf([Linha(nome_ficticio(0))], cabecalho=cabecalho),
            CLASSIFICADOS,
            [ALVO],
        )


def test_coluna_a_mais_para_a_rodada() -> None:
    # O cabeçalho tem 5 colunas; a linha do candidato passa a ter 6.
    pdf = lista_pdf([Linha(nome_ficticio(0), "A0   Sim")])

    with pytest.raises(ReportFormatError):
        parse_convocation(pdf, CLASSIFICADOS, [ALVO])


def test_lista_sem_ninguem_para_a_rodada() -> None:
    with pytest.raises(ReportFormatError):
        parse_convocation(lista_pdf([]), CLASSIFICADOS, [ALVO])


# --- Rodada ------------------------------------------------------------------


Documento = tuple[int, str, bytes | None]


def _cliente(
    documentos: list[Documento],
    listagem: Callable[[httpx2.Request], httpx2.Response] | None = None,
    tipo: str = "application/pdf",
) -> tuple[httpx2.AsyncClient, list[httpx2.Request]]:
    pedidos: list[httpx2.Request] = []
    pdfs = {doc_id: pdf for doc_id, _, pdf in documentos}

    def responder(request: httpx2.Request) -> httpx2.Response:
        pedidos.append(request)
        caminho = request.url.path
        if caminho == f"/api/selecoes/{SELECAO}/documentos":
            if listagem is not None:
                return listagem(request)
            corpo = [
                {"id": doc_id, "nome": titulo, "visivel": True}
                for doc_id, titulo, _ in documentos
            ]
            return httpx2.Response(200, json=corpo)
        prefixo = f"/api/selecoes/{SELECAO}/documentos/"
        if caminho.startswith(prefixo) and caminho.endswith("/download"):
            pdf = pdfs[int(caminho.removeprefix(prefixo).split("/")[0])]
            assert pdf is not None, "documento que não devia ser baixado"
            return httpx2.Response(200, content=pdf, headers={"content-type": tipo})
        return httpx2.Response(404)

    return httpx2.AsyncClient(transport=httpx2.MockTransport(responder)), pedidos


def _sessao(meninas: list[tuple[int, str]]) -> AsyncMock:
    sessao_falsa = AsyncMock()
    sessao_falsa.execute.return_value = meninas
    # O único scalar fora de _official_list e create_match é o lock da rodada.
    sessao_falsa.scalar.return_value = True
    sessao_falsa.add = MagicMock()
    return sessao_falsa


def _gravado(sessao_falsa: AsyncMock) -> list[Any]:
    return [chamada.args[0] for chamada in sessao_falsa.add.call_args_list]


@pytest.fixture
def indicios(monkeypatch: pytest.MonkeyPatch) -> list[tuple[int, str, str, str]]:
    """Troca a gravação dos indícios por uma lista que não repete a chamada.

    Imita create_match (#270): a mesma menina na mesma chamada não ganha outro.
    """
    criados: list[tuple[int, str, str, str]] = []

    async def lista(
        _session: object, institution: str, selection: str, call: str, url: str
    ) -> OfficialList:
        return OfficialList(
            institution=institution, selection_process=selection, call=call, url=url
        )

    async def criar(
        _session: object,
        girl_id: int,
        official_list: OfficialList,
        course: str,
        *_: object,
    ) -> object | None:
        if (girl_id, official_list.selection_process, official_list.call) in {
            (g, s, c) for g, _, s, c in criados
        }:
            return None
        assert official_list.institution == "IFAL"
        criados.append(
            (girl_id, course, official_list.selection_process, official_list.call)
        )
        return object()

    monkeypatch.setattr(search, "_official_list", lista)
    monkeypatch.setattr(search, "create_match", criar)
    return criados


async def _sem_espera(_: float) -> None:
    return None


@pytest.fixture
def sem_disco(monkeypatch: pytest.MonkeyPatch) -> list[str]:
    """Falha se algo tentar escrever em disco ou criar arquivo temporário."""
    escritas: list[str] = []
    abrir = builtins.open

    def abrir_so_para_ler(arquivo: Any, mode: str = "r", *args: Any, **kw: Any) -> Any:
        if any(letra in mode for letra in "wax+"):
            escritas.append(str(arquivo))
            raise AssertionError("escrita em disco durante a busca")
        return abrir(arquivo, mode, *args, **kw)

    def proibido(*_: object, **__: object) -> None:
        raise AssertionError("arquivo temporário durante a busca")

    monkeypatch.setattr(builtins, "open", abrir_so_para_ler)
    for nome in (
        "mkstemp",
        "mkdtemp",
        "NamedTemporaryFile",
        "TemporaryFile",
        "SpooledTemporaryFile",
        "TemporaryDirectory",
    ):
        monkeypatch.setattr(tempfile, nome, proibido)
    return escritas


async def test_pdf_e_lido_fora_do_loop_de_eventos(
    indicios: list[tuple[int, str, str, str]], monkeypatch: pytest.MonkeyPatch
) -> None:
    # O pypdf num PDF de até 15 MB não pode travar as outras requisições.
    threads: list[int] = []
    ler = parse_convocation

    def ler_registrando(*args: Any) -> Any:
        threads.append(threading.get_ident())
        return ler(*args)

    monkeypatch.setattr(search, "parse_convocation", ler_registrando)
    cliente, _ = _cliente([(1, CLASSIFICADOS, lista_pdf([Linha(nome_ficticio(0))]))])

    await run_ifal_round(_sessao([]), cliente, _sem_espera)

    assert threads and threading.get_ident() not in threads


async def test_500_linhas_com_3_meninas_geram_3_indicios_e_nada_dos_outros(
    indicios: list[tuple[int, str, str, str]],
    caplog: pytest.LogCaptureFixture,
    sem_disco: list[str],
) -> None:
    linhas = [Linha(nome_ficticio(i)) for i in range(500)]
    meninas = [
        (1, "Ana Clára Lima da Fictícia"),
        (2, "  BEATRIZ CLARA LIMA DA FICTICIA "),
        (3, "carla   clara lima da ficticia"),
        (4, "Uma Menina Que Nao Esta Na Lista"),
    ]
    cliente, _ = _cliente([(1, CLASSIFICADOS, lista_pdf(linhas))])
    sessao_falsa = _sessao(meninas)
    temporarios = set(os.listdir(tempfile.gettempdir()))

    with caplog.at_level(logging.DEBUG):
        resultado = await run_ifal_round(sessao_falsa, cliente, _sem_espera)

    assert resultado.matches_created == 3
    assert resultado.rows_read == 500
    assert sorted(girl for girl, *_ in indicios) == [1, 2, 3]
    assert {(course, sel, call) for _, course, sel, call in indicios} == {
        ("Sistemas de Informação", PROCESSO, CLASSIFICADOS)
    }

    # As outras 497 pessoas não aparecem em nada gravado, nos logs ou no disco.
    [rodada] = _gravado(sessao_falsa)
    assert isinstance(rodada, ListSearchRun)
    assert rodada.source == "ifal"
    gravado = repr(vars(rodada)) + repr(indicios) + caplog.text
    for i in range(3, 500):
        assert nome_ficticio(i) not in gravado
        assert nome_ficticio(i).lower() not in gravado
    assert sem_disco == []
    assert set(os.listdir(tempfile.gettempdir())) == temporarios
    sessao_falsa.commit.assert_awaited_once()


async def test_nome_parcial_nao_gera_indicio(
    indicios: list[tuple[int, str, str, str]],
) -> None:
    # "Maria Santos" não é "Maria Eduarda Santos" (RF-F31.03).
    pdf = lista_pdf([Linha("Maria Eduarda Santos")])
    cliente, _ = _cliente([(1, CLASSIFICADOS, pdf)])

    await run_ifal_round(_sessao([(1, "Maria Santos")]), cliente, _sem_espera)

    assert indicios == []


async def test_acentos_maiusculas_e_espacos_no_pdf(
    indicios: list[tuple[int, str, str, str]],
) -> None:
    # No PDF, dois espaços separam colunas; os espaços extras ficam na conta.
    pdf = lista_pdf([Linha("MARIA EDUARDA SANTOS DA SILVA"), Linha("João Félix")])
    cliente, _ = _cliente([(1, CLASSIFICADOS, pdf)])
    meninas = [(1, " Maria Eduarda  Santos da Sílva"), (2, "JOAO   felix ")]

    await run_ifal_round(_sessao(meninas), cliente, _sem_espera)

    assert sorted(girl for girl, *_ in indicios) == [1, 2]


async def test_so_cursos_alvo_na_rodada(
    indicios: list[tuple[int, str, str, str]],
) -> None:
    pdf = lista_pdf([Linha(nome_ficticio(0))], curso="Licenciatura em Química")
    cliente, _ = _cliente([(1, CLASSIFICADOS, pdf)])

    resultado = await run_ifal_round(
        _sessao([(1, nome_ficticio(0))]), cliente, _sem_espera
    )

    assert resultado.rows_read == 1
    assert indicios == []


async def test_convocacao_com_todos_os_cursos_e_baixada_e_lida(
    indicios: list[tuple[int, str, str, str]],
) -> None:
    # Revisão do #286: o título tem três trechos, mas nenhum curso nem campus.
    titulo = "SiSU 2027 - Convocados - 1ª Chamada"
    cliente, pedidos = _cliente([(1, titulo, lista_pdf([Linha(nome_ficticio(0))]))])

    resultado = await run_ifal_round(
        _sessao([(7, nome_ficticio(0))]), cliente, _sem_espera
    )

    assert any(p.url.path.endswith("/1/download") for p in pedidos)
    assert resultado.matches_created == 1
    assert indicios == [(7, "Sistemas de Informação", PROCESSO, titulo)]


async def test_documento_que_nao_e_convocacao_nem_e_baixado(
    indicios: list[tuple[int, str, str, str]],
) -> None:
    lista = lista_pdf([Linha(nome_ficticio(0))])
    cliente, pedidos = _cliente(
        [
            (1, "Edital de Abertura", None),
            (2, "Lista de Espera - Candidatos em ordem alfabética", None),
            (3, "Resultado Final - Classificados - Química - Maceió", None),
            (
                4,
                "Resultado Final - Classificados - Sistemas de Informação - Maceió",
                lista,
            ),
        ]
    )

    resultado = await run_ifal_round(
        _sessao([(1, nome_ficticio(0))]), cliente, _sem_espera
    )

    baixados = [p.url.path for p in pedidos if p.url.path.endswith("/download")]
    assert baixados == [f"/api/selecoes/{SELECAO}/documentos/4/download"]
    assert resultado.queries == 2
    assert len(indicios) == 1


async def test_uma_requisicao_a_cada_2_segundos_com_nome_de_robo() -> None:
    linhas = [Linha(nome_ficticio(0))]
    cliente, pedidos = _cliente(
        [
            (1, CLASSIFICADOS, lista_pdf(linhas)),
            (
                2,
                "Edital de Convocação para a Matrícula em 1ª Chamada",
                lista_pdf(linhas),
            ),
        ]
    )
    esperas: list[float] = []

    async def esperar(segundos: float) -> None:
        esperas.append(segundos)

    resultado = await run_ifal_round(_sessao([]), cliente, esperar)

    assert resultado.queries == len(pedidos) == 3
    assert esperas == [settings.list_search_interval_seconds] * 2
    assert settings.list_search_interval_seconds >= 2
    assert {p.headers["user-agent"] for p in pedidos} == {ROBOT_USER_AGENT}
    assert "@" not in ROBOT_USER_AGENT


async def test_mesma_rodada_duas_vezes_nao_duplica(
    indicios: list[tuple[int, str, str, str]],
) -> None:
    pdf = lista_pdf([Linha(nome_ficticio(0))])
    meninas = [(1, nome_ficticio(0))]

    cliente, _ = _cliente([(1, CLASSIFICADOS, pdf)])
    primeira = await run_ifal_round(_sessao(meninas), cliente, _sem_espera)
    cliente, _ = _cliente([(1, CLASSIFICADOS, pdf)])
    segunda = await run_ifal_round(_sessao(meninas), cliente, _sem_espera)

    assert (primeira.matches_created, segunda.matches_created) == (1, 0)
    assert len(indicios) == 1


async def test_nao_gera_indicio_para_quem_ja_tem_algo_da_chamada(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Com o create_match de verdade: o banco diz que ela já tem indício,
    # aprovação, ingresso ou a marca de dispensado para essa chamada.
    async def lista(*_: object) -> OfficialList:
        return OfficialList(id=7, institution="IFAL", call=CLASSIFICADOS)

    monkeypatch.setattr(search, "_official_list", lista)
    sessao_falsa = _sessao([(1, nome_ficticio(0))])
    sessao_falsa.scalar.return_value = True
    cliente, _ = _cliente([(1, CLASSIFICADOS, lista_pdf([Linha(nome_ficticio(0))]))])

    resultado = await run_ifal_round(sessao_falsa, cliente, _sem_espera)

    assert resultado.matches_created == 0
    assert not any(isinstance(item, ListMatch) for item in _gravado(sessao_falsa))


async def test_convocacao_vira_aprovacao_nunca_ingresso(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    chamada = OfficialList(
        id=7,
        institution="IFAL",
        selection_process=PROCESSO,
        call=CLASSIFICADOS,
        url="https://ifal.exemplo.test/lista.pdf",
    )

    async def lista(*_: object) -> OfficialList:
        return chamada

    monkeypatch.setattr(search, "_official_list", lista)
    sessao_falsa = _sessao([(3, nome_ficticio(0))])
    # O lock da rodada, a checagem de create_match (nada da chamada) e, com o
    # e-mail do #275, a conta da menina (nenhuma: não entra e-mail na fila).
    sessao_falsa.scalar.side_effect = [True, False, None]
    cliente, _ = _cliente([(1, CLASSIFICADOS, lista_pdf([Linha(nome_ficticio(0))]))])

    await run_ifal_round(sessao_falsa, cliente, _sem_espera, AGORA)

    # A busca só cria o indício: nem aprovação, nem ingresso (RN-21, RN-22).
    gravado = _gravado(sessao_falsa)
    [indicio] = [item for item in gravado if isinstance(item, ListMatch)]
    assert not any(isinstance(item, Approval | Enrollment) for item in gravado)

    # "Sou eu" + "Ainda não" vira aprovação, não ingresso.
    indicio.id, indicio.official_list_id = 11, 7
    resposta = AsyncMock()
    resposta.scalar.return_value = indicio
    resposta.add = MagicMock()

    resultado = await answer_match(
        resposta, 3, 11, MatchAnswerIn(is_me=True, enrolled=False), AGORA
    )

    assert resultado is MatchResult.APPROVED
    [aprovacao] = _gravado(resposta)
    assert isinstance(aprovacao, Approval)
    assert aprovacao.institution == "IFAL"
    assert aprovacao.course == "Sistemas de Informação"


async def test_api_fora_do_ar_para_sem_gravar_nada(
    indicios: list[tuple[int, str, str, str]],
) -> None:
    def fora(request: httpx2.Request) -> httpx2.Response:
        raise httpx2.ConnectError("fora do ar", request=request)

    cliente, _ = _cliente([], listagem=fora)
    sessao_falsa = _sessao([(1, nome_ficticio(0))])

    with pytest.raises(ReportUnavailableError):
        await run_ifal_round(sessao_falsa, cliente, _sem_espera)

    sessao_falsa.add.assert_not_called()
    sessao_falsa.commit.assert_not_called()


@pytest.mark.parametrize(
    "corpo", [{"erro": "manutenção"}, [{"codigo": 1}], "não é json"]
)
async def test_listagem_num_formato_novo_para_sem_gravar_nada(corpo: object) -> None:
    def listagem(_: httpx2.Request) -> httpx2.Response:
        if isinstance(corpo, str):
            return httpx2.Response(200, text=corpo)
        return httpx2.Response(200, json=corpo)

    cliente, _ = _cliente([], listagem=listagem)
    sessao_falsa = _sessao([])

    with pytest.raises(ReportFormatError):
        await run_ifal_round(sessao_falsa, cliente, _sem_espera)

    sessao_falsa.commit.assert_not_called()


async def test_pdf_imagem_no_meio_da_rodada_para_sem_gravar_nada(
    indicios: list[tuple[int, str, str, str]],
) -> None:
    # O 1º PDF acha a menina; o 2º é uma imagem.
    cliente, _ = _cliente(
        [
            (1, CLASSIFICADOS, lista_pdf([Linha(nome_ficticio(0))])),
            (2, "Edital de Convocação em 1ª Chamada", pdf_imagem()),
        ]
    )
    sessao_falsa = _sessao([(1, nome_ficticio(0))])

    with pytest.raises(ReportFormatError):
        await run_ifal_round(sessao_falsa, cliente, _sem_espera)

    assert indicios == []
    sessao_falsa.add.assert_not_called()
    sessao_falsa.commit.assert_not_called()


async def test_resposta_que_nao_e_pdf_para_a_rodada() -> None:
    cliente, _ = _cliente([(1, CLASSIFICADOS, b"<html>login</html>")], tipo="text/html")

    with pytest.raises(ReportFormatError):
        await run_ifal_round(_sessao([]), cliente, _sem_espera)


async def test_pdf_grande_demais_para_sem_ler_tudo(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    pdf = lista_pdf([Linha(nome_ficticio(i)) for i in range(200)])
    monkeypatch.setattr(settings, "ifal_max_pdf_bytes", len(pdf) - 1)
    cliente, _ = _cliente([(1, CLASSIFICADOS, pdf)])
    sessao_falsa = _sessao([])

    with pytest.raises(ReportFormatError):
        await run_ifal_round(sessao_falsa, cliente, _sem_espera)

    sessao_falsa.commit.assert_not_called()


async def test_listagem_com_20_itens_avisa_que_pode_estar_cortada(
    caplog: pytest.LogCaptureFixture,
) -> None:
    documentos: list[Documento] = [(i, f"Edital {i}", None) for i in range(LISTING_CAP)]
    cliente, _ = _cliente(documentos)

    with caplog.at_level(logging.WARNING):
        await run_ifal_round(_sessao([]), cliente, _sem_espera)

    assert "pode estar cortada" in caplog.text


async def test_documento_invisivel_e_ignorado() -> None:
    def listagem(_: httpx2.Request) -> httpx2.Response:
        corpo = [{"id": 1, "nome": CLASSIFICADOS, "visivel": False}]
        return httpx2.Response(200, content=json.dumps(corpo).encode())

    cliente, pedidos = _cliente([], listagem=listagem)

    resultado = await run_ifal_round(_sessao([]), cliente, _sem_espera)

    assert resultado.queries == len(pedidos) == 1


# --- Rota do agendador e script "Buscar agora" -------------------------------


async def test_rota_agendada_roda_o_ifal(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.db.engine import get_session
    from app.modules.admissions import cron

    monkeypatch.setattr(settings, "cron_secret", "segredo-de-teste")
    rodadas: list[str] = []

    async def rodada(*_: object) -> search.RoundResult:
        rodadas.append("ifal")
        return search.RoundResult(queries=3, rows_read=120, matches_created=1)

    async def sessao() -> object:
        yield AsyncMock()

    monkeypatch.setattr(cron, "run_ifal_round", rodada)
    app.dependency_overrides[get_session] = sessao
    try:
        async with httpx2.AsyncClient(
            transport=httpx2.ASGITransport(app=app), base_url="http://teste"
        ) as client:
            headers = {"Authorization": "Bearer segredo-de-teste"}
            ok = await client.get(
                "/api/cron/official-lists?source=ifal", headers=headers
            )
            curso = await client.get(
                "/api/cron/official-lists?source=ifal&course=6", headers=headers
            )
    finally:
        app.dependency_overrides.clear()

    assert ok.status_code == 200
    assert ok.json() == {"queries": 3, "rows_read": 120, "matches_created": 1}
    assert rodadas == ["ifal"]
    # "course" é só da COPEVE.
    assert curso.status_code == 422


async def test_rota_agendada_sem_selecao_do_ifal_da_409_sem_gravar(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from app.db.engine import get_session
    from app.modules.admissions import cron

    monkeypatch.setattr(settings, "cron_secret", "segredo-de-teste")
    monkeypatch.setattr(settings, "ifal_selections", {})
    rodada = AsyncMock()
    sessao_falsa = AsyncMock()
    sessao_falsa.add = MagicMock()

    async def sessao() -> object:
        yield sessao_falsa

    monkeypatch.setattr(cron, "run_ifal_round", rodada)
    app.dependency_overrides[get_session] = sessao
    try:
        async with httpx2.AsyncClient(
            transport=httpx2.ASGITransport(app=app), base_url="http://teste"
        ) as client:
            resposta = await client.get(
                "/api/cron/official-lists?source=ifal",
                headers={"Authorization": "Bearer segredo-de-teste"},
            )
    finally:
        app.dependency_overrides.clear()

    assert resposta.status_code == 409
    rodada.assert_not_awaited()
    sessao_falsa.add.assert_not_called()


@pytest.mark.parametrize(
    "erro", [IndexError, AttributeError, RecursionError, KeyError, ValueError]
)
def test_pdf_malformado_vira_formato_novo_e_nao_erro_500(
    monkeypatch: pytest.MonkeyPatch, erro: type[Exception]
) -> None:
    from app.modules.admissions import ifal

    def quebra(*_: object, **__: object) -> None:
        raise erro("pdf malformado")

    monkeypatch.setattr(ifal, "PdfReader", quebra)

    with pytest.raises(ReportFormatError):
        parse_convocation(lista_pdf([Linha(nome_ficticio(0))]), CLASSIFICADOS, [ALVO])


async def test_mesma_menina_em_dois_cursos_da_chamada_grava_sempre_o_mesmo(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Revisão do #286: sem o curso na ordem, o curso gravado dependia do set.
    gravados: list[str] = []

    async def lista(*_: object) -> OfficialList:
        return OfficialList(
            institution="IFAL", selection_process="x", call="y", url="u"
        )

    async def criar(_s: object, _g: int, _l: object, course: str, *_: object) -> object:
        gravados.append(course)
        return object()

    monkeypatch.setattr(search, "_official_list", lista)
    monkeypatch.setattr(search, "create_match", criar)
    achados = [
        search._Found(1, "SiSU", "1ª", "https://b", curso, CourseLevel.GRADUACAO)
        for curso in ("Sistemas de Informação", "Ciência da Computação")
    ]
    sessao_falsa = _sessao([])

    for ordem in (achados, list(reversed(achados))):
        await search._save_matches(sessao_falsa, "IFAL", ordem, AGORA)

    assert gravados == ["Ciência da Computação", "Ciência da Computação"]


class _Sessao:
    async def __aenter__(self) -> object:
        return object()

    async def __aexit__(self, *_: object) -> None:
        return None


async def test_script_roda_o_ifal_e_imprime_so_contagens(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    from scripts import buscar_listas

    async def rodada(*_: object) -> search.RoundResult:
        return search.RoundResult(queries=3, rows_read=120, matches_created=1)

    monkeypatch.setattr(buscar_listas, "run_ifal_round", rodada)
    monkeypatch.setattr(buscar_listas, "SessionLocal", _Sessao)
    monkeypatch.setattr(buscar_listas, "engine", AsyncMock())

    codigo = await buscar_listas.main([], expire=False, sources=["ifal"])

    assert codigo == 0
    assert capsys.readouterr().out.splitlines() == [
        "IFAL",
        "  Consultas: 3",
        "  Linhas lidas: 120",
        "  Indícios novos: 1",
    ]


async def test_script_sem_selecao_configurada_nao_busca_no_ifal(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    from scripts import buscar_listas

    rodada = AsyncMock()
    monkeypatch.setattr(settings, "ifal_selections", {})
    monkeypatch.setattr(buscar_listas, "run_ifal_round", rodada)
    monkeypatch.setattr(buscar_listas, "SessionLocal", _Sessao)
    monkeypatch.setattr(buscar_listas, "engine", AsyncMock())

    assert await buscar_listas.main([], expire=False, sources=["ifal"]) == 0
    rodada.assert_not_called()
    assert "Nenhuma seleção configurada" in capsys.readouterr().out


async def test_script_para_sem_gravar_quando_o_pdf_muda(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    from scripts import buscar_listas

    async def rodada(*_: object) -> search.RoundResult:
        raise ReportFormatError

    monkeypatch.setattr(buscar_listas, "run_ifal_round", rodada)
    monkeypatch.setattr(buscar_listas, "SessionLocal", _Sessao)
    monkeypatch.setattr(buscar_listas, "engine", AsyncMock())

    assert await buscar_listas.main([], expire=False, sources=["ifal"]) == 1
    assert "Nada foi gravado" in capsys.readouterr().out
