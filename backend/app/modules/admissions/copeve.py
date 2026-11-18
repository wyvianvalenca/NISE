"""Leitura do relatório de acompanhamento do Sisu/UFAL, da COPEVE (#272, #273).

O relatório é público: um formulário por curso e por modalidade de demanda. A
página é lida em memória, só três colunas são olhadas (Nome, Chamada e Status)
e ela é descartada logo depois. Nada daqui vai para o banco, os logs ou o
disco: quem chama recebe só nomes já normalizados e a chamada (RNF-F31.01).
"""

import re
from dataclasses import dataclass
from html.parser import HTMLParser

import httpx2

from app.modules.cities.utils import normalize_search

# Cursos-alvo (RF-F31.02). A chave é o valor do formulário, que é o número sem
# zeros: "6" no formulário é o curso "006" do rótulo.
TARGET_COURSES: dict[int, str] = {
    6: "Ciência da Computação",
    7: "Ciência da Computação",
    26: "Engenharia de Computação",
    27: "Engenharia de Computação",
    73: "Ciência da Computação",
    89: "Sistemas de Informação",
}

# Ampla concorrência (0) e as reservas de vagas (51 a 58), como no formulário.
DEMANDS: tuple[int, ...] = (0, 51, 52, 53, 54, 55, 56, 57, 58)

# Nome genérico, sem contato pessoal (RNF-F31.05).
ROBOT_USER_AGENT = "NISE-robo/1.0 (busca em listas oficiais)"

# Quem aparece de novo, na consulta da outra modalidade. Não gera indício aqui.
_OTHER_QUOTA = "classificado em outra modalidade"


class ReportFormatError(Exception):
    """A página não tem mais a tabela com Nome, Chamada e Status."""


class ReportUnavailableError(Exception):
    """A COPEVE não respondeu ou respondeu com erro."""


@dataclass(frozen=True)
class CalledName:
    """Um nome chamado na lista, já normalizado (RF-F31.03), e a chamada."""

    name: str
    call: str


@dataclass(frozen=True)
class Report:
    rows_read: int
    called: list[CalledName]


class _TableParser(HTMLParser):
    """Junta as linhas de todas as tabelas, cada uma como lista de células."""

    def __init__(self) -> None:
        super().__init__()
        self.rows: list[list[str]] = []
        self._row: list[str] | None = None
        self._cell: list[str] | None = None

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag == "tr":
            self._row = []
        elif tag in ("td", "th") and self._row is not None:
            self._cell = []
        elif tag == "br" and self._cell is not None:
            # "Inscrição<br>no ENEM": sem o espaço, as palavras grudam.
            self._cell.append(" ")

    def handle_endtag(self, tag: str) -> None:
        if tag in ("td", "th") and self._row is not None and self._cell is not None:
            self._row.append(" ".join("".join(self._cell).split()))
            self._cell = None
        elif tag == "tr" and self._row is not None:
            self.rows.append(self._row)
            self._row = None

    def handle_data(self, data: str) -> None:
        if self._cell is not None:
            self._cell.append(data)


def _column(header: list[str], wanted: str) -> int:
    for index, cell in enumerate(header):
        if normalize_search(cell) == wanted:
            return index
    raise ReportFormatError


def parse_report(html: str) -> Report:
    """Lê uma página do relatório e devolve só quem foi chamado.

    Uma linha gera nome chamado quando tem a coluna Chamada preenchida e não é
    "Classificado em outra modalidade de cota". Inscrição no ENEM, nota,
    classificação e modalidade nunca são lidas (RN-23). Sem a linha de
    cabeçalho com Nome, Chamada e Status, levanta ReportFormatError
    (RNF-F31.04).
    """
    parser = _TableParser()
    parser.feed(html)

    header_index = next(
        (
            index
            for index, row in enumerate(parser.rows)
            if {"nome", "chamada", "status"} <= {normalize_search(c) for c in row}
        ),
        None,
    )
    if header_index is None:
        raise ReportFormatError

    header = parser.rows[header_index]
    name_col = _column(header, "nome")
    call_col = _column(header, "chamada")
    status_col = _column(header, "status")
    width = len(header)

    rows = [row for row in parser.rows[header_index + 1 :] if len(row) == width]
    called = [
        CalledName(name=normalize_search(row[name_col]), call=row[call_col])
        for row in rows
        if row[call_col] and _OTHER_QUOTA not in normalize_search(row[status_col])
    ]

    for item in called:
        if not item.name or not re.fullmatch(r"\d+ª chamada", item.call):
            # Nome vazio ou chamada num formato novo: melhor parar que errar.
            raise ReportFormatError

    return Report(rows_read=len(rows), called=called)


async def fetch_report(
    client: httpx2.AsyncClient, url: str, course: int, demand: int
) -> str:
    """Uma consulta do formulário (curso e demanda). Não grava nada."""
    try:
        response = await client.post(
            url,
            data={"idCurso": str(course), "demanda": str(demand)},
            headers={"User-Agent": ROBOT_USER_AGENT},
        )
        response.raise_for_status()
    except httpx2.HTTPError as error:
        raise ReportUnavailableError from error

    return response.text
