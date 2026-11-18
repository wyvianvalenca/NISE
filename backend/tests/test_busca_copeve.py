"""Busca na COPEVE (#273), com a página fictícia do spike (#272).

Nenhum dado real: todos os nomes são gerados em tests/copeve_ficticio.py.
"""

import logging
from collections.abc import Callable
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock

import httpx2
import pytest

from app.config import settings
from app.main import app
from app.modules.admissions import search
from app.modules.admissions.copeve import (
    DEMANDS,
    ROBOT_USER_AGENT,
    TARGET_COURSES,
    ReportFormatError,
    ReportUnavailableError,
    parse_report,
)
from app.modules.admissions.models import ListSearchRun, OfficialList
from app.modules.admissions.search import run_copeve_round
from tests.copeve_ficticio import HEADER, Linha, nome_ficticio, pagina

FIXTURE = Path(__file__).parent / "fixtures" / "copeve_resultado_ficticio.html"
CHAMADA = "1ª chamada"


# --- Leitura da página -------------------------------------------------------


def test_fixture_do_spike_le_so_quem_foi_chamado() -> None:
    report = parse_report(FIXTURE.read_text(encoding="utf-8"))

    assert report.rows_read == 6
    # Só as 3 linhas com chamada; as de lista de espera ficam de fora.
    assert [item.call for item in report.called] == [CHAMADA] * 3
    assert report.called[0].name == "ana clara lima da ficticia"


def test_quem_esta_em_outra_modalidade_nao_conta_aqui() -> None:
    html = pagina(
        [
            Linha(
                nome_ficticio(0), CHAMADA, "Classificado em outra modalidade de cota"
            ),
            Linha(nome_ficticio(1), CHAMADA, "Matrícula Institucional realizada"),
        ]
    )

    assert [item.name for item in parse_report(html).called] == [
        "beatriz clara lima da ficticia"
    ]


def test_le_so_nome_e_chamada() -> None:
    # Inscrição no ENEM, nota, classificação e modalidade nunca saem daqui (RN-23).
    report = parse_report(pagina([Linha(nome_ficticio(0), CHAMADA)]))

    assert set(vars(report.called[0])) == {"name", "call"}


@pytest.mark.parametrize("coluna", ["Nome", "Chamada", "Status"])
def test_coluna_renomeada_para_a_rodada(coluna: str) -> None:
    cabecalho = [c if c != coluna else f"{coluna} (novo)" for c in HEADER]

    with pytest.raises(ReportFormatError):
        parse_report(pagina([Linha(nome_ficticio(0), CHAMADA)], cabecalho))


def test_pagina_sem_tabela_para_a_rodada() -> None:
    with pytest.raises(ReportFormatError):
        parse_report("<html><body>Manutenção</body></html>")


def test_chamada_num_formato_novo_para_a_rodada() -> None:
    with pytest.raises(ReportFormatError):
        parse_report(pagina([Linha(nome_ficticio(0), "Chamada extra")]))


# --- Rodada ------------------------------------------------------------------


def _cliente(
    paginas: Callable[[int, int], str] | None = None, falha: bool = False
) -> tuple[httpx2.AsyncClient, list[httpx2.Request]]:
    pedidos: list[httpx2.Request] = []

    def responder(request: httpx2.Request) -> httpx2.Response:
        pedidos.append(request)
        if falha:
            raise httpx2.ConnectError("fora do ar", request=request)
        campos = dict(item.split("=") for item in request.content.decode().split("&"))
        curso, demanda = int(campos["idCurso"]), int(campos["demanda"])
        html = paginas(curso, demanda) if paginas else pagina([])
        return httpx2.Response(200, text=html)

    return httpx2.AsyncClient(transport=httpx2.MockTransport(responder)), pedidos


def _sessao(meninas: list[tuple[int, str]]) -> AsyncMock:
    sessao_falsa = AsyncMock()
    sessao_falsa.execute.return_value = meninas
    sessao_falsa.add = MagicMock()
    return sessao_falsa


@pytest.fixture
def indicios(monkeypatch: pytest.MonkeyPatch) -> list[tuple[int, str, str]]:
    """Troca a gravação dos indícios (já testada na #270) por uma lista."""
    criados: list[tuple[int, str, str]] = []

    async def lista(_session: object, call: str) -> OfficialList:
        return OfficialList(
            institution="UFAL", selection_process="Sisu 2026", call=call
        )

    async def criar(
        _session: object,
        girl_id: int,
        official_list: OfficialList,
        course: str,
        *_: object,
    ) -> object:
        criados.append((girl_id, course, official_list.call))
        return object()

    monkeypatch.setattr(search, "_official_list", lista)
    monkeypatch.setattr(search, "create_match", criar)
    return criados


async def _sem_espera(_: float) -> None:
    return None


