import unicodedata


def normalize_search(text: str) -> str:
    """Tira acentos, maiúsculas e espaços repetidos: "São  José" vira "sao jose".

    Usada na carga (para montar City.search_name) e na busca (para o que ela
    digitou), então os dois lados sempre comparam o mesmo formato.
    """
    decomposed = unicodedata.normalize("NFD", text)
    without_accents = "".join(
        char for char in decomposed if not unicodedata.combining(char)
    )
    return " ".join(without_accents.lower().split())


def city_label(name: str, state: str) -> str:
    """Como o município aparece na tela, ex.: "Maceió, AL"."""
    return f"{name}, {state}"
