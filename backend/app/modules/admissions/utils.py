from calendar import monthrange
from datetime import date


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


def add_months(day: date, months: int) -> date:
    """O mesmo dia, `months` meses depois; no fim do mês, o último dia dele.

    Usada na data da próxima busca (#317): 31 de out + 4 meses → 28 de fev.
    """
    index = day.year * 12 + (day.month - 1) + months
    year, month = divmod(index, 12)
    month += 1

    return date(year, month, min(day.day, monthrange(year, month)[1]))
