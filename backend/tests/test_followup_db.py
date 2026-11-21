"""Questionário de acompanhamento no Postgres de verdade (#293).

Usa a fixture `db_session`: a resposta única por rodada é garantida pelo
banco, e as escolhas várias viram linhas próprias. Dados fictícios.
"""

from datetime import UTC, datetime

import pytest
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.followup import service
from app.modules.followup.models import (
    Activity,
    ComputingView,
    FollowupActivity,
    FollowupAnswer,
    FollowupHelp,
    FollowupRound,
    HelpWanted,
)
from app.modules.followup.schemas import FollowupIn
from app.modules.followup.service import (
    FollowupResult,
    get_current_followup,
    record_followup,
)
from app.modules.girls.models import Girl
from app.users.models import User

# A conta foi criada em 15/01/2026 ao meio-dia em Maceió (15h em UTC).
CONTA_CRIADA = datetime(2026, 1, 15, 15, 0, tzinfo=UTC)
# Datas em UTC ao meio-dia de Maceió.
ANTES_DA_RODADA = datetime(2026, 4, 14, 15, 0, tzinfo=UTC)
RODADA_ABERTA = datetime(2026, 4, 20, 15, 0, tzinfo=UTC)
RODADA_FECHADA = datetime(2026, 5, 15, 15, 0, tzinfo=UTC)


async def criar_menina(
    db_session: AsyncSession, email: str = "bia@exemplo.test"
) -> User:
    user = User(email=email, name="Bia Fictícia", created_at=CONTA_CRIADA)
    db_session.add(user)
    await db_session.flush()
    db_session.add(Girl(email=email, name="Bia Fictícia", user_id=user.id))
    await db_session.flush()
    return user


def respostas(**campos: object) -> FollowupIn:
    return FollowupIn.model_validate({"round": FollowupRound.THREE_MONTHS, **campos})


async def test_antes_de_3_meses_nao_ha_questionario(db_session: AsyncSession) -> None:
    user = await criar_menina(db_session)

    assert await get_current_followup(db_session, user.id, ANTES_DA_RODADA) is None


async def test_na_rodada_ela_ve_o_questionario_com_o_primeiro_nome(
    db_session: AsyncSession,
) -> None:
    user = await criar_menina(db_session)

    atual = await get_current_followup(db_session, user.id, RODADA_ABERTA)

    assert atual is not None
    assert atual.round is FollowupRound.THREE_MONTHS
    assert atual.first_name == "Bia"
    assert atual.answered is False


async def test_respostas_ficam_ligadas_a_ela_e_a_rodada(
    db_session: AsyncSession,
) -> None:
    # RF-F4.07, D-60: ligadas à menina e à rodada, não a uma ação.
    user = await criar_menina(db_session)

    resultado = await record_followup(
        db_session,
        user.id,
        respostas(
            computingView="want_to_follow",
            activities=["online_course", "event"],
            helps=["mentoring"],
            comment="  Gostei muito  ",
        ),
        RODADA_ABERTA,
    )

    assert resultado is FollowupResult.SAVED
    gravada = await db_session.scalar(select(FollowupAnswer))
    assert gravada is not None
    assert gravada.round is FollowupRound.THREE_MONTHS
    assert gravada.computing_view is ComputingView.WANT_TO_FOLLOW
    assert gravada.future_self is None
    assert gravada.comment == "Gostei muito"
    escolhas = set(await db_session.scalars(select(FollowupActivity.activity)))
    assert escolhas == {Activity.ONLINE_COURSE, Activity.EVENT}
    assert list(await db_session.scalars(select(FollowupHelp.help))) == [
        HelpWanted.MENTORING
    ]


async def test_depois_de_responder_ela_ve_que_ja_respondeu(
    db_session: AsyncSession,
) -> None:
    user = await criar_menina(db_session)
    await record_followup(
        db_session, user.id, respostas(futureSelf="maybe"), RODADA_ABERTA
    )

    atual = await get_current_followup(db_session, user.id, RODADA_ABERTA)

    assert atual is not None
    assert atual.answered is True


async def test_ela_so_responde_cada_rodada_uma_vez(db_session: AsyncSession) -> None:
    user = await criar_menina(db_session)
    await record_followup(
        db_session, user.id, respostas(futureSelf="maybe"), RODADA_ABERTA
    )

    segunda = await record_followup(
        db_session, user.id, respostas(futureSelf="sure"), RODADA_ABERTA
    )

    assert segunda is FollowupResult.ALREADY_ANSWERED
    total = await db_session.scalar(select(func.count()).select_from(FollowupAnswer))
    assert total == 1


async def test_depois_dos_30_dias_a_rodada_nao_aceita_resposta(
    db_session: AsyncSession,
) -> None:
    # RN-39.
    user = await criar_menina(db_session)

    resultado = await record_followup(
        db_session, user.id, respostas(futureSelf="maybe"), RODADA_FECHADA
    )

    assert resultado is FollowupResult.NO_OPEN_ROUND
    assert await get_current_followup(db_session, user.id, RODADA_FECHADA) is None


async def test_resposta_de_outra_rodada_e_recusada(db_session: AsyncSession) -> None:
    # A tela mandou a rodada de 6 meses, mas a aberta é a de 3.
    user = await criar_menina(db_session)

    resultado = await record_followup(
        db_session,
        user.id,
        FollowupIn.model_validate({"round": "six_months", "futureSelf": "maybe"}),
        RODADA_ABERTA,
    )

    assert resultado is FollowupResult.NO_OPEN_ROUND


async def test_quem_nao_tem_registro_de_menina_nao_tem_questionario(
    db_session: AsyncSession,
) -> None:
    user = User(email="coord@exemplo.test", name="Coord Fictícia")
    db_session.add(user)
    await db_session.flush()

    assert await get_current_followup(db_session, user.id, RODADA_ABERTA) is None


async def test_dois_envios_ao_mesmo_tempo_gravam_uma_resposta_so(
    db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    # O segundo envio passa pela conferência antes do primeiro gravar; quem
    # barra é a restrição única do banco.
    user = await criar_menina(db_session)
    await record_followup(
        db_session, user.id, respostas(futureSelf="maybe"), RODADA_ABERTA
    )

    async def ainda_nao_respondeu(*_: object) -> bool:
        return False

    monkeypatch.setattr(service, "_already_answered", ainda_nao_respondeu)

    segunda = await record_followup(
        db_session, user.id, respostas(futureSelf="sure"), RODADA_ABERTA
    )

    assert segunda is FollowupResult.ALREADY_ANSWERED


async def test_banco_recusa_segunda_resposta_da_mesma_rodada(
    db_session: AsyncSession,
) -> None:
    user = await criar_menina(db_session)
    girl_id = await db_session.scalar(select(Girl.id).where(Girl.user_id == user.id))
    assert girl_id is not None
    db_session.add(FollowupAnswer(girl_id=girl_id, round=FollowupRound.THREE_MONTHS))
    await db_session.flush()

    db_session.add(FollowupAnswer(girl_id=girl_id, round=FollowupRound.THREE_MONTHS))
    with pytest.raises(IntegrityError):
        await db_session.flush()
