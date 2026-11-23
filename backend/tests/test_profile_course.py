"""Curso pelo perfil (A10/A10b, #298): GET e POST de /api/profile/course.

Usa o Postgres de verdade (fixture `db_session`) com as rotas reais. Só o aceite
dos termos é trocado por "aceitou", porque não é o que se testa aqui. Dados
fictícios.
"""

import logging
from datetime import date
from typing import cast
from unittest.mock import AsyncMock

import pytest
from httpx2 import Response
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.utils import create_access_token
from app.main import app
from app.modules.admissions.models import AdmissionOrigin, CourseLevel, Enrollment
from app.modules.consents import permissions
from app.modules.followup.models import FollowupAnswer
from app.modules.girls.models import Girl
from app.users.models import Role, User
from tests.helpers import chamar_rota

URL = "/api/profile/course"
HOJE = date(2026, 6, 10)


@pytest.fixture(autouse=True)
def aceitou_os_termos(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        permissions, "has_accepted_current_terms", AsyncMock(return_value=True)
    )


async def criar_menina(db_session: AsyncSession, role: Role = Role.GIRL) -> User:
    user = User(email="bia@exemplo.test", name="Bia Fictícia", role=role)
    db_session.add(user)
    await db_session.flush()
    db_session.add(Girl(email=user.email, name=user.name, user_id=user.id))
    await db_session.flush()
    return user


async def girl_id_de(db_session: AsyncSession, user: User) -> int:
    girl_id = await db_session.scalar(select(Girl.id).where(Girl.user_id == user.id))
    assert girl_id is not None
    return girl_id


async def ingressos(db_session: AsyncSession, user: User) -> list[Enrollment]:
    girl_id = await girl_id_de(db_session, user)
    found = await db_session.scalars(
        select(Enrollment)
        .where(Enrollment.girl_id == girl_id)
        .order_by(Enrollment.id)
        .execution_options(populate_existing=True)
    )
    return list(found)


def sessao_real(db_session: AsyncSession) -> AsyncMock:
    # chamar_rota aceita qualquer sessão; aqui vai a do Postgres de verdade.
    return cast(AsyncMock, db_session)


async def chamar(
    db_session: AsyncSession,
    user: User,
    metodo: str,
    corpo: dict[str, object] | None = None,
) -> Response:
    return await chamar_rota(
        app, metodo, URL, sessao_real(db_session), create_access_token(user.id), corpo
    )


def graduacao(**campos: object) -> dict[str, object]:
    return {"courseStatus": "graduacao", "course": "ciencia_computacao", **campos}


# --- GET ----------------------------------------------------------------------


async def test_sem_curso_vem_so_o_nome(db_session: AsyncSession) -> None:
    user = await criar_menina(db_session)

    response = await chamar(db_session, user, "GET")

    assert response.status_code == 200
    assert response.json() == {"firstName": "Bia", "level": None, "course": None}


async def test_com_curso_vem_o_atual(db_session: AsyncSession) -> None:
    user = await criar_menina(db_session)
    girl_id = await girl_id_de(db_session, user)
    db_session.add(
        Enrollment(
            girl_id=girl_id,
            level=CourseLevel.GRADUACAO,
            course="Ciência da Computação",
            institution=None,
            enrolled_on=HOJE,
            origin=AdmissionOrigin.SELF_DECLARED,
        )
    )
    await db_session.flush()

    response = await chamar(db_session, user, "GET")

    assert response.json() == {
        "firstName": "Bia",
        "level": "graduacao",
        "course": "Ciência da Computação",
    }


async def test_curso_que_ela_deixou_nao_e_o_atual(db_session: AsyncSession) -> None:
    user = await criar_menina(db_session)
    girl_id = await girl_id_de(db_session, user)
    db_session.add(
        Enrollment(
            girl_id=girl_id,
            level=CourseLevel.TECNICO,
            course="Redes de computadores",
            institution=None,
            enrolled_on=HOJE,
            origin=AdmissionOrigin.SELF_DECLARED,
            left_on=HOJE,
        )
    )
    await db_session.flush()

    response = await chamar(db_session, user, "GET")

    assert response.json()["course"] is None


# --- POST ---------------------------------------------------------------------


async def test_registrar_grava_um_ingresso_dela(db_session: AsyncSession) -> None:
    user = await criar_menina(db_session)

    response = await chamar(
        db_session, user, "POST", graduacao(institution="  Universidade Fictícia ")
    )

    assert response.status_code == 204
    [ingresso] = await ingressos(db_session, user)
    assert ingresso.level is CourseLevel.GRADUACAO
    assert ingresso.course == "Ciência da Computação"
    assert ingresso.institution == "Universidade Fictícia"
    assert ingresso.origin is AdmissionOrigin.SELF_DECLARED
    assert ingresso.left_on is None


async def test_outro_curso_guarda_o_nome_digitado(db_session: AsyncSession) -> None:
    user = await criar_menina(db_session)

    response = await chamar(
        db_session,
        user,
        "POST",
        {"courseStatus": "tecnico", "course": "outro", "otherCourse": " Robótica "},
    )

    assert response.status_code == 204
    [ingresso] = await ingressos(db_session, user)
    assert ingresso.level is CourseLevel.TECNICO
    assert ingresso.course == "Robótica"
    assert ingresso.institution is None


