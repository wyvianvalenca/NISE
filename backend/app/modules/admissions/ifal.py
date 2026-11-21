"""Leitura das listas de convocação do IFAL, publicadas em PDF (#274).

A API pública do IFAL lista os documentos de cada seleção. Só os que, pelo
título, são listas de convocação são baixados (RF-F31.12). O PDF é lido em
memória, com um limite de tamanho, e descartado: não há arquivo temporário e
nada daqui vai para o banco, os logs ou o disco. Quem chama recebe só os nomes
dos cursos-alvo, já normalizados (RF-F31.05, RNF-F31.01).

O layout é o que o spike (#274) achou: curso e campus no topo da página (e,
às vezes, no título do documento), uma linha de cabeçalho com "Nome" e um
candidato por linha. O pypdf, no modo "layout", mantém as colunas na ordem
visual, separadas por dois ou mais espaços.
"""

import io
import logging
import re
from collections.abc import Sequence
from dataclasses import dataclass

import httpx2
from pypdf import PdfReader

from app.modules.admissions.copeve import (
    ROBOT_USER_AGENT,
    ReportFormatError,
    ReportUnavailableError,
)
from app.modules.cities.utils import normalize_search

# Só contagens, nunca um nome (RNF-F31.01). O pypdf avisa por logging sobre
# PDFs malformados; esses avisos não levam texto das páginas.
logger = logging.getLogger(__name__)

# As listagens do spike vieram com no máximo 20 itens, sem paginação.
LISTING_CAP = 20

# Pelo título (normalizado), o que é lista de convocação ou de classificados
# (aprovação, RN-22), e o que não é: suplentes, lista de espera, resultados
# preliminares, retificações e editais.
_CONVOCATION = re.compile(r"\bclassificad[oa]s\b|\bconvoca(cao|dos|das)\b|\bchamada\b")
_NOT_CONVOCATION = re.compile(
    r"suplente|espera|desclassificad|eliminad|indeferid|preliminar|retifica|recurso"
)

# Os campi do IFAL, para reconhecer o "<curso> - <campus>" no fim de um título.
# Os campi dos cursos-alvo (IFAL_TARGET_COURSES) também contam.
IFAL_CAMPI = (
    "Arapiraca",
    "Batalha",
    "Benedito Bentes",
    "Coruripe",
    "Maceió",
    "Maragogi",
    "Marechal Deodoro",
    "Murici",
    "Palmeira dos Índios",
    "Penedo",
    "Piranhas",
    "Rio Largo",
    "Santana do Ipanema",
    "São Miguel dos Campos",
    "Satuba",
    "Viçosa",
)

# "curso" ou "campus" como palavra: "concurso", "recurso" e "percurso" não contam.
_COURSE_WORD = re.compile(r"\b(curso|campus)\b")
# Uma coluna que diz qual é o curso ou o campus começa pela palavra:
# "Curso: Química", "CAMPUS SATUBA". Uma frase que só cita a palavra
# ("Dúvidas sobre o curso: procure a coordenação") não diz.
_COURSE_LABEL = re.compile(r"^(curso|campus)\b")

# Duas colunas da página ficam separadas por dois ou mais espaços.
_COLUMNS = re.compile(r"\s{2,}")
# Um nome completo: só letras (com acento), espaço, apóstrofo, hífen e ponto.
_NAME = re.compile(r"[^\W\d_]+(?:[ '.-]+[^\W\d_]+)+")


@dataclass(frozen=True)
class TargetCourse:
    """Um curso-alvo do IFAL, como aparece no PDF (RF-F31.02)."""

    course: str
    campus: str

    def found_in(self, text: str) -> bool:
        normalized = normalize_search(text)
        return (
            normalize_search(self.course) in normalized
            and normalize_search(self.campus) in normalized
        )


@dataclass(frozen=True)
class Document:
    """Um documento da seleção: só o número e o título, que são públicos."""

    id: int
    title: str


@dataclass(frozen=True)
class ConvokedName:
    """Um nome da lista, já normalizado (RF-F31.03), e o curso-alvo dele."""

    name: str
    course: TargetCourse


