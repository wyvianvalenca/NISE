"""PDF fictício no mesmo layout das listas de convocação do IFAL (spike #274).

Todos os nomes são inventados (tests/copeve_ficticio.py); nenhum veio de um
PDF real. O layout é o que o spike anotou: curso e campus uma vez no topo de
cada página, uma linha de cabeçalho e um candidato por linha, com as colunas
posição, número de inscrição, nome, concorrência e nota.

O PDF é escrito à mão, em bytes, com a fonte Helvetica que todo leitor de PDF
já tem: assim os testes não precisam de outra biblioteca só para gerar PDF.
"""

from dataclasses import dataclass

HEADER = ["Posição", "Inscrição", "Nome", "Concorrência", "Nota"]
# Onde cada coluna começa na página, em pontos.
COLUMNS_X = [40, 95, 170, 420, 500]
ROWS_PER_PAGE = 50


@dataclass
class Linha:
    nome: str
    concorrencia: str = "A0"


def _texto(valor: str) -> str:
    """Uma string de PDF em WinAnsi, com acentos e parênteses escapados."""
    saida = []
    for byte in valor.encode("cp1252"):
        if byte in b"()\\" or byte > 126:
            saida.append(f"\\{byte:03o}")
        else:
            saida.append(chr(byte))
    return "(" + "".join(saida) + ")"


def _linha(y: int, celulas: list[str], xs: list[int] = COLUMNS_X) -> str:
    return "".join(
        f"BT /F1 9 Tf {x} {y} Td {_texto(celula)} Tj ET\n"
        for x, celula in zip(xs, celulas, strict=True)
    )


def _pagina(
    curso: str, campus: str, linhas: list[Linha], inicio: int, cabecalho: list[str]
) -> str:
    topo = [
        "INSTITUTO FEDERAL DE ALAGOAS",
        "RESULTADO FINAL - CLASSIFICADOS",
        f"Curso: {curso}",
        f"Campus: {campus}",
    ]
    partes = [_linha(800 - 14 * i, [texto], [40]) for i, texto in enumerate(topo)]
    partes.append(_linha(730, cabecalho))
    for i, linha in enumerate(linhas):
        posicao = inicio + i + 1
        celulas = [
            str(posicao),
            f"{posicao:08d}",
            linha.nome,
            linha.concorrencia,
            f"{600 + posicao % 100},{posicao % 10}0",
        ]
        partes.append(_linha(716 - 13 * i, celulas))
    return "".join(partes)


def montar_pdf(conteudos: list[str]) -> bytes:
    """Monta um PDF com uma página por conteúdo (operadores de texto do PDF)."""
    paginas = len(conteudos)
    # 1: catálogo, 2: páginas, 3: fonte, depois página e conteúdo de cada uma.
    objetos = [
        "<< /Type /Catalog /Pages 2 0 R >>",
        "<< /Type /Pages /Kids ["
        + " ".join(f"{4 + 2 * i} 0 R" for i in range(paginas))
        + f"] /Count {paginas} >>",
        "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    ]
    for i, conteudo in enumerate(conteudos):
        objetos.append(
            "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842]"
            f" /Resources << /Font << /F1 3 0 R >> >> /Contents {5 + 2 * i} 0 R >>"
        )
        dados = conteudo.encode("latin-1")
        objetos.append(f"<< /Length {len(dados)} >>\nstream\n{conteudo}endstream")

    saida = bytearray(b"%PDF-1.4\n")
    posicoes = []
    for numero, objeto in enumerate(objetos, start=1):
        posicoes.append(len(saida))
        saida += f"{numero} 0 obj\n{objeto}\nendobj\n".encode("latin-1")
    xref = len(saida)
    saida += f"xref\n0 {len(objetos) + 1}\n0000000000 65535 f \n".encode()
    for posicao in posicoes:
        saida += f"{posicao:010d} 00000 n \n".encode()
    saida += (
        f"trailer\n<< /Size {len(objetos) + 1} /Root 1 0 R >>\n"
        f"startxref\n{xref}\n%%EOF\n"
    ).encode()
    return bytes(saida)


def lista_pdf(
    linhas: list[Linha],
    curso: str = "Bacharelado em Sistemas de Informação",
    campus: str = "Maceió",
    cabecalho: list[str] = HEADER,
) -> bytes:
    """A lista de um curso, 50 candidatos por página, curso e campus no topo."""
    paginas = [
        _pagina(curso, campus, linhas[i : i + ROWS_PER_PAGE], i, cabecalho)
        for i in range(0, max(len(linhas), 1), ROWS_PER_PAGE)
    ]
    return montar_pdf(paginas)


def pdf_imagem() -> bytes:
    """Uma página sem texto, só um retângulo: como uma lista escaneada."""
    return montar_pdf(["0 0 0 rg 40 40 500 700 re f\n"])
