import pytest
from pydantic import ValidationError

from app.auth.schemas import LoginIn, RegisterIn

CADASTRO_VALIDO = {
    "name": "Alana Ficticia",
    "email": "alana@exemplo.com",
    "password": "senha-ficticia",
}


def test_cadastro_valido() -> None:
    dados = RegisterIn.model_validate(CADASTRO_VALIDO)

    assert dados.name == "Alana Ficticia"
    assert dados.email == "alana@exemplo.com"


def test_cadastro_ignora_o_papel_enviado() -> None:
    # Ninguém escolhe o próprio papel: um "role" no corpo some.
    dados = RegisterIn.model_validate({**CADASTRO_VALIDO, "role": "coordinator"})

    assert "role" not in dados.model_dump()


def test_cadastro_tira_espacos_do_nome() -> None:
    dados = RegisterIn.model_validate({**CADASTRO_VALIDO, "name": "  Alana Ficticia "})

    assert dados.name == "Alana Ficticia"


def test_cadastro_aceita_nome_curto() -> None:
    dados = RegisterIn.model_validate({**CADASTRO_VALIDO, "name": "Ana"})

    assert dados.name == "Ana"


@pytest.mark.parametrize(
    ("campo", "valor"),
    [
        ("name", ""),
        ("name", "   "),
        ("name", "a" * 129),
        ("email", "alana@exemplo"),
        ("email", "alana.exemplo.com"),
        ("password", "1234567"),
        # Sem teto, uma senha gigante prenderia o servidor no Argon2.
        ("password", "a" * 129),
    ],
    ids=[
        "nome-vazio",
        "nome-so-espacos",
        "nome-longo",
        "email-sem-ponto",
        "email-sem-arroba",
        "senha-curta",
        "senha-longa",
    ],
)
def test_cadastro_invalido(campo: str, valor: str) -> None:
    with pytest.raises(ValidationError) as erro:
        RegisterIn.model_validate({**CADASTRO_VALIDO, campo: valor})

    assert erro.value.errors()[0]["loc"] == (campo,)


def test_login_aceita_senha_curta() -> None:
    # Se a regra do cadastro mudar, contas antigas ainda precisam entrar.
    dados = LoginIn.model_validate({"email": "alana@exemplo.com", "password": "1234"})

    assert dados.password == "1234"


@pytest.mark.parametrize("senha", ["", "a" * 129], ids=["vazia", "longa"])
def test_login_recusa_senha_vazia_ou_longa(senha: str) -> None:
    with pytest.raises(ValidationError):
        LoginIn.model_validate({"email": "alana@exemplo.com", "password": senha})
