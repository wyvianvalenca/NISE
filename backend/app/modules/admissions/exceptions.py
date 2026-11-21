class MatchNotFoundError(Exception):
    """O indício não existe, venceu, foi apagado ou é de outra menina."""


class MatchAlreadyAnsweredError(Exception):
    """Ela já respondeu este indício: só dá pra responder uma vez."""
