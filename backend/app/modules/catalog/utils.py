from app.modules.actions.models import ActionType
from app.modules.catalog.models import CuratedType, ItemLevel, ItemOrigin

# Do mais fácil ao mais difícil. As regras de #80 comparam níveis por esta ordem.
LEVEL_ORDER: list[ItemLevel] = [
    ItemLevel.BEGINNER,
    ItemLevel.INTERMEDIATE,
    ItemLevel.ADVANCED,
]

# Como cada tipo aparece no selo do cartão (A06·2, A06·4a).
CURATED_TYPE_LABELS: dict[CuratedType, str] = {
    CuratedType.VIDEO: "Vídeo",
    CuratedType.QUIZ: "Quiz",
    CuratedType.ARTICLE: "Artigo",
    CuratedType.TUTORIAL: "Tutorial",
    CuratedType.MINI_PROJECT: "Mini-projeto",
    CuratedType.COURSE: "Curso online",
    CuratedType.PERSONAL_PROJECT: "Projeto pessoal",
    CuratedType.COMMUNITY: "Comunidade",
    CuratedType.PLAYLIST: "Playlist",
    CuratedType.GAME: "Jogo",
    CuratedType.OLYMPIAD: "Olimpíada",
    CuratedType.CLUB: "Clube",
    CuratedType.COHORT_COURSE: "Curso com turma",
    CuratedType.HACKATHON: "Hackathon",
    CuratedType.INTERNSHIP: "Estágio",
    CuratedType.OTHER: "Outro",
}

# A lista fixa de tipos de ação (RF-F17.01).
ACTION_TYPE_LABELS: dict[ActionType, str] = {
    ActionType.OFICINA: "Oficina",
    ActionType.PALESTRA: "Palestra",
    ActionType.MINICURSO: "Minicurso",
    ActionType.HACKATHON: "Hackathon",
    ActionType.VISITA: "Visita",
    ActionType.ACOLHIMENTO: "Acolhimento",
    ActionType.OUTRO: "Outro",
}


def item_id(origin: ItemOrigin, number: int) -> str:
    """Id de um item do catálogo, único entre as duas fontes: "curadoria-12", "acao-7"."""
    return f"{origin.value}-{number}"


# O maior id que cabe nas colunas de id do banco (integer do Postgres, int4).
MAX_ID = 2_147_483_647


def parse_item_id(text: str) -> tuple[ItemOrigin, int] | None:
    """O contrário de `item_id`. Devolve None se o texto não é um id válido.

    Só a forma que `item_id` escreve: sem zero à esquerda ("acao-07" não é
    "acao-7") e dentro do que o banco guarda. Um número maior que o int4 daria
    erro 500 na consulta, em vez do 404 de um item que não existe.
    """
    origin_text, _, number_text = text.rpartition("-")
    try:
        origin = ItemOrigin(origin_text)
    except ValueError:
        return None
    # isascii: isdigit sozinho aceita "²", que o int() recusa.
    if not (number_text.isascii() and number_text.isdigit()):
        return None
    if number_text.startswith("0"):
        return None
    number = int(number_text)
    if number > MAX_ID:
        return None
    return origin, number
