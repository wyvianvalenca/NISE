from pydantic import BaseModel


class ToAnswerOut(BaseModel):
    """O que a seção "Pra responder" da agenda (A14) mostra.

    Por enquanto só o indício de lista oficial (RF-F31.10). As avaliações e os
    questionários da M5 (#129) entram aqui quando existirem.
    """

    # Existe um indício sem resposta. Só isso: nada de lista, curso ou
    # instituição (RNF-F31.02).
    list_match: bool
