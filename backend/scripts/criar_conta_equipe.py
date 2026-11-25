"""Cria a conta de administração de quem é da equipe NISE (RF-S2.23).

Rode dentro de backend/, depois do `alembic upgrade head`:

    uv run python -m scripts.criar_conta_equipe "Gabi Ficticia" gabi@exemplo.com

O script pede a senha duas vezes, sem mostrar o que é digitado. Ela não vai na
linha de comando para não ficar no histórico do terminal. Com a conta, a pessoa
entra pelo login normal, com e-mail e senha, e cai na área de administração.

Um e-mail que já tem conta é recusado, de qualquer papel: uma conta de menina ou
de coordenadora não vira conta da equipe por aqui. Não há tela para isso:
quem cria contas da equipe é a própria equipe, por script (AGENTS.md).
"""

import argparse
import asyncio
import getpass
import sys

from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.utils import MINIMUM_PASSWORD_LENGTH, hash_password
from app.db.engine import SessionLocal, engine
from app.users.models import Role, User
from app.users.service import get_user_by_email, normalize_email


class TeamAccountError(Exception):
    """Algum dado da conta foi recusado; a mensagem diz qual."""


def check_fields(name: str, email: str, password: str) -> None:
    if not name.strip():
        raise TeamAccountError("O nome não pode ficar vazio.")
    if "@" not in email.strip():
        raise TeamAccountError(f'"{email}" não parece um e-mail.')
    if len(password) < MINIMUM_PASSWORD_LENGTH:
        raise TeamAccountError(
            f"A senha precisa ter pelo menos {MINIMUM_PASSWORD_LENGTH} caracteres."
        )


async def create_team_account(
    session: AsyncSession, name: str, email: str, password: str
) -> User:
    """Grava a conta da equipe. Levanta TeamAccountError se algo for recusado."""
    check_fields(name, email, password)
    email = normalize_email(email)

    if await get_user_by_email(session, email) is not None:
        raise TeamAccountError(f"{email} já tem conta.")

    user = User(
        name=name.strip(),
        email=email,
        password_hash=hash_password(password),
        role=Role.NISE_TEAM,
    )
    session.add(user)

    try:
        await session.commit()
    except IntegrityError:
        # Outra conta com o mesmo e-mail foi criada entre a busca e o commit.
        await session.rollback()
        raise TeamAccountError(f"{email} já tem conta.") from None

    return user


def ask_password() -> str:
    password = getpass.getpass("Senha: ")
    if getpass.getpass("Repita a senha: ") != password:
        raise TeamAccountError("As senhas não são iguais.")
    return password


async def main(name: str, email: str) -> int:
    try:
        # Confere nome e e-mail antes de pedir a senha.
        check_fields(name, email, "x" * MINIMUM_PASSWORD_LENGTH)
        password = ask_password()

        async with SessionLocal() as session:
            user = await create_team_account(session, name, email, password)
    except TeamAccountError as error:
        print(error, file=sys.stderr)
        return 1
    finally:
        await engine.dispose()

    print(f"Conta da equipe criada: {user.name} <{user.email}>.")
    print("Ela entra pelo login, com esse e-mail e a senha, e cai no admin.")
    return 0


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("nome", help="nome de quem é da equipe")
    parser.add_argument("email", help="e-mail com que ela vai entrar")
    args = parser.parse_args()
    sys.exit(asyncio.run(main(args.nome, args.email)))
