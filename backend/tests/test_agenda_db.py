"""O que a agenda (A14) lê do Postgres de verdade (#295): avaliações e datas.

Usa a fixture `db_session`. Dados fictícios.
"""

from datetime import UTC, date, datetime

from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.actions.models import (
    Action,
    ActionFormat,
    ActionType,
    ActionVisibility,
    Participation,
)
from app.modules.agenda.service import list_upcoming
from app.modules.answers.models import Answer, AnswerStage
from app.modules.answers.service import list_pending_ratings
from app.modules.dates.models import ImportantDate
from app.modules.followup.models import FollowupRound
from app.modules.girls.models import Girl
from app.modules.groups.models import Group
from app.users.models import User

# A conta foi criada em 15/01/2026 ao meio-dia em Maceió (15h em UTC).
CONTA_CRIADA = datetime(2026, 1, 15, 15, 0, tzinfo=UTC)
ATENDEU = datetime(2026, 3, 1, 15, 0, tzinfo=UTC)


async def criar_menina(db_session: AsyncSession, email: str) -> tuple[User, Girl]:
    user = User(email=email, name="Bia Fictícia", created_at=CONTA_CRIADA)
    db_session.add(user)
    await db_session.flush()
    girl = Girl(email=email, name="Bia Fictícia", user_id=user.id)
    db_session.add(girl)
    await db_session.flush()
    return user, girl


async def criar_acao(
    db_session: AsyncSession, group: Group, nome: str, dia: date
) -> Action:
    action = Action(
        group_id=group.id,
        name=nome,
        type=ActionType.OFICINA,
        starts_on=dia,
        ends_on=dia,
        format=ActionFormat.ONLINE,
        visibility=ActionVisibility.CLOSED,
    )
    db_session.add(action)
    await db_session.flush()
    return action


# --- avaliações pendentes (RF-F4.03b) -----------------------------------------


async def test_lista_todas_as_acoes_a_que_foi_e_nao_avaliou_a_mais_recente_primeiro(
    db_session: AsyncSession,
) -> None:
    user, girl = await criar_menina(db_session, "bia@exemplo.test")
    outra_user, outra = await criar_menina(db_session, "ana@exemplo.test")
    group = Group(name="Rendeiras")
    db_session.add(group)
    await db_session.flush()
    antiga = await criar_acao(db_session, group, "Oficina antiga", date(2026, 2, 1))
    recente = await criar_acao(db_session, group, "Oficina recente", date(2026, 3, 1))
    avaliada = await criar_acao(db_session, group, "Já avaliada", date(2026, 2, 15))
    faltou = await criar_acao(db_session, group, "Faltou", date(2026, 2, 20))
    so_da_outra = await criar_acao(db_session, group, "Só da outra", date(2026, 2, 25))
    db_session.add_all(
        [
            Participation(girl_id=girl.id, action_id=antiga.id, attended_at=ATENDEU),
            Participation(girl_id=girl.id, action_id=recente.id, attended_at=ATENDEU),
            Participation(girl_id=girl.id, action_id=avaliada.id, attended_at=ATENDEU),
            Participation(girl_id=girl.id, action_id=faltou.id),
            Participation(
                girl_id=outra.id, action_id=so_da_outra.id, attended_at=ATENDEU
            ),
            Answer(
                girl_id=girl.id,
                action_id=avaliada.id,
                stage=AnswerStage.RATING,
                score=5,
            ),
        ]
    )
    await db_session.flush()

    pendentes = await list_pending_ratings(db_session, user.id)

    assert [item.action_name for item in pendentes] == [
        "Oficina recente",
        "Oficina antiga",
    ]
    assert pendentes[0].group_name == "Rendeiras"
    assert pendentes[0].city_name is None
    assert [
        item.action_name
        for item in await list_pending_ratings(db_session, outra_user.id)
    ] == ["Só da outra"]


async def test_sem_participacao_nao_ha_avaliacao_pendente(
    db_session: AsyncSession,
) -> None:
    user, _ = await criar_menina(db_session, "bia@exemplo.test")

    assert await list_pending_ratings(db_session, user.id) == []


# --- datas (RF-F4.11b, RF-F4.06) ----------------------------------------------


async def test_datas_de_hoje_em_diante_sem_as_passadas(
    db_session: AsyncSession,
) -> None:
    user, _ = await criar_menina(db_session, "bia@exemplo.test")
    db_session.add_all(
        [
            ImportantDate(title="Passou", on=date(2026, 4, 19)),
            ImportantDate(title="Hoje", on=date(2026, 4, 20), details="Último dia"),
            ImportantDate(title="Depois", on=date(2026, 5, 3)),
        ]
    )
    await db_session.flush()

    itens = await list_upcoming(db_session, user.id, date(2026, 4, 20))

    datas = [(item.kind, item.title, item.on) for item in itens if item.kind == "date"]
    assert datas == [
        ("date", "Hoje", date(2026, 4, 20)),
        ("date", "Depois", date(2026, 5, 3)),
    ]
    assert itens[0].details == "Último dia"


async def test_rodadas_futuras_contam_da_conta_e_a_aberta_nao_entra(
    db_session: AsyncSession,
) -> None:
    user, _ = await criar_menina(db_session, "bia@exemplo.test")
    db_session.add(ImportantDate(title="Meio", on=date(2026, 10, 1)))
    await db_session.flush()

    # 20/04/2026: a de 3 meses (15/04) está aberta; faltam as outras três.
    itens = await list_upcoming(db_session, user.id, date(2026, 4, 20))

    assert [(item.kind, item.round, item.on) for item in itens] == [
        ("followup", FollowupRound.SIX_MONTHS, date(2026, 7, 15)),
        ("date", None, date(2026, 10, 1)),
        ("followup", FollowupRound.TWELVE_MONTHS, date(2027, 1, 15)),
        ("followup", FollowupRound.EIGHTEEN_MONTHS, date(2027, 7, 15)),
    ]


async def test_depois_de_todas_as_rodadas_nao_sobra_questionario(
    db_session: AsyncSession,
) -> None:
    user, _ = await criar_menina(db_session, "bia@exemplo.test")

    assert await list_upcoming(db_session, user.id, date(2028, 1, 1)) == []