@dataclass(frozen=True)
class ConvocationList:
    rows_read: int
    convoked: list[ConvokedName]


def is_convocation(title: str) -> bool:
    """Diz, pelo título, se o documento é uma lista de convocação (RF-F31.12)."""
    normalized = normalize_search(title)
    return bool(_CONVOCATION.search(normalized)) and not _NOT_CONVOCATION.search(
        normalized
    )


def is_other_course(title: str, targets: Sequence[TargetCourse]) -> bool:
    """Diz se o título é a lista de um curso que não é alvo.

    No SiSU, cada curso tem o seu PDF, com curso e campus no título:
    "Resultado Final - Classificados - <curso> - <campus>". Esses não precisam
    ser baixados. Só conta como curso no título quando o último trecho é um
    campus do IFAL: "SiSU 2027 - Convocados - 1ª Chamada" e "Resultado Final -
    2ª Chamada - Lista de Classificados" podem ter qualquer curso dentro, e são
    baixados.
    """
    segments = [normalize_search(part) for part in title.split(" - ")]
    campi = {normalize_search(campus) for campus in IFAL_CAMPI}
    campi |= {normalize_search(target.campus) for target in targets}
    names_a_course = len(segments) >= 3 and segments[-1] in campi
    return names_a_course and not any(target.found_in(title) for target in targets)


def _documents(payload: object) -> list[Document]:
    if not isinstance(payload, list):
        raise ReportFormatError
    documents = []
    for item in payload:
        if not isinstance(item, dict):
            raise ReportFormatError
        doc_id, title = item.get("id"), item.get("nome")
        if not isinstance(doc_id, int) or not isinstance(title, str):
            raise ReportFormatError
        if item.get("visivel", True) is False:
            continue
        documents.append(Document(id=doc_id, title=" ".join(title.split())))
    return documents


async def fetch_documents(
    client: httpx2.AsyncClient, api_url: str, selection: int
) -> list[Document]:
    """Os documentos de uma seleção. Uma requisição; não grava nada."""
    try:
        response = await client.get(
            f"{api_url}/selecoes/{selection}/documentos",
            headers={"User-Agent": ROBOT_USER_AGENT},
        )
        response.raise_for_status()
        payload = response.json()
    except httpx2.HTTPError as error:
        raise ReportUnavailableError from error
    except ValueError as error:
        # Não é JSON: a API mudou.
        raise ReportFormatError from error

    documents = _documents(payload)
    if len(payload) >= LISTING_CAP:
        # Pode ser que a API tenha cortado a lista (questão em aberto do spike).
        logger.warning(
            "IFAL: a seleção %s listou %s documentos; a lista pode estar cortada",
            selection,
            len(payload),
        )
    return documents


def download_url(api_url: str, selection: int, document: int) -> str:
    return f"{api_url}/selecoes/{selection}/documentos/{document}/download"


async def fetch_pdf(client: httpx2.AsyncClient, url: str, max_bytes: int) -> bytes:
    """Baixa um PDF para a memória, parando se passar de `max_bytes`.

    O corpo é lido aos pedaços, então um PDF grande demais não chega a ser
    carregado inteiro. Nada vai para o disco.
    """
    try:
        async with client.stream(
            "GET", url, headers={"User-Agent": ROBOT_USER_AGENT}
        ) as response:
            response.raise_for_status()
            content_type = response.headers.get("content-type", "")
            if "application/pdf" not in content_type:
                raise ReportFormatError
            declared = response.headers.get("content-length")
            if declared and declared.isdigit() and int(declared) > max_bytes:
                raise ReportFormatError
            data = bytearray()
            async for chunk in response.aiter_bytes():
                data += chunk
                if len(data) > max_bytes:
                    raise ReportFormatError
    except httpx2.HTTPError as error:
        raise ReportUnavailableError from error

    return bytes(data)


def _cells(line: str) -> list[str]:
    # O asterisco que aparece depois de alguns nomes não faz parte do nome.
    return [cell.strip(" *") for cell in _COLUMNS.split(line.strip())]


