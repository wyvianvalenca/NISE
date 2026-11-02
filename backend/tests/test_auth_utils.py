from datetime import UTC, datetime, timedelta

import jwt

from app.auth.utils import (
    JWT_ALGORITHM,
    create_access_token,
    decode_access_token,
    hash_password,
    verify_password,
)
from app.config import settings


def test_hash_nao_contem_a_senha() -> None:
    senha_hash = hash_password("senha-ficticia-123")

    assert "senha-ficticia-123" not in senha_hash
    assert senha_hash.startswith("$argon2id$")


def test_senha_certa_confere_com_o_hash() -> None:
    senha_hash = hash_password("senha-ficticia-123")

    assert verify_password("senha-ficticia-123", senha_hash)


def test_senha_errada_nao_confere_com_o_hash() -> None:
    senha_hash = hash_password("senha-ficticia-123")

    assert not verify_password("senha-ficticia-321", senha_hash)


def test_salts_diferentes_para_senhas_iguais() -> None:
    senha_hash_1 = hash_password("senha-ficticia-123")
    senha_hash_2 = hash_password("senha-ficticia-123")

    assert verify_password("senha-ficticia-123", senha_hash_1)
    assert verify_password("senha-ficticia-123", senha_hash_2)

    assert senha_hash_1 != senha_hash_2


def test_maisculas_importam() -> None:
    senha_hash = hash_password("senha-ficticia-123")

    assert not verify_password("Senha-Ficticia-123", senha_hash)


def test_criar_e_ler_token_devolve_mesmo_id() -> None:
    user_id = 1
    token = create_access_token(user_id)
    decoded_id = decode_access_token(token)

    assert user_id == decoded_id


def test_token_expirado_devolve_none() -> None:
    token = jwt.encode(
        {"sub": "1", "exp": datetime.now(UTC) - timedelta(minutes=1)},
        settings.jwt_secret,
        algorithm=JWT_ALGORITHM,
    )

    assert decode_access_token(token) is None


def test_token_assinado_errado_devolve_none() -> None:
    token = jwt.encode(
        {"sub": "1", "exp": datetime.now(UTC) + timedelta(minutes=10)},
        "senha-grande-o-suficiente-para-32-b",
        algorithm=JWT_ALGORITHM,
    )

    assert decode_access_token(token) is None


def test_texto_qualquer_nao_token_devolve_none() -> None:
    assert decode_access_token("texto-qualquer") is None


def test_token_sem_sub_devolve_none() -> None:
    token = jwt.encode(
        {"exp": datetime.now(UTC) + timedelta(minutes=10)},
        settings.jwt_secret,
        algorithm=JWT_ALGORITHM,
    )

    assert decode_access_token(token) is None


def test_token_com_sub_que_nao_e_numero_devolve_none() -> None:
    token = jwt.encode(
        {"sub": "abc", "exp": datetime.now(UTC) + timedelta(minutes=10)},
        settings.jwt_secret,
        algorithm=JWT_ALGORITHM,
    )

    assert decode_access_token(token) is None


def test_token_sem_exp_devolve_none() -> None:
    # Sem exp, o token valeria para sempre.
    token = jwt.encode({"sub": "1"}, settings.jwt_secret, algorithm=JWT_ALGORITHM)

    assert decode_access_token(token) is None


def test_token_leva_so_o_id_e_a_validade() -> None:
    # O conteúdo do JWT é legível por quem tiver o token: nada de dado pessoal.
    token = create_access_token(1)

    conteudo = jwt.decode(token, options={"verify_signature": False})

    assert set(conteudo) == {"sub", "exp"}
