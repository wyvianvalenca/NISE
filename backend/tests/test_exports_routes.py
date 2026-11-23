"""Exportação anônima (F24, #375): as rotas e quem pode chamá-las (RN-07).

Rodam no Postgres de teste (`db_session`). Dados fictícios.
"""

from collections.abc import Mapping
from datetime import UTC, date, datetime, timedelta

from httpx2 import Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.utils import create_access_token
from app.main import app
from app.modules.actions.models import ActionType
from app.modules.exports.models import DataExport
from app.modules.girls.models import Topic
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
    sessao: AsyncSession,
    quem: User | None,
    metodo: str,
    caminho: str,
    corpo: Mapping[str, object] | None = None,
) -> Response:
    token = create_access_token(quem.id) if quem else None
    return await chamar_rota(app, metodo, f"{URL}{caminho}", sessao, token, corpo)


async def cenario(sessao: AsyncSession) -> tuple[Group, User]:
    rendeiras = await grupo(sessao)
    katia = await usuaria(sessao, 1, rendeiras)
    a = await acao(sessao, rendeiras)
    for n in (1, 2):
        await inscrever(sessao, await menina(sessao, n), a)
    return rendeiras, katia


# --- Quem exporta (RN-07) ------------------------------------------------------


async def test_sem_login_responde_401(db_session: AsyncSession) -> None:
    for metodo, caminho in (
        ("GET", "/preview"),
        ("GET", "/summary"),
        ("GET", "/options"),
        ("POST", ""),
        ("GET", "/1/file"),
    ):
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


# --- Recorte (#378, RF-F24.09 e RF-F24.33) ------------------------------------


async def cenario_recorte(sessao: AsyncSession) -> tuple[Group, User]:
    g = await grupo(sessao)
    katia = await usuaria(sessao, 1, g)
    oficina26 = await acao(sessao, g, "Oficina 26")
    oficina25 = await acao(
        sessao, g, "Oficina 25", dia=date(2025, 3, 1), tags=(Topic.DADOS,)
    )
    palestra26 = await acao(sessao, g, "Palestra 26", tipo=ActionType.PALESTRA)
    ana, bia = await menina(sessao, 1), await menina(sessao, 2)
    for quem, em in (
        (ana, oficina26),
        (bia, oficina26),
        (ana, oficina25),
        (ana, palestra26),
    ):
        await inscrever(sessao, quem, em)
    return g, katia


async def test_opcoes_so_trazem_o_que_e_do_grupo(db_session: AsyncSession) -> None:
    g, katia = await cenario_recorte(db_session)
    outro = await grupo(db_session, "Outro Grupo Fictício")
    await acao(db_session, outro, "Ação alheia", dia=date(2024, 1, 1))

    response = await chamar(db_session, katia, "GET", "/options")

    assert response.status_code == 200
    corpo = response.json()
    assert corpo["years"] == [2026, 2025]
    assert sorted(a["name"] for a in corpo["actions"]) == [
        "Oficina 25",
        "Oficina 26",
        "Palestra 26",
    ]
    assert {"value": "oficina", "label": "Oficina"} in corpo["types"]
    assert len(corpo["tags"]) == 8
    assert g.id


async def test_resumo_segue_o_recorte(db_session: AsyncSession) -> None:
    _, katia = await cenario_recorte(db_session)

    tudo = await chamar(db_session, katia, "GET", "/summary")
    oficinas = await chamar(db_session, katia, "GET", "/summary?year=2026&type=oficina")

    assert tudo.json() == {"rows": 4, "girls": 2, "alone": 0, "actions": 3}
    assert oficinas.json() == {"rows": 2, "girls": 2, "alone": 0, "actions": 1}


async def test_recorte_por_tag_na_revisao_e_no_arquivo(
    db_session: AsyncSession,
) -> None:
    _, katia = await cenario_recorte(db_session)

    revisao = await chamar(db_session, katia, "GET", "/preview?tag=dados")
    feito = await chamar(db_session, katia, "POST", "", {"tag": "dados"})

    assert revisao.json()["totalRows"] == 1
    assert feito.status_code == 201
    assert feito.json()["rowCount"] == 1


async def test_pronto_tem_as_mesmas_linhas_da_barra(db_session: AsyncSession) -> None:
    _, katia = await cenario_recorte(db_session)
    corte = {"year": 2026, "type": "oficina"}

    barra = await chamar(db_session, katia, "GET", "/summary?year=2026&type=oficina")
    feito = await chamar(db_session, katia, "POST", "", corte)

    assert feito.json()["rowCount"] == barra.json()["rows"] == 2
    gravado = await db_session.scalar(select(DataExport))
    assert gravado is not None
    assert gravado.cut == {
        "year": 2026,
        "action_id": None,
        "type": "oficina",
        "tag": None,
    }


async def test_nao_se_recorta_por_acao_de_outro_grupo(
    db_session: AsyncSession,
) -> None:
    _, katia = await cenario_recorte(db_session)
    outro = await grupo(db_session, "Outro Grupo Fictício")
    alheia = await acao(db_session, outro, "Ação alheia")

    for caminho in (
        f"/summary?action_id={alheia.id}",
        f"/preview?action_id={alheia.id}",
    ):
        assert (await chamar(db_session, katia, "GET", caminho)).status_code == 404
    feito = await chamar(db_session, katia, "POST", "", {"actionId": alheia.id})
    assert feito.status_code == 404
    assert await db_session.scalar(select(DataExport)) is None


async def test_recorte_invalido_responde_422(db_session: AsyncSession) -> None:
    _, katia = await cenario_recorte(db_session)

    response = await chamar(db_session, katia, "GET", "/summary?type=inexistente")

    assert response.status_code == 422