def _is_header(cells: list[str]) -> bool:
    return any(normalize_search(cell).startswith("nome") for cell in cells)


def _section_course(
    lines: list[str], targets: Sequence[TargetCourse]
) -> tuple[bool, TargetCourse | None]:
    """Se o texto antes de um cabeçalho ou candidato diz de qual curso é o trecho.

    Devolve (diz, curso-alvo). Diz quando nomeia um curso-alvo ou tem uma linha
    de curso ou campus ("Curso: Química"); aí o curso-alvo é None se o curso
    não é alvo. Um texto que só cita a palavra ("Recurso: prazo de 2 dias",
    "CONCURSO SISU 2027", "Dúvidas sobre o curso") não diz nada, e o trecho
    continua no curso de antes.
    """
    text = " ".join(lines)
    if not _COURSE_WORD.search(normalize_search(text)):
        return False, None
    target = next((t for t in targets if t.found_in(text)), None)
    if target is not None:
        return True, target
    labeled = any(
        _COURSE_LABEL.match(normalize_search(cell))
        for line in lines
        for cell in _cells(line)
    )
    return labeled, None


def parse_convocation(
    pdf: bytes, title: str, targets: Sequence[TargetCourse]
) -> ConvocationList:
    """Lê um PDF de convocação e devolve só os nomes dos cursos-alvo.

    O curso de cada trecho vem do texto antes dele (o topo da página ou um
    subtítulo com "Curso" ou "Campus"); sem isso, vale o título do documento.
    Número de inscrição, posição, concorrência e nota nunca são lidos (RN-23).
    Levanta ReportFormatError se o PDF não abre, não tem texto (é imagem), não
    tem a linha de cabeçalho com Nome, ou uma linha de candidato não cabe nas
    colunas (RNF-F31.04).
    """
    try:
        reader = PdfReader(io.BytesIO(pdf))
        pages = [page.extract_text(extraction_mode="layout") for page in reader.pages]
    except Exception as error:
        # Num PDF malformado o pypdf levanta de tudo (PyPdfError, IndexError,
        # RecursionError, erros do zlib e do struct...). Qualquer um é "o
        # formato mudou": a rodada para com 502, sem gravar nada, e não com 500.
        raise ReportFormatError from error

    current = next((target for target in targets if target.found_in(title)), None)
    # (número de colunas, coluna do nome), da última linha de cabeçalho.
    header: tuple[int, int] | None = None
    context: list[str] = []
    rows_read = 0
    convoked: list[ConvokedName] = []

    for line in "\n".join(pages).splitlines():
        if not line.strip():
            continue
        cells = _cells(line)
        is_header = _is_header(cells)
        # Uma linha de candidato tem mais de uma célula: o número da página
        # sozinho no rodapé ("1") também começa com dígito e não é candidato.
        is_row = header is not None and len(cells) > 1 and cells[0].isdigit()
        if not is_header and not is_row:
            context.append(line)
            continue

        # Um cabeçalho ou candidato depois de um texto que diz o curso ou o
        # campus: começou o trecho de outro curso, que pode não ser alvo.
        if context:
            names_course, target = _section_course(context, targets)
            if names_course:
                current = target
        context = []

        if is_header or header is None:
            name_col = next(
                i for i, c in enumerate(cells) if normalize_search(c).startswith("nome")
            )
            header = (len(cells), name_col)
            continue

        width, name_col = header
        if len(cells) != width or not _NAME.fullmatch(cells[name_col]):
            # Colunas grudadas ou deslocadas: melhor parar que errar.
            raise ReportFormatError
        rows_read += 1
        if current is not None:
            convoked.append(
                ConvokedName(name=normalize_search(cells[name_col]), course=current)
            )

    if header is None or rows_read == 0:
        # Sem cabeçalho ou sem nenhum candidato: imagem ou layout novo.
        raise ReportFormatError

    return ConvocationList(rows_read=rows_read, convoked=convoked)