async def test_500_linhas_com_3_meninas_geram_3_indicios_e_nada_dos_outros(
    indicios: list[tuple[int, str, str]], caplog: pytest.LogCaptureFixture
) -> None:
    linhas = [Linha(nome_ficticio(i), CHAMADA) for i in range(500)]
    # As contas das 3 meninas, com acento, maiúsculas e espaços diferentes.
    meninas = [
        (1, "Ana Clára Lima da Fictícia"),
        (2, "  BEATRIZ CLARA LIMA DA FICTICIA "),
        (3, "carla clara lima da ficticia"),
        (4, "Uma Menina Que Nao Esta Na Lista"),
    ]
    cliente, _ = _cliente(
        lambda curso, demanda: pagina(linhas) if demanda == 0 else pagina([])
    )
    sessao_falsa = _sessao(meninas)

    with caplog.at_level(logging.DEBUG):
        resultado = await run_copeve_round(sessao_falsa, cliente, [6], _sem_espera)

    assert resultado.matches_created == 3
    assert resultado.rows_read == 500
    assert sorted(girl for girl, _, _ in indicios) == [1, 2, 3]
    assert {course for _, course, _ in indicios} == {"Ciência da Computação"}

    # As outras 497 pessoas não aparecem em nada que foi gravado nem nos logs.
    [rodada] = [c.args[0] for c in sessao_falsa.add.call_args_list]
    assert isinstance(rodada, ListSearchRun)
    gravado = repr(vars(rodada)) + caplog.text
    for i in range(3, 500):
        assert nome_ficticio(i) not in gravado
        assert nome_ficticio(i).lower() not in gravado
    sessao_falsa.commit.assert_awaited_once()


async def test_nome_parcial_nao_gera_indicio(
    indicios: list[tuple[int, str, str]],
) -> None:
    # "Maria Santos" não é "Maria Eduarda Santos" (RF-F31.03).
    cliente, _ = _cliente(lambda c, d: pagina([Linha("Maria Eduarda Santos", CHAMADA)]))

    await run_copeve_round(_sessao([(1, "Maria Santos")]), cliente, [6], _sem_espera)

    assert indicios == []


async def test_consulta_so_cursos_alvo_em_cada_demanda_um_por_vez() -> None:
    cliente, pedidos = _cliente()
    esperas: list[float] = []

    async def esperar(segundos: float) -> None:
        esperas.append(segundos)

    resultado = await run_copeve_round(
        _sessao([]), cliente, list(TARGET_COURSES), esperar
    )

    consultas = {
        tuple(item.split("=")[1] for item in p.content.decode().split("&"))
        for p in pedidos
    }
    assert resultado.queries == len(pedidos) == 6 * 9
    assert consultas == {(str(c), str(d)) for c in TARGET_COURSES for d in DEMANDS}
    # Uma espera de 2 s entre cada par de consultas (RNF-F31.05).
    assert esperas == [settings.list_search_interval_seconds] * (len(pedidos) - 1)
    assert settings.list_search_interval_seconds >= 2
    # Nome genérico, sem contato pessoal.
    assert {p.headers["user-agent"] for p in pedidos} == {ROBOT_USER_AGENT}
    assert "@" not in ROBOT_USER_AGENT


async def test_curso_fora_dos_alvos_e_recusado() -> None:
    cliente, pedidos = _cliente()

    with pytest.raises(ValueError):
        await run_copeve_round(_sessao([]), cliente, [52], _sem_espera)

    assert pedidos == []


async def test_mesma_menina_em_duas_demandas_gera_um_indicio(
    indicios: list[tuple[int, str, str]],
) -> None:
    cliente, _ = _cliente(lambda c, d: pagina([Linha(nome_ficticio(0), CHAMADA)]))

    await run_copeve_round(_sessao([(1, nome_ficticio(0))]), cliente, [6], _sem_espera)

    assert indicios == [(1, "Ciência da Computação", CHAMADA)]


async def test_servidor_fora_do_ar_para_sem_gravar_nada(
    indicios: list[tuple[int, str, str]],
) -> None:
    cliente, _ = _cliente(falha=True)
    sessao_falsa = _sessao([(1, nome_ficticio(0))])

    with pytest.raises(ReportUnavailableError):
        await run_copeve_round(sessao_falsa, cliente, [6], _sem_espera)

    assert indicios == []
    sessao_falsa.add.assert_not_called()
    sessao_falsa.commit.assert_not_called()


async def test_formato_novo_no_meio_da_rodada_para_sem_gravar_nada(
    indicios: list[tuple[int, str, str]],
) -> None:
    # A 1ª demanda acha a menina; a 2ª vem com a coluna renomeada.
    def paginas(curso: int, demanda: int) -> str:
        if demanda == 0:
            return pagina([Linha(nome_ficticio(0), CHAMADA)])
        return pagina([], [c.replace("Status", "Situação") for c in HEADER])

    cliente, _ = _cliente(paginas)
    sessao_falsa = _sessao([(1, nome_ficticio(0))])

    with pytest.raises(ReportFormatError):
        await run_copeve_round(sessao_falsa, cliente, [6], _sem_espera)

    assert indicios == []
    sessao_falsa.commit.assert_not_called()


