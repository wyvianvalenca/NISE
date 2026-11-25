"""Histórico de exportações (F24, #376): quem, quando, recorte e linhas.

Rodam no Postgres de teste (`db_session`). Dados fictícios.
"""

from datetime import UTC, datetime, timedelta

from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.exports.models import DataExport
from app.modules.exports.service import HISTORY_LIMIT, purge_old_files
from app.modules.groups.models import Group
from app.users.models import Role, User
from tests.test_exports_routes import cenario, chamar, usuaria
from tests.test_exports_service import grupo


async def registrar(
    sessao: AsyncSession, do_grupo: Group, quem: User | None, quando: datetime
) -> DataExport:
    nova = DataExport(
        group_id=do_grupo.id,
        user_id=quem.id if quem else None,
        filename="x.csv",
        row_count=66,
        column_count=8,
        content="texto",
        expires_at=quando + timedelta(minutes=15),
        created_at=quando,
    )
    sessao.add(nova)
    await sessao.flush()
    return nova


async def test_historico_traz_quem_quando_recorte_e_linhas(
    db_session: AsyncSession,
) -> None:
    _, katia = await cenario(db_session)
    feito = await chamar(db_session, katia, "POST", "")

    response = await chamar(db_session, katia, "GET", "")

    assert response.status_code == 200
    [item] = response.json()
    assert item["id"] == feito.json()["id"]
    assert item["who"] == "Coord"
    assert item["rowCount"] == 2
    assert item["cut"]
    assert item["createdAt"]
    # Sem e-mail nem nome inteiro, e sem como baixar de novo.
    assert set(item) == {"id", "who", "createdAt", "cut", "rowCount"}


async def test_mais_recentes_primeiro(db_session: AsyncSession) -> None:
    rendeiras, katia = await cenario(db_session)
    agora = datetime.now(UTC)
    velha = await registrar(db_session, rendeiras, katia, agora - timedelta(days=30))
    nova = await registrar(db_session, rendeiras, katia, agora - timedelta(hours=1))

    response = await chamar(db_session, katia, "GET", "")

    assert [i["id"] for i in response.json()] == [nova.id, velha.id]


async def test_historico_tem_as_de_todas_as_coordenadoras_do_grupo(
    db_session: AsyncSession,
) -> None:
    rendeiras, katia = await cenario(db_session)
    joana = await usuaria(db_session, 2, rendeiras)
    agora = datetime.now(UTC)
    await registrar(db_session, rendeiras, joana, agora - timedelta(days=2))
    await registrar(db_session, rendeiras, katia, agora)

    response = await chamar(db_session, katia, "GET", "")

    assert len(response.json()) == 2


async def test_historico_nunca_mostra_exportacao_de_outro_grupo(
    db_session: AsyncSession,
) -> None:
    _, katia = await cenario(db_session)
    outro = await grupo(db_session, "Outro Grupo Fictício")
    outra = await usuaria(db_session, 3, outro)
    await registrar(db_session, outro, outra, datetime.now(UTC))

    response = await chamar(db_session, katia, "GET", "")

    assert response.json() == []


async def test_grupo_que_nunca_exportou_recebe_lista_vazia(
    db_session: AsyncSession,
) -> None:
    _, katia = await cenario(db_session)

    response = await chamar(db_session, katia, "GET", "")

    assert response.status_code == 200
    assert response.json() == []


async def test_historico_traz_so_as_mais_recentes(db_session: AsyncSession) -> None:
    rendeiras, katia = await cenario(db_session)
    agora = datetime.now(UTC)
    for n in range(HISTORY_LIMIT + 3):
        await registrar(db_session, rendeiras, katia, agora - timedelta(minutes=n))

    response = await chamar(db_session, katia, "GET", "")

    assert len(response.json()) == HISTORY_LIMIT


async def test_registro_continua_depois_que_o_arquivo_e_apagado(
    db_session: AsyncSession,
) -> None:
    rendeiras, katia = await cenario(db_session)
    agora = datetime.now(UTC)
    await registrar(db_session, rendeiras, katia, agora - timedelta(days=5))

    await purge_old_files(db_session, agora)
    response = await chamar(db_session, katia, "GET", "")

    assert len(response.json()) == 1


async def test_conta_removida_nao_apaga_o_registro(db_session: AsyncSession) -> None:
    rendeiras, katia = await cenario(db_session)
    await registrar(db_session, rendeiras, None, datetime.now(UTC))

    response = await chamar(db_session, katia, "GET", "")

    assert response.json()[0]["who"] == "Coordenadora"


async def test_menina_e_curadoria_recebem_403_no_historico(
    db_session: AsyncSession,
) -> None:
    await cenario(db_session)
    for n, role in enumerate((Role.GIRL, Role.NISE_TEAM)):
        quem = await usuaria(db_session, 20 + n, None, role)
        assert (await chamar(db_session, quem, "GET", "")).status_code == 403


async def test_sem_login_responde_401_no_historico(db_session: AsyncSession) -> None:
    assert (await chamar(db_session, None, "GET", "")).status_code == 401
