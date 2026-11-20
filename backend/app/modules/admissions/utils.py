def short_name(full_name: str) -> str:
    """Primeiro nome e a inicial do último sobrenome: "Ana Lima Souza" → "Ana S.".

    É como a menina aparece na lista "Quem ingressou" (#315). Com um nome só,
    fica só ele.
    """
    parts = full_name.split()

    if not parts:
        return ""
    if len(parts) == 1:
        return parts[0]

    return f"{parts[0]} {parts[-1][0].upper()}."
