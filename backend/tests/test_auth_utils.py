from app.auth.utils import hash_password, verify_password


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
