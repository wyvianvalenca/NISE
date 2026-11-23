"""Exportação anônima (F24, #375): as rotas e quem pode chamá-las (RN-07).

Rodam no Postgres de teste (`db_session`). Dados fictícios.
"""

from datetime import UTC, datetime, timedelta

from httpx2 import Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.utils import create_access_token
from app.main import app
from app.modules.exports.models import DataExport
from app.modules.groups.models import Group, GroupCoordinator
from app.users.models import Role, User
from tests.helpers import chamar_rota
from tests.test_exports_service import acao, grupo, inscrever, menina

URL = "/api/coordinator/exports"


async def usuaria(
    sessao: AsyncSession, n: int, do_grupo: Group | None, role: Role = Role.COORDINATOR
) -> User:
    nova = User(email=f"coord{n}@exemplo.com", name=f"Coord Ficticia {n}", role=role)
    sessao.add(nova)
    await sessao.flush()
    if do_grupo is not None:
        sessao.add(GroupCoordinator(group_id=do_grupo.id, user_id=nova.id))
        await sessao.flush()
    return nova


async def chamar(
    sessao: AsyncSession, quem: User | None, metodo: str, caminho: str
) -> Response:
    token = create_access_token(quem.id) if quem else None
    return await chamar_rota(app, metodo, f"{URL}{caminho}", sessao, token)


async def cenario(sessao: AsyncSession) -> tuple[Group, User]:
    rendeiras = await grupo(sessao)
    katia = await usuaria(sessao, 1, rendeiras)
    a = await acao(sessao, rendeiras)
    for n in (1, 2):
        await inscrever(sessao, await menina(sessao, n), a)
    return rendeiras, katia


# --- Quem exporta (RN-07) ------------------------------------------------------


async def test_sem_login_responde_401(db_session: AsyncSession) -> None:
    for metodo, caminho in (("GET", "/preview"), ("POST", ""), ("GET", "/1/file")):
        assert (await chamar(db_session, None, metodo, caminho)).status_code == 401


async def test_menina_e_curadoria_recebem_403(db_session: AsyncSession) -> None:
    await cenario(db_session)
    for role in (Role.GIRL, Role.NISE_TEAM):
        quem = await usuaria(db_session, 5 + len(role.value), None, role)
        for metodo, caminho in (("GET", "/preview"), ("POST", ""), ("GET", "/1/file")):
            response = await chamar(db_session, quem, metodo, caminho)
            assert response.status_code == 403


async def test_coordenadora_sem_grupo_recebe_403(db_session: AsyncSession) -> None:
    sem_grupo = await usuaria(db_session, 9, None)

    assert (await chamar(db_session, sem_grupo, "POST", "")).status_code == 403


async def test_coordenadora_so_exporta_as_meninas_do_proprio_grupo(
    db_session: AsyncSession,
) -> None:
    await cenario(db_session)
    outro = await grupo(db_session, "Outro Grupo Fictício")
    outra = await usuaria(db_session, 2, outro)

    feito = await chamar(db_session, outra, "POST", "")

    assert feito.status_code == 201
    assert feito.json()["rowCount"] == 0


async def test_exportacao_de_outro_grupo_nao_e_encontrada(
    db_session: AsyncSession,
) -> None:
    _, katia = await cenario(db_session)
    outro = await grupo(db_session, "Outro Grupo Fictício")
    outra = await usuaria(db_session, 2, outro)
    feito = await chamar(db_session, katia, "POST", "")

    response = await chamar(db_session, outra, "GET", f"/{feito.json()['id']}/file")

    assert response.status_code == 404


# --- Gerar e baixar (RF-F24.34) -----------------------------------------------


async def test_gerar_responde_o_arquivo_pronto_e_baixa_o_csv(
    db_session: AsyncSession,
) -> None:
    _, katia = await cenario(db_session)

    feito = await chamar(db_session, katia, "POST", "")

    assert feito.status_code == 201
    corpo = feito.json()
    assert corpo["filename"].startswith("rendeiras-do-codigo_dados-anonimos_")
    assert corpo["filename"].endswith(".csv")
    assert corpo["rowCount"] == 2
    assert corpo["columnCount"] == 8

    baixado = await chamar(db_session, katia, "GET", f"/{corpo['id']}/file")

    assert baixado.status_code == 200
    assert baixado.headers["content-type"] == "text/csv; charset=utf-8"
    assert corpo["filename"] in baixado.headers["content-disposition"]
    assert baixado.content.startswith("﻿".encode())
    assert len(baixado.text.strip().split("\r\n")) == 3
    assert "Menina Ficticia" not in baixado.text
    assert "@exemplo.com" not in baixado.text


async def test_link_vencido_responde_410(db_session: AsyncSession) -> None:
    rendeiras, katia = await cenario(db_session)
    vencido = DataExport(
        group_id=rendeiras.id,
        filename="x.csv",
        row_count=0,
        column_count=8,
        content="texto",
        expires_at=datetime.now(UTC) - timedelta(minutes=1),
    )
    db_session.add(vencido)
    await db_session.flush()

    response = await chamar(db_session, katia, "GET", f"/{vencido.id}/file")

    assert response.status_code == 410


async def test_arquivo_ja_removido_responde_410(db_session: AsyncSession) -> None:
    rendeiras, katia = await cenario(db_session)
    removido = DataExport(
        group_id=rendeiras.id,
        filename="x.csv",
        row_count=0,
        column_count=8,
        content=None,
        expires_at=datetime.now(UTC) + timedelta(minutes=5),
    )
    db_session.add(removido)
    await db_session.flush()

    assert (
        await chamar(db_session, katia, "GET", f"/{removido.id}/file")
    ).status_code == 410


# --- Revisão (RF-F24.32) -------------------------------------------------------


async def test_revisao_traz_cinco_linhas_e_o_total(db_session: AsyncSession) -> None:
    rendeiras, katia = await cenario(db_session)
    a = await acao(db_session, rendeiras, "Segunda oficina")
    for n in (3, 4, 5, 6):
        await inscrever(db_session, await menina(db_session, n), a)

    response = await chamar(db_session, katia, "GET", "/preview")

    assert response.status_code == 200
    corpo = response.json()
    assert len(corpo["rows"]) == 5
    assert corpo["totalRows"] == 6
    assert [c["kind"] for c in corpo["columns"]][:2] == ["code", "generalized"]
    assert len(corpo["rows"][0]) == len(corpo["columns"]) == 8