async def test_compara_so_meninas_com_conta() -> None:
    sessao_falsa = _sessao([])
    cliente, _ = _cliente()

    await run_copeve_round(sessao_falsa, cliente, [6], _sem_espera)

    statement = sessao_falsa.execute.call_args.args[0]
    assert "girls.user_id IS NOT NULL" in str(statement)


# --- Rotas do agendador ------------------------------------------------------


@pytest.fixture
def segredo(monkeypatch: pytest.MonkeyPatch) -> str:
    monkeypatch.setattr(settings, "cron_secret", "segredo-de-teste")
    return "segredo-de-teste"


async def _cron(url: str, cabecalho: str | None) -> httpx2.Response:
    from app.db.engine import get_session

    async def sessao() -> object:
        yield AsyncMock()

    app.dependency_overrides[get_session] = sessao
    try:
        async with httpx2.AsyncClient(
            transport=httpx2.ASGITransport(app=app), base_url="http://teste"
        ) as client:
            headers = {"Authorization": cabecalho} if cabecalho else {}
            return await client.get(url, headers=headers)
    finally:
        app.dependency_overrides.clear()


@pytest.mark.parametrize("cabecalho", [None, "Bearer errado", "segredo-de-teste"])
async def test_rota_agendada_sem_o_segredo_e_recusada(
    segredo: str, cabecalho: str | None
) -> None:
    for url in ("/api/cron/official-lists", "/api/cron/expire-matches"):
        response = await _cron(url, cabecalho)
        assert response.status_code == 401, url


async def test_sem_segredo_configurado_recusa_tudo(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "cron_secret", "")

    response = await _cron("/api/cron/official-lists", "Bearer ")

    assert response.status_code == 401


async def test_rota_agendada_com_o_segredo_roda_um_curso(
    segredo: str, monkeypatch: pytest.MonkeyPatch
) -> None:
    from app.modules.admissions import cron

    cursos: list[list[int]] = []

    async def rodada(_s: object, _c: object, courses: list[int]) -> search.RoundResult:
        cursos.append(courses)
        return search.RoundResult(queries=9, rows_read=40, matches_created=1)

    monkeypatch.setattr(cron, "run_copeve_round", rodada)

    response = await _cron("/api/cron/official-lists?course=6", f"Bearer {segredo}")

    assert response.status_code == 200
    assert response.json() == {"queries": 9, "rows_read": 40, "matches_created": 1}
    assert cursos == [[6]]


async def test_rodada_que_para_responde_502(
    segredo: str, monkeypatch: pytest.MonkeyPatch
) -> None:
    from app.modules.admissions import cron

    async def rodada(*_: object) -> search.RoundResult:
        raise ReportFormatError

    monkeypatch.setattr(cron, "run_copeve_round", rodada)

    response = await _cron("/api/cron/official-lists", f"Bearer {segredo}")

    assert response.status_code == 502


async def test_rotina_diaria_apaga_vencidos(
    segredo: str, monkeypatch: pytest.MonkeyPatch
) -> None:
    from app.modules.admissions import cron

    async def apagar(_s: object) -> int:
        return 4

    monkeypatch.setattr(cron, "delete_expired_matches", apagar)

    response = await _cron("/api/cron/expire-matches", f"Bearer {segredo}")

    assert response.json() == {"deleted": 4}


# --- Script "Buscar agora" ---------------------------------------------------


async def test_script_imprime_so_contagens(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    from scripts import buscar_listas

    async def rodada(*_: object) -> search.RoundResult:
        return search.RoundResult(queries=54, rows_read=900, matches_created=2)

    class Sessao:
        async def __aenter__(self) -> object:
            return object()

        async def __aexit__(self, *_: object) -> None:
            return None

    monkeypatch.setattr(buscar_listas, "run_copeve_round", rodada)
    monkeypatch.setattr(buscar_listas, "SessionLocal", Sessao)
    monkeypatch.setattr(buscar_listas, "engine", AsyncMock())

    codigo = await buscar_listas.main(list(TARGET_COURSES), expire=False)

    assert codigo == 0
    assert capsys.readouterr().out.splitlines() == [
        "Consultas: 54",
        "Linhas lidas: 900",
        "Indícios novos: 2",
    ]


async def test_script_para_sem_gravar_quando_a_pagina_muda(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    from scripts import buscar_listas

    async def rodada(*_: object) -> search.RoundResult:
        raise ReportFormatError

    class Sessao:
        async def __aenter__(self) -> object:
            return object()

        async def __aexit__(self, *_: object) -> None:
            return None

    monkeypatch.setattr(buscar_listas, "run_copeve_round", rodada)
    monkeypatch.setattr(buscar_listas, "SessionLocal", Sessao)

    assert await buscar_listas.main([6], expire=False) == 1
    assert "Nada foi gravado" in capsys.readouterr().out
