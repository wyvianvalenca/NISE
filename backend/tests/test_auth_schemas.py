from datetime import date

import pytest
from pydantic import ValidationError

from app.auth.schemas import EmailSignupIn, LoginIn

# Como o front manda (camelCase, cidade como texto). Dados fictícios.
CADASTRO_VALIDO = {
    "name": "Alana Ficticia",
    "email": "alana@exemplo.com",
    "password": "senha-ficticia",
    "birthDate": "2009-03-02",
    "cityId": "2704302",
}


def test_cadastro_valido() -> None:
    dados = EmailSignupIn.model_validate(CADASTRO_VALIDO)

    assert dados.name == "Alana Ficticia"
    assert dados.email == "alana@exemplo.com"
    assert dados.birth_date == date(2009, 3, 2)
    assert dados.city_id == 2704302
    assert dados.invite is None


def test_cadastro_com_convite() -> None:
    dados = EmailSignupIn.model_validate({**CADASTRO_VALIDO, "invite": "codigo"})

    assert dados.invite == "codigo"


def test_cadastro_ignora_o_papel_enviado() -> None:
    # Ninguém escolhe o próprio papel: um "role" no corpo some.
    dados = EmailSignupIn.model_validate({**CADASTRO_VALIDO, "role": "coordinator"})

    assert "role" not in dados.model_dump()


def test_cadastro_tira_espacos_do_nome_e_do_email() -> None:
    dados = EmailSignupIn.model_validate(
        {**CADASTRO_VALIDO, "name": "  Alana Ficticia ", "email": " alana@exemplo.com "}
    )

    assert dados.name == "Alana Ficticia"
    assert dados.email == "alana@exemplo.com"


def test_cadastro_aceita_nome_curto() -> None:
    dados = EmailSignupIn.model_validate({**CADASTRO_VALIDO, "name": "Ana"})

    assert dados.name == "Ana"


def test_formato_do_email_e_senha_curta_ficam_para_o_servico() -> None:
    # O serviço recusa com um código que o front mostra junto ao campo
    # (invalid_email, password_too_short); o schema deixa passar.
    dados = EmailSignupIn.model_validate(
        {**CADASTRO_VALIDO, "email": "alana@gmail", "password": "1234567"}
    )

    assert dados.email == "alana@gmail"


@pytest.mark.parametrize(
    ("campo", "valor", "loc"),
    [
        ("name", "", "name"),
        ("name", "   ", "name"),
        ("name", "a" * 129, "name"),
        # Sem teto, uma senha gigante prenderia o servidor no Argon2.
        ("password", "a" * 129, "password"),
        ("birthDate", "2009-02-30", "birthDate"),
        ("cityId", "maceio", "cityId"),
        ("invite", "a" * 65, "invite"),
    ],
    ids=[
        "nome-vazio",
        "nome-so-espacos",
        "nome-longo",
        "senha-longa",
        "data-que-nao-existe",
        "cidade-sem-codigo",
        "convite-longo",
    ],
)
def test_cadastro_invalido(campo: str, valor: str, loc: str) -> None:
    with pytest.raises(ValidationError) as erro:
        EmailSignupIn.model_validate({**CADASTRO_VALIDO, campo: valor})

    assert erro.value.errors()[0]["loc"] == (loc,)


def test_login_aceita_senha_curta() -> None:
    # Se a regra do cadastro mudar, contas antigas ainda precisam entrar.
    dados = LoginIn.model_validate({"email": "alana@exemplo.com", "password": "1234"})

    assert dados.password == "1234"


@pytest.mark.parametrize("senha", ["", "a" * 129], ids=["vazia", "longa"])
def test_login_recusa_senha_vazia_ou_longa(senha: str) -> None:
    with pytest.raises(ValidationError):
        LoginIn.model_validate({"email": "alana@exemplo.com", "password": senha})
