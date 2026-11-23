"""Questionário de acompanhamento no Postgres de verdade (#293).

Usa a fixture `db_session`: a resposta única por rodada é garantida pelo
banco, e as escolhas várias viram linhas próprias. Dados fictícios.
"""

import logging
from datetime import UTC, date, datetime

import pytest
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.admissions.models import AdmissionOrigin, CourseLevel, Enrollment
from app.modules.followup import service
from app.modules.followup.models import (
    Activity,
    ComputingView,
    CourseStatus,
    FollowupActivity,
    FollowupAnswer,
    FollowupHelp,
    FollowupRound,
    HelpWanted,
    StillEnrolled,
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
# A rodada de 6 meses abre em 15/07/2026.
RODADA_DE_6_MESES = datetime(2026, 7, 20, 15, 0, tzinfo=UTC)


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

    conferir = service._already_answered
    conferencias = 0

    async def so_a_primeira_nao_ve(*args: object) -> bool:
        # Só a conferência antes de gravar não vê a resposta do outro envio; a
        # de depois do erro de integridade vê.
        nonlocal conferencias
        conferencias += 1
        return False if conferencias == 1 else await conferir(*args)  # type: ignore[arg-type]

    monkeypatch.setattr(service, "_already_answered", so_a_primeira_nao_ve)

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


# --- Pergunta 3: "Você entrou num curso da área?" (#294) -------------------------


async def test_curso_registrado_com_data_e_origem_autodeclarada(
    db_session: AsyncSession,
) -> None:
    # RF-F6.02, RF-F6.03
    user = await criar_menina(db_session)

    resultado = await record_followup(
        db_session,
        user.id,
        respostas(
            courseStatus="graduacao",
            course="ciencia_computacao",
            institution="  UFAL  ",
        ),
        RODADA_ABERTA,
    )

    assert resultado is FollowupResult.SAVED
    ingresso = await db_session.scalar(select(Enrollment))
    assert ingresso is not None
    assert ingresso.level is CourseLevel.GRADUACAO
    assert ingresso.course == "Ciência da Computação"
    assert ingresso.institution == "UFAL"
    assert ingresso.enrolled_on == date(2026, 4, 20)
    assert ingresso.origin is AdmissionOrigin.SELF_DECLARED
    assert ingresso.official_list_id is None
    assert ingresso.left_on is None
    gravada = await db_session.scalar(select(FollowupAnswer))
    assert gravada is not None
    assert gravada.course_status is CourseStatus.GRADUACAO


async def test_outro_curso_guarda_o_nome_que_ela_digitou(
    db_session: AsyncSession,
) -> None:
    user = await criar_menina(db_session)

    await record_followup(
        db_session,
        user.id,
        respostas(courseStatus="tecnico", course="outro", otherCourse=" Eletrônica "),
        RODADA_ABERTA,
    )

    ingresso = await db_session.scalar(select(Enrollment))
    assert ingresso is not None
    assert ingresso.level is CourseLevel.TECNICO
    assert ingresso.course == "Eletrônica"


async def test_onde_vazio_fica_sem_instituicao(db_session: AsyncSession) -> None:
    # "Onde?" é opcional.
    user = await criar_menina(db_session)

    await record_followup(
        db_session,
        user.id,
        respostas(courseStatus="tecnico", course="redes", institution="   "),
        RODADA_ABERTA,
    )

    ingresso = await db_session.scalar(select(Enrollment))
    assert ingresso is not None
    assert ingresso.institution is None


@pytest.mark.parametrize(
    ("codigo", "status"),
    [("trying", CourseStatus.TRYING), ("not_yet", CourseStatus.NOT_YET)],
)
async def test_tentando_entrar_e_ainda_nao_nao_registram_curso(
    db_session: AsyncSession, codigo: str, status: CourseStatus
) -> None:
    # RN-22: "Tô tentando entrar" não conta como ingresso.
    user = await criar_menina(db_session)

    resultado = await record_followup(
        db_session, user.id, respostas(courseStatus=codigo), RODADA_ABERTA
    )

    assert resultado is FollowupResult.SAVED
    gravada = await db_session.scalar(select(FollowupAnswer))
    assert gravada is not None
    assert gravada.course_status is status
    total = await db_session.scalar(select(func.count()).select_from(Enrollment))
    assert total == 0


async def test_falha_ao_gravar_nao_deixa_nada_pela_metade(
    db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    # RNF-F6.01: a resposta e o ingresso vão no mesmo commit.
    user = await criar_menina(db_session)
    await db_session.commit()
    commit_de_verdade = db_session.commit

    async def falha_depois_de_gravar() -> None:
        # Tudo já foi mandado ao banco quando o commit falha.
        await db_session.flush()
        raise RuntimeError("queda no commit")

    monkeypatch.setattr(db_session, "commit", falha_depois_de_gravar)

    with pytest.raises(RuntimeError):
        await record_followup(
            db_session,
            user.id,
            respostas(courseStatus="graduacao", course="redes"),
            RODADA_ABERTA,
        )
    await db_session.rollback()

    monkeypatch.setattr(db_session, "commit", commit_de_verdade)
    for tabela in (FollowupAnswer, Enrollment):
        assert await db_session.scalar(select(func.count()).select_from(tabela)) == 0


async def test_texto_livre_do_curso_nao_vai_para_os_logs(
    db_session: AsyncSession, caplog: pytest.LogCaptureFixture
) -> None:
    # RN-11
    user = await criar_menina(db_session)
    caplog.set_level(logging.DEBUG, logger="app")

    await record_followup(
        db_session,
        user.id,
        respostas(
            courseStatus="graduacao",
            course="outro",
            otherCourse="Curso Secretíssimo",
            institution="Escola Reservada",
        ),
        RODADA_ABERTA,
    )

    assert "Secretíssimo" not in caplog.text
    assert "Reservada" not in caplog.text


async def test_erro_de_integridade_que_nao_e_de_resposta_repetida_sobe(
    db_session: AsyncSession,
) -> None:
    # Só a restrição de uma resposta por rodada vira "já respondeu"; outra
    # violação não pode ser escondida.
    user = await criar_menina(db_session)
    await db_session.commit()
    girl_id = await db_session.scalar(select(Girl.id).where(Girl.user_id == user.id))
    assert girl_id is not None
    # Duas linhas iguais de ingresso numa chamada que não existe: a segunda
    # quebra a chave estrangeira no commit.
    db_session.add(
        Enrollment(
            girl_id=girl_id,
            level=CourseLevel.TECNICO,
            course="x",
            institution=None,
            enrolled_on=date(2026, 4, 20),
            origin=AdmissionOrigin.OFFICIAL_LIST,
            official_list_id=999_999,
        )
    )

    with pytest.raises(IntegrityError):
        await record_followup(
            db_session, user.id, respostas(futureSelf="maybe"), RODADA_ABERTA
        )


# --- "Continua nesse curso?" (#299) -------------------------------------------------


async def declarar_curso(db_session: AsyncSession, user: User) -> None:
    """Ela declara Graduação em Redes de computadores na rodada de 3 meses."""
    await record_followup(
        db_session,
        user.id,
        respostas(courseStatus="graduacao", course="redes", institution="UFAL"),
        RODADA_ABERTA,
    )


async def ingressos(db_session: AsyncSession) -> list[Enrollment]:
    result = await db_session.scalars(select(Enrollment).order_by(Enrollment.id))
    return list(result)


async def test_sem_curso_registrado_nao_ha_curso_atual(
    db_session: AsyncSession,
) -> None:
    user = await criar_menina(db_session)

    atual = await get_current_followup(db_session, user.id, RODADA_ABERTA)

    assert atual is not None
    assert atual.current_course is None


async def test_com_curso_registrado_a_tela_recebe_o_curso_atual(
    db_session: AsyncSession,
) -> None:
    user = await criar_menina(db_session)
    await declarar_curso(db_session, user)

    atual = await get_current_followup(db_session, user.id, RODADA_DE_6_MESES)

    assert atual is not None
    assert atual.answered is False
    assert atual.current_course is not None
    assert atual.current_course.level is CourseLevel.GRADUACAO
    assert atual.current_course.course == "Redes de computadores"


async def test_sim_continuo_nao_muda_o_curso(db_session: AsyncSession) -> None:
    user = await criar_menina(db_session)
    await declarar_curso(db_session, user)

    resultado = await record_followup(
        db_session,
        user.id,
        respostas(round="six_months", stillEnrolled="yes"),
        RODADA_DE_6_MESES,
    )

    assert resultado is FollowupResult.SAVED
    [curso] = await ingressos(db_session)
    assert curso.left_on is None
    resposta = await db_session.scalar(
        select(FollowupAnswer).where(FollowupAnswer.round == FollowupRound.SIX_MONTHS)
    )
    assert resposta is not None
    assert resposta.still_enrolled is StillEnrolled.YES


async def test_mudei_de_curso_guarda_o_anterior_com_a_data_e_registra_o_novo(
    db_session: AsyncSession,
) -> None:
    # RF-F6.05
    user = await criar_menina(db_session)
    await declarar_curso(db_session, user)

    resultado = await record_followup(
        db_session,
        user.id,
        respostas(
            round="six_months",
            stillEnrolled="changed",
            courseStatus="tecnico",
            course="outro",
            otherCourse="Eletrônica",
        ),
        RODADA_DE_6_MESES,
    )

    assert resultado is FollowupResult.SAVED
    antigo, novo = await ingressos(db_session)
    assert antigo.course == "Redes de computadores"
    assert antigo.enrolled_on == date(2026, 4, 20)
    assert antigo.left_on == date(2026, 7, 20)
    assert novo.level is CourseLevel.TECNICO
    assert novo.course == "Eletrônica"
    assert novo.enrolled_on == date(2026, 7, 20)
    assert novo.origin is AdmissionOrigin.SELF_DECLARED
    assert novo.left_on is None
    atual = await get_current_followup(db_session, user.id, RODADA_DE_6_MESES)
    assert atual is not None
    assert atual.current_course is not None
    assert atual.current_course.course == "Eletrônica"


async def test_parei_por_enquanto_registra_a_saida_e_guarda_o_ingresso(
    db_session: AsyncSession,
) -> None:
    # RF-F6.06
    user = await criar_menina(db_session)
    await declarar_curso(db_session, user)

    resultado = await record_followup(
        db_session,
        user.id,
        respostas(round="six_months", stillEnrolled="stopped"),
        RODADA_DE_6_MESES,
    )

    assert resultado is FollowupResult.SAVED
    [curso] = await ingressos(db_session)
    assert curso.course == "Redes de computadores"
    assert curso.enrolled_on == date(2026, 4, 20)
    assert curso.left_on == date(2026, 7, 20)


async def test_depois_de_parar_a_proxima_rodada_pergunta_a_entrada_de_novo(
    db_session: AsyncSession,
) -> None:
    user = await criar_menina(db_session)
    await declarar_curso(db_session, user)
    await record_followup(
        db_session,
        user.id,
        respostas(round="six_months", stillEnrolled="stopped"),
        RODADA_DE_6_MESES,
    )
    doze_meses = datetime(2027, 1, 20, 15, 0, tzinfo=UTC)

    atual = await get_current_followup(db_session, user.id, doze_meses)

    assert atual is not None
    assert atual.current_course is None
    # E ela pode declarar um curso de novo, como na primeira vez.
    resultado = await record_followup(
        db_session,
        user.id,
        respostas(
            round="twelve_months", courseStatus="graduacao", course="ciencia_computacao"
        ),
        doze_meses,
    )
    assert resultado is FollowupResult.SAVED
    assert len(await ingressos(db_session)) == 2


async def test_quem_estava_tentando_entrar_declara_o_curso_na_rodada_seguinte(
    db_session: AsyncSession,
) -> None:
    user = await criar_menina(db_session)
    await record_followup(
        db_session, user.id, respostas(courseStatus="trying"), RODADA_ABERTA
    )

    atual = await get_current_followup(db_session, user.id, RODADA_DE_6_MESES)
    assert atual is not None
    assert atual.current_course is None
    resultado = await record_followup(
        db_session,
        user.id,
        respostas(round="six_months", courseStatus="graduacao", course="redes"),
        RODADA_DE_6_MESES,
    )

    assert resultado is FollowupResult.SAVED
    assert len(await ingressos(db_session)) == 1


async def test_continua_nesse_curso_sem_curso_registrado_e_recusado(
    db_session: AsyncSession,
) -> None:
    # Escolha: o back recusa (422 na rota) e não grava nada.
    user = await criar_menina(db_session)

    resultado = await record_followup(
        db_session, user.id, respostas(stillEnrolled="yes"), RODADA_ABERTA
    )

    assert resultado is FollowupResult.INVALID_COURSE_ANSWER
    total = await db_session.scalar(select(func.count()).select_from(FollowupAnswer))
    assert total == 0


async def test_pergunta_de_entrada_com_curso_registrado_e_recusada(
    db_session: AsyncSession,
) -> None:
    # Com curso registrado a pergunta é "Continua nesse curso?" (D-63): declarar
    # outro curso sem dizer que mudou deixaria dois cursos em andamento.
    user = await criar_menina(db_session)
    await declarar_curso(db_session, user)

    resultado = await record_followup(
        db_session,
        user.id,
        respostas(round="six_months", courseStatus="graduacao", course="redes"),
        RODADA_DE_6_MESES,
    )

    assert resultado is FollowupResult.INVALID_COURSE_ANSWER
    assert len(await ingressos(db_session)) == 1


async def test_falha_ao_gravar_parei_nao_deixa_a_saida_pela_metade(
    db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    # RNF-F6.01: a resposta e a data de saída vão no mesmo commit.
    user = await criar_menina(db_session)
    await declarar_curso(db_session, user)
    commit_de_verdade = db_session.commit

    async def falha_depois_de_gravar() -> None:
        await db_session.flush()
        raise RuntimeError("queda no commit")

    monkeypatch.setattr(db_session, "commit", falha_depois_de_gravar)
    with pytest.raises(RuntimeError):
        await record_followup(
            db_session,
            user.id,
            respostas(round="six_months", stillEnrolled="stopped"),
            RODADA_DE_6_MESES,
        )
    await db_session.rollback()
    monkeypatch.setattr(db_session, "commit", commit_de_verdade)

    [curso] = await ingressos(db_session)
    assert curso.left_on is None
    resposta = await db_session.scalar(
        select(FollowupAnswer).where(FollowupAnswer.round == FollowupRound.SIX_MONTHS)
    )
    assert resposta is None
