"""Página fictícia com a mesma estrutura do relatório da COPEVE (spike #272).

Todos os nomes são inventados e gerados aqui; nenhum veio do relatório real.
A estrutura é a que o spike anotou: uma tabela de título e uma tabela sem
<th>, com o cabeçalho na primeira linha de <td> e "<br>" dentro de alguns
cabeçalhos, 9 colunas e linhas de uma célula vazia no fim.
"""

from dataclasses import dataclass

HEADER = [
    "Ordem",
    "Inscrição<br>no ENEM",
    "Nome",
    "Média Final<br>no ENEM",
    "Chamada",
    "Classificação<br>na Chamada",
    "Semestre",
    "Confirmação<br>Matrícula",
    "Status",
]

PRIMEIROS = ["Ana", "Beatriz", "Carla", "Daniela", "Elisa", "Fernanda", "Gabriela"]
SEGUNDOS = ["Clara", "Luiza", "Vitoria"]
MEIOS = ["Lima", "Souza", "Costa", "Rocha", "Alves", "Pereira", "Nunes", "Barros"]
FINAIS = ["Ficticia", "Inventada", "Exemplo", "Teste", "Modelo"]


@dataclass
class Linha:
    nome: str
    chamada: str = ""
    status: str = "Optante pela Lista de Espera"


def nome_ficticio(indice: int) -> str:
    """Nome inventado e único para cada índice, no formato do relatório."""
    resto = indice
    partes = []
    for lista in (PRIMEIROS, SEGUNDOS, MEIOS, FINAIS):
        partes.append(lista[resto % len(lista)])
        resto //= len(lista)
    primeiro, segundo, meio, final = partes
    # Como no relatório: sem acento e com "Da" em maiúscula.
    return f"{primeiro} {segundo} {meio} Da {final}"


def pagina(linhas: list[Linha], cabecalho: list[str] = HEADER) -> str:
    corpo = "".join(
        "<tr>"
        f"<td>{ordem}</td><td>0000000{ordem:05d}</td><td>{linha.nome}</td>"
        f"<td>{600 + ordem % 100},{ordem % 10}0</td><td>{linha.chamada}</td>"
        f"<td>{ordem if linha.chamada else ''}</td>"
        f"<td>{'2º semestre' if linha.chamada else ''}</td>"
        f"<td>{'1ª conf. do 2º semestre' if linha.chamada else ''}</td>"
        f"<td>{linha.status}</td>"
        "</tr>"
        for ordem, linha in enumerate(linhas, start=1)
    )
    cabeca = "".join(f"<td><b>{celula}</b></td>" for celula in cabecalho)
    return (
        '<html><head><meta charset="UTF-8"></head><body>'
        "<table><tr><td>006 - CIÊNCIA DA COMPUTAÇÃO - BACH - MATUT - A. C. SIMÕES"
        " Ampla Concorrência</td></tr></table>"
        f"<table><tr>{cabeca}</tr>{corpo}<tr><td></td></tr><tr><td></td></tr>"
        "</table></body></html>"
    )
