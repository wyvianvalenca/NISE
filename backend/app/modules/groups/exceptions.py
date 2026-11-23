class InvalidInviteError(Exception):
    """O código de convite não existe ou já venceu."""


class ExpiredInviteError(InvalidInviteError):
    """O código de convite existe, mas já venceu.

    É um caso de InvalidInviteError: o cadastro trata os dois do mesmo jeito.
    Só a rota pública do convite separa, respondendo 410 em vez de 404.
    """
