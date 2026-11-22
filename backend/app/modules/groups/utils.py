import secrets

# 16 bytes viram 22 caracteres no link: curto para compartilhar e impossível
# de adivinhar.
INVITE_CODE_BYTES = 16


def new_invite_code() -> str:
    return secrets.token_urlsafe(INVITE_CODE_BYTES)