async def test_registrar_de_novo_guarda_o_anterior_com_a_data(
    db_session: AsyncSession,
) -> None:
    # RF-F6.05: o valor anterior fica, com a data; só um curso fica atual.
    user = await criar_menina(db_session)
    await chamar(db_session, user, "POST", graduacao())

    response = await chamar(
        db_session, user, "POST", {"courseStatus": "tecnico", "course": "redes"}
    )

    assert response.status_code == 204
    antigo, novo = await ingressos(db_session, user)
    assert antigo.course == "Ciência da Computação"
    assert antigo.left_on is not None
    assert antigo.enrolled_on is not None
    assert novo.course == "Redes de computadores"
    assert novo.left_on is None
    atual = await chamar(db_session, user, "GET")
    assert atual.json()["course"] == "Redes de computadores"


async def test_registrar_nao_cria_resposta_de_questionario(
    db_session: AsyncSession,
) -> None:
    user = await criar_menina(db_session)

    await chamar(db_session, user, "POST", graduacao())

    assert await db_session.scalar(select(func.count(FollowupAnswer.id))) == 0


@pytest.mark.parametrize("status_do_curso", ["trying", "not_yet"])
async def test_tentando_entrar_e_ainda_nao_nao_gravam_nada(
    db_session: AsyncSession, status_do_curso: str
) -> None:
    # RN-22: sem matrícula declarada não há ingresso. O curso atual continua.
    user = await criar_menina(db_session)
    await chamar(db_session, user, "POST", graduacao())

    response = await chamar(db_session, user, "POST", {"courseStatus": status_do_curso})

    assert response.status_code == 204
    [ingresso] = await ingressos(db_session, user)
    assert ingresso.left_on is None
    assert await db_session.scalar(select(func.count(FollowupAnswer.id))) == 0


@pytest.mark.parametrize(
    "corpo",
    [
        {},
        {"courseStatus": "graduacao"},
        {"courseStatus": "graduacao", "course": "engenharia_nuclear"},
        {"courseStatus": "graduacao", "course": "outro"},
        {"courseStatus": "graduacao", "course": "outro", "otherCourse": "   "},
        {"courseStatus": "graduacao", "course": "redes", "otherCourse": "Outro"},
        {"courseStatus": "graduacao", "course": "redes", "institution": "x" * 121},
        {"courseStatus": "trying", "course": "redes"},
        {"courseStatus": "not_yet", "institution": "Escola Fictícia"},
        {"courseStatus": "tecnico", "course": "redes", "comment": "oi"},
    ],
)
async def test_corpo_invalido_recebe_422_e_nao_grava(
    db_session: AsyncSession, corpo: dict[str, object]
) -> None:
    user = await criar_menina(db_session)

    response = await chamar(db_session, user, "POST", corpo)

    assert response.status_code == 422
    assert await ingressos(db_session, user) == []


async def test_falha_no_commit_nao_deixa_nada_pela_metade(
    db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    # RNF-F6.01: se o commit falha, o curso antigo continua atual (sem left_on)
    # e o novo não existe.
    user = await criar_menina(db_session)
    await chamar(db_session, user, "POST", graduacao())

    async def commit_que_falha() -> None:
        await db_session.rollback()
        raise RuntimeError("falha simulada")

    monkeypatch.setattr(db_session, "commit", commit_que_falha)

    with pytest.raises(RuntimeError):
        await chamar(
            db_session, user, "POST", {"courseStatus": "tecnico", "course": "redes"}
        )

    # O rollback expirou o que a sessão tinha em memória.
    await db_session.refresh(user)
    [ingresso] = await ingressos(db_session, user)
    assert ingresso.course == "Ciência da Computação"
    assert ingresso.left_on is None


# --- Acesso e privacidade -----------------------------------------------------


@pytest.mark.parametrize("metodo", ["GET", "POST"])
async def test_sem_sessao_recebe_401(db_session: AsyncSession, metodo: str) -> None:
    response = await chamar_rota(
        app, metodo, URL, sessao_real(db_session), corpo=graduacao()
    )

    assert response.status_code == 401


@pytest.mark.parametrize("role", [Role.COORDINATOR, Role.NISE_TEAM])
@pytest.mark.parametrize("metodo", ["GET", "POST"])
async def test_coordenadora_e_curadora_recebem_403(
    db_session: AsyncSession, role: Role, metodo: str
) -> None:
    user = await criar_menina(db_session, role)

    response = await chamar(db_session, user, metodo, graduacao())

    assert response.status_code == 403
    assert await ingressos(db_session, user) == []


async def test_nao_registra_o_texto_livre_nos_logs(
    db_session: AsyncSession, caplog: pytest.LogCaptureFixture
) -> None:
    # RN-11.
    user = await criar_menina(db_session)

    with caplog.at_level(logging.DEBUG):
        await chamar(
            db_session,
            user,
            "POST",
            {
                "courseStatus": "tecnico",
                "course": "outro",
                "otherCourse": "Curso Secreto Fictício",
                "institution": "Escola Secreta Fictícia",
            },
        )
        await chamar(db_session, user, "GET")

    assert "Secreto" not in caplog.text
