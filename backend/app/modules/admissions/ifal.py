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

Os documentos reais de matrícula do IFAL Maceió têm outro layout: o cabeçalho é
"Candidato | Cota | Situação | Motivo | Entregou Declaração" (o número e o nome
ficam sob "Candidato"), vários cursos por página, a linha do curso sem a palavra
"curso" e o motivo quebrado em várias linhas. O leitor aceita os dois.
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
    r"suplente|espera|desclassificad|eliminad|indeferid|preliminar|retificacao|recurso"
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
# Uma coluna que diz qual é o curso ou o campus começa pela palavra, às vezes
# depois do número do item: "Curso: Química", "CAMPUS SATUBA", "1.2 Curso:
# Agronomia". Uma frase que só cita a palavra ("Dúvidas sobre o curso: procure
# a coordenação") não diz.
_COURSE_LABEL = re.compile(r"^(\d+(\.\d+)*\.?\s+)?(curso|campus)\b")
# "Curso de Agronomia", "Curso em ...": a palavra seguida do nome do curso.
_COURSE_OF = re.compile(r"\bcurso (de|do|da|em)\b")
# Palavras que só aparecem no nome de um curso. Com uma delas, o texto diz um
# curso mesmo sem a palavra "curso" ("TÉCNICO EM AGROPECUÁRIA - CAMPUS SATUBA").
_COURSE_KIND = re.compile(
    r"\b(curso|bacharelado|licenciatura|tecnico|tecnologico|tecnologo|tecnologia"
    r"|engenharia|integrado|subsequente|proeja)\b"
)
# Uma linha que começa por uma dessas palavras é o nome de um curso, mesmo sem a
# palavra "curso": "BACHARELADO EM SISTEMAS DE INFORMAÇÃO - 2026.1".
_COURSE_START = re.compile(
    r"^(curso|bacharelado|licenciatura|tecnico|tecnologico|tecnologo|tecnologia"
    r"|engenharia|integrado|subsequente|proeja)\b"
)
# "(IFAL CORURIPE)": o campus citado sem a palavra "campus".
_IFAL_CAMPUS = re.compile(r"\bifal\b")
# E-mails ("cra.maceio@ifal.edu.br") aparecem no motivo e não citam campus.
_EMAIL = re.compile(r"\S+@\S+")
# O penúltimo trecho de um título que não é nome de curso: "SiSU 2027 - 1ª
# Chamada - Maceió" é a lista do campus inteiro, não de um curso.
_NOT_A_COURSE_SEGMENT = re.compile(
    r"\bchamada\b|classificad|convoca|resultado|\blista\b|aprovad"
)

