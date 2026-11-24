"""Ingressantes (C8) no Postgres de teste: instituição vazia e quem já ingressou.

Rodam com `db_session`, porque a regra é SQL. Dados fictícios.
"""

from datetime import UTC, date, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.utils import create_access_token
from app.main import app
from app.modules.actions.models import (
    Action,
    ActionFormat,
    ActionType,
    ActionVisibility,
    Participation,
)
from app.modules.admissions.models import (
    AdmissionOrigin,
    CourseLevel,
    Enrollment,
    ListMatch,
    OfficialList,
)
from app.modules.admissions.service import list_waiting_girls
from app.modules.girls.models import Girl
from app.modules.groups.models import Group, GroupCoordinator
from app.users.models import Role, User
from tests.helpers import chamar_rota

AGORA = datetime(2026, 10, 20, 12, 0, tzinfo=UTC)
SALVA = datetime(2026, 1, 1, tzinfo=UTC)


async def grupo_com_acao(sessao: AsyncSession) -> Group:
    grupo = Group(name="Rendeiras do Código")
    sessao.add(grupo)
    await sessao.flush()
    sessao.add(
        Action(
            group_id=grupo.id,
            name="Ação fictícia",
            type=ActionType.OFICINA,
            starts_on=date(2026, 5, 1),
            ends_on=date(2026, 5, 1),
            format=ActionFormat.ONLINE,
            visibility=ActionVisibility.CLOSED,
            attendance_registered_at=SALVA,
        )
    )
    await sessao.flush()
    return grupo


async def menina_do_grupo(sessao: AsyncSession, grupo: Group, n: int) -> Girl:
    # Com conta, convite do grupo e presença numa ação dele (girls_of_group).
    usuaria = User(email=f"menina{n}@exemplo.com", name=f"Menina {n}", role=Role.GIRL)
    sessao.add(usuaria)
    await sessao.flush()
    menina = Girl(
        email=usuaria.email,
        name=f"Menina Ficticia {n}",
        user_id=usuaria.id,
        origin_group_id=grupo.id,
    )
    sessao.add(menina)
    await sessao.flush()
    acao_id = await sessao.scalar(select(Action.id).where(Action.group_id == grupo.id))
    assert acao_id is not None
    sessao.add(Participation(girl_id=menina.id, action_id=acao_id, attended_at=SALVA))
    await sessao.flush()
    return menina


async def ingresso(sessao: AsyncSession, menina: Girl, instituicao: str | None) -> None:
    sessao.add(
        Enrollment(
            girl_id=menina.id,
            level=CourseLevel.GRADUACAO,
            course="Ciência da Computação",
            institution=instituicao,
            enrolled_on=date(2026, 3, 1),
            origin=AdmissionOrigin.SELF_DECLARED,
        )
    )
    await sessao.flush()


async def indicio(sessao: AsyncSession, menina: Girl, chamada: OfficialList) -> None:
    sessao.add(
        ListMatch(
            girl_id=menina.id,
            official_list_id=chamada.id,
            course="Ciência da Computação",
            level=CourseLevel.GRADUACAO,
            expires_at=AGORA + timedelta(days=10),
        )
    )
    await sessao.flush()


async def chamada(sessao: AsyncSession) -> OfficialList:
    lista = OfficialList(institution="UFAL", selection_process="Sisu 2027", call="1ª")
    sessao.add(lista)
    await sessao.flush()
    return lista


async def test_resumo_com_ingresso_sem_instituicao_nao_quebra(
    db_session: AsyncSession,
) -> None:
    # Regressão: a instituição é opcional (#383) e o resumo respondia 500.
    grupo = await grupo_com_acao(db_session)
    sem_onde = await menina_do_grupo(db_session, grupo, 1)
    com_onde = await menina_do_grupo(db_session, grupo, 2)
    await ingresso(db_session, sem_onde, None)
    await ingresso(db_session, com_onde, "UFAL")
    katia = User(email="katia@exemplo.com", name="Katia", role=Role.COORDINATOR)
    db_session.add(katia)
    await db_session.flush()
    db_session.add(GroupCoordinator(group_id=grupo.id, user_id=katia.id))
    await db_session.flush()

    response = await chamar_rota(
        app,
        "GET",
        "/api/coordinator/enrollments/summary",
        db_session,
        create_access_token(katia.id),
    )

    assert response.status_code == 200, response.text
    corpo = response.json()
    assert corpo["total"] == 2
    assert corpo["graduacao"]["count"] == 2
    assert corpo["graduacao"]["institutions"] == ["UFAL"]


async def test_quem_ja_ingressou_nao_aparece_como_aguardando(
    db_session: AsyncSession,
) -> None:
    # RF-F5.24: a linha de quem aguarda é só para a menina sem ingresso.
    grupo = await grupo_com_acao(db_session)
    lista = await chamada(db_session)
    ingressou = await menina_do_grupo(db_session, grupo, 1)
    so_indicio = await menina_do_grupo(db_session, grupo, 2)
    await ingresso(db_session, ingressou, "UFAL")
    await indicio(db_session, ingressou, lista)
    await indicio(db_session, so_indicio, lista)

    linhas, total = await list_waiting_girls(
        db_session, grupo.id, page=1, entered_total=1, entered_shown=1, now=AGORA
    )

    assert total == 1
    assert [id_ for id_, _ in linhas] == [so_indicio.id]