# Nos documentos de matrícula há uma coluna "Situação". Só quem está deferido
# (matrícula aceita) conta como convocado; indeferido e desistente são lidos,
# mas não voltam. O time decidiu (22/11) que só a matrícula deferida conta.
# Para mudar, troque esta constante (ou `_is_convoked`).
_ENROLLED_SITUATIONS = frozenset({"deferida", "deferido", "matriculada", "matriculado"})
# O cabeçalho que cobre o número e o nome nos documentos de matrícula.
_NAME_HEADERS = frozenset({"candidato", "candidata", "candidato(a)"})
# Mais que isso de linhas de candidato sem nome: o layout mudou.
_MAX_UNREADABLE = 0.2

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
    baixados. Um título de três trechos que termina num campus, mas cujo
    penúltimo trecho é a chamada ("SiSU 2027 - 1ª Chamada - Maceió"), é a
    lista do campus inteiro e também é baixado.
    """
    segments = [normalize_search(part) for part in title.split(" - ")]
    campi = {normalize_search(campus) for campus in IFAL_CAMPI}
    target_campi = {normalize_search(target.campus) for target in targets}
    campi |= target_campi
    # "Campus Arapiraca - Resultado ...": a lista é de outro campus.
    if (
        segments[0].startswith("campus ")
        and segments[0].removeprefix("campus ") in campi - target_campi
    ):
        return True
    names_a_course = (
        len(segments) >= 3
        and segments[-1] in campi
        and not _NOT_A_COURSE_SEGMENT.search(segments[-2])
    )
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


def _is_name_header(cell: str) -> bool:
    normalized = normalize_search(cell)
    return normalized.startswith("nome") or normalized in _NAME_HEADERS


def _is_header(cells: list[str]) -> bool:
    return any(_is_name_header(cell) for cell in cells)


def _has_situation(cells: list[str]) -> bool:
    return any(normalize_search(cell).startswith("situacao") for cell in cells)


def _is_convoked(cells: list[str], has_situation: bool) -> bool:
    """Se a linha conta como convocado. Sem coluna Situação, toda linha conta."""
    if not has_situation:
        return True
    return any(normalize_search(c) in _ENROLLED_SITUATIONS for c in cells[1:])


def _name(cells: list[str]) -> str | None:
    """O primeiro nome completo depois do número (a inscrição tem só dígitos)."""
    return next((cell for cell in cells[1:] if _NAME.fullmatch(cell)), None)


def _campi_in(text: str, targets: Sequence[TargetCourse]) -> set[str]:
    """Os campi (normalizados) que o texto cita como palavra inteira."""
    normalized = normalize_search(_EMAIL.sub(" ", text))
    campi = {normalize_search(campus) for campus in IFAL_CAMPI}
    campi |= {normalize_search(target.campus) for target in targets}
    return {
        campus
        for campus in campi
        if re.search(rf"(?<!\w){re.escape(campus)}(?!\w)", normalized)
    }


def _names_course_or_campus(line: str, targets: Sequence[TargetCourse]) -> bool:
    """Se a linha diz curso ou campus (e não é só um texto de motivo).

    Diz quando é uma linha "Curso: ...", um "Curso de ...", começa pelo nome de
    um tipo de curso ("BACHARELADO EM ..."), cita um campus junto de "curso" ou
    "campus", ou é o "(IFAL CORURIPE)". Um e-mail com "maceio" não conta.
    """
    normalized = normalize_search(_EMAIL.sub(" ", line))
    if (
        _COURSE_LABEL.match(normalized)
        or _COURSE_OF.search(normalized)
        or _COURSE_START.match(normalized)
    ):
        return True
    campi = _campi_in(line, targets)
    return bool(campi) and bool(
        _COURSE_WORD.search(normalized) or _IFAL_CAMPUS.search(normalized)
    )


def _document_campus(title: str, targets: Sequence[TargetCourse]) -> str | None:
    """O campus do documento, se o título cita um só."""
    campi = _campi_in(title, targets)
    return next(iter(campi)) if len(campi) == 1 else None


def _section_course(
    lines: list[str],
    targets: Sequence[TargetCourse],
    current: TargetCourse | None,
    doc_campus: str | None,
) -> tuple[bool, TargetCourse | None, str | None]:
    """Se o texto antes de um cabeçalho ou candidato diz de qual curso é o trecho.

    Devolve (diz, curso-alvo, campus do documento). Só contam as linhas que
    dizem curso ou campus (`_names_course_or_campus`): o texto livre do motivo
    ("pendente para o e-mail: cra.maceio@ifal.edu.br") não troca o trecho. Um
    texto que só cita a palavra ("Recurso: prazo de 2 dias", "CONCURSO SISU
    2027", "Dúvidas sobre o curso") também não diz nada, e o trecho continua no
    curso de antes.

    O campus do trecho é o que o texto cita; sem isso, o do documento (do
    título ou da primeira linha com "campus", que nos documentos de matrícula
    aparece só na página 1). O trecho é de um curso-alvo só se o texto nomeia
    esse curso e o campus do trecho é o do alvo. Fora isso, é de outro curso
    (curso-alvo None), a não ser que o texto concorde com o curso de antes: um
    topo só com o campus ("Campus: Maceió") ou só com um curso que não é
    outro ("Curso: Bacharelado em Sistemas de Informação") não tira os nomes.
    """
    course_lines = [line for line in lines if _names_course_or_campus(line, targets)]
    if not course_lines:
        return False, None, doc_campus

    text = " ".join(course_lines)
    normalized = normalize_search(_EMAIL.sub(" ", text))
    campi = _campi_in(text, targets)
    if doc_campus is None:
        with_word = {
            campus
            for line in course_lines
            if re.search(r"\bcampus\b", normalize_search(line))
            for campus in _campi_in(line, targets)
        }
        if len(with_word) == 1:
            doc_campus = next(iter(with_word))

    section_campi = campi or ({doc_campus} if doc_campus else set())
    for target in targets:
        if normalize_search(target.course) in normalized and section_campi == {
            normalize_search(target.campus)
        }:
            return True, target, doc_campus

    if current is not None:
        same_campus = campi <= {normalize_search(current.campus)}
        names_current_course = normalize_search(current.course) in normalized
        # Sem "curso", "técnico", "licenciatura"... o texto não diz curso nenhum.
        names_no_course = not _COURSE_KIND.search(normalized)
        if same_campus and (names_current_course or names_no_course):
            return True, current, doc_campus

    return True, None, doc_campus


def parse_convocation(
    pdf: bytes, title: str, targets: Sequence[TargetCourse]
) -> ConvocationList:
    """Lê um PDF de convocação e devolve só os nomes dos cursos-alvo.

    O curso de cada trecho vem do texto antes dele (o topo da página ou um
    subtítulo com "Curso" ou "Campus"); sem isso, vale o título do documento.
    Número de inscrição, posição, concorrência e nota nunca são lidos (RN-23).
    Levanta ReportFormatError se o PDF não abre, não tem texto (é imagem), não
    tem a linha de cabeçalho (Nome ou Candidato), ou mais de 20% das linhas de
    candidato não têm um nome legível (RNF-F31.04).
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
    doc_campus = _document_campus(title, targets)
    header_seen = False
    has_situation = False
    context: list[str] = []
    rows_read = unreadable = 0
    convoked: list[ConvokedName] = []

    for line in "\n".join(pages).splitlines():
        if not line.strip():
            continue
        cells = _cells(line)
        is_header = _is_header(cells)
        # Uma linha de candidato tem mais de uma célula: o número da página
        # sozinho no rodapé ("1") também começa com dígito e não é candidato.
        is_row = header_seen and len(cells) > 1 and cells[0].isdigit()
        if not is_header and not is_row:
            context.append(line)
            continue

        # Um cabeçalho ou candidato depois de um texto que diz o curso ou o
        # campus: começou o trecho de outro curso, que pode não ser alvo.
        if context:
            names_course, target, doc_campus = _section_course(
                context, targets, current, doc_campus
            )
            if names_course:
                current = target
        context = []

        if is_header or not header_seen:
            header_seen = True
            has_situation = _has_situation(cells)
            continue

        name = _name(cells)
        if name is None:
            # Sem nome entre as células: não dá para saber de quem é a linha.
            unreadable += 1
            continue
        rows_read += 1
        if current is not None and _is_convoked(cells, has_situation):
            convoked.append(ConvokedName(name=normalize_search(name), course=current))

    # Melhor parar que errar: sem cabeçalho, sem nenhum candidato ou com linhas
    # demais que não deram para ler, é imagem ou layout novo.
    if (
        not header_seen
        or rows_read == 0
        or unreadable > _MAX_UNREADABLE * (rows_read + unreadable)
    ):
        raise ReportFormatError

    return ConvocationList(rows_read=rows_read, convoked=convoked)
