"""Excluir minha conta e meus dados no Postgres de teste (RF-F7.09, #394).

Os painéis do grupo contam por SQL, então só o banco de verdade diz se "os
números não mudam" e se "nada identificável sobra". Dados fictícios. As
classificações das tabelas ficam em test_account_deletion.py.
"""

import dataclasses
import logging
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from typing import Any

import pytest
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.models import PasswordResetToken
from app.auth.schemas import EmailSignupIn
from app.auth.service import signup_with_email
from app.auth.utils import create_access_token
from app.db.base import Base
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
    Approval,
    CourseLevel,
    DismissedMatch,
    Enrollment,
    ListMatch,
    MatchEmail,
    OfficialList,
)
from app.modules.admissions.search import _girls_by_name
from app.modules.admissions.service import (
    get_enrollment_summary,
    list_group_enrollments,
)
from app.modules.answers.models import Answer, AnswerStage
from app.modules.attendance.emails import (
    queue_attendance_emails,
    send_attendance_emails,
)
from app.modules.attendance.models import AttendanceEmail, AttendanceEmailKind
from app.modules.attendance.service import build_attendance_page
from app.modules.cities.models import City
from app.modules.consents.models import TermsAcceptance
from app.modules.consents.service import CURRENT_TERMS_VERSION
from app.modules.followup.models import (
    Activity,
    ComputingView,
    CourseStatus,
    FollowupActivity,
    FollowupAnswer,
    FollowupHelp,
    FollowupRound,
    HelpWanted,
)
from app.modules.girl_file.models import (
    DismissReason,
    FileEntry,
    FileStatus,
    SimilarChoice,
)
from app.modules.girls.deletion import DeletionResult, delete_account
from app.modules.girls.models import Girl, GirlTopic, StudyStage, Topic
from app.modules.girls.utils import today_in_maceio
from app.modules.groups.models import Group, Invite
from app.modules.registrations.service import list_registrations
from app.modules.results.service import (
    Period,
    ResultsFilters,
    after_action,
    entered_the_field,
)
from app.users.models import OAuthAccount, Provider, Role, User
from tests.helpers import chamar_rota
from tests.test_account_deletion import APAGAR, DESTINO

HOJE = today_in_maceio()
SALVA = datetime(2026, 1, 1, tzinfo=UTC)
CIDADE = 2704302

# O que identifica a Alana: nada disso pode sobrar em nenhuma tabela.
NOME = "Alana Ficticia"
EMAIL = "alana@exemplo.com"
WHATSAPP = "82 98888-7766"
NASCIMENTO = date(2009, 7, 23)
COMENTARIO = "comentario-privado-da-alana"
COMENTARIO_FOLLOWUP = "conto-mais-sobre-mim-followup"
INSTITUICAO = "Instituto Ficticio de Maceio"
GOOGLE_ID = "google-sub-ficticio-9911"
CURSO_DIGITADO = "curso-digitado-por-ela"
IDENTIFICA = [
    dado.lower()
    for dado in (
        EMAIL,
        "alana",
        "ficticia",
        WHATSAPP,
        str(NASCIMENTO),
        COMENTARIO,
        COMENTARIO_FOLLOWUP,
        INSTITUICAO,
        GOOGLE_ID,
        CURSO_DIGITADO,
    )
]


@dataclass
class Cenario:
    grupo: Group
    passada: Action
    passada_2: Action
    futura: Action
    alana: Girl
    alana_user: User
    bia: Girl
    cris: Girl


async def acao(
    sessao: AsyncSession, grupo: Group, nome: str, dias: int, concluida: bool
) -> Action:
    dia = HOJE + timedelta(days=dias)
    nova = Action(
        group_id=grupo.id,
        name=nome,
        type=ActionType.OFICINA,
        starts_on=dia,
        ends_on=dia,
        format=ActionFormat.ONLINE,
        visibility=ActionVisibility.CLOSED,
        attendance_registered_at=SALVA if concluida else None,
    )
    sessao.add(nova)
    await sessao.flush()
    return nova


async def menina(
    sessao: AsyncSession, grupo: Group, nome: str, email: str
) -> tuple[Girl, User]:
    usuaria = User(email=email, name=nome, password_hash="hash-ficticio")
    usuaria.role = Role.GIRL
    sessao.add(usuaria)
    await sessao.flush()
    sessao.add(TermsAcceptance(user_id=usuaria.id, terms_version=CURRENT_TERMS_VERSION))
    girl = Girl(
        email=email,
        name=nome,
        user_id=usuaria.id,
        origin_group_id=grupo.id,
        birth_date=date(2008, 1, 5),
        city_ibge_code=CIDADE,
        study_stage=StudyStage.MEDIO,
    )
    sessao.add(girl)
    await sessao.flush()
    return girl, usuaria


def inscricao(
    girl: Girl, acao: Action, *, presente: bool, completa: bool = False
) -> Participation:
    return Participation(
        girl_id=girl.id,
        action_id=acao.id,
        attended_at=SALVA if presente else None,
        saved_present=presente,
        name=NOME if completa else None,
        whatsapp=WHATSAPP if completa else None,
        study_stage=StudyStage.MEDIO if completa else None,
        school_year="2º ano" if completa else None,
    )


async def montar(sessao: AsyncSession) -> Cenario:
    """Um grupo com três meninas e tudo que a Alana tem espalhado pelo banco."""
    sessao.add(City(id=CIDADE, name="Maceió", state="AL", search_name="maceio, al"))
    grupo = Group(name="Rendeiras do Código")
    sessao.add(grupo)
    await sessao.flush()
    passada = await acao(sessao, grupo, "Oficina de Python", -30, True)
    passada_2 = await acao(sessao, grupo, "Oficina de Robótica", -20, True)
    futura = await acao(sessao, grupo, "Oficina de Dados", 30, False)

    alana, alana_user = await menina(sessao, grupo, NOME, EMAIL)
    alana.birth_date = NASCIMENTO
    bia, _ = await menina(sessao, grupo, "Bia Souza", "bia@exemplo.com")
    cris, _ = await menina(sessao, grupo, "Cris Lima", "cris@exemplo.com")

    # Contas e acessos dela.
    sessao.add(
        OAuthAccount(
            user_id=alana_user.id, provider=Provider.GOOGLE, provider_user_id=GOOGLE_ID
        )
    )
    sessao.add(
        PasswordResetToken(
            user_id=alana_user.id,
            token_hash="hash-do-link-ficticio",
            expires_at=datetime.now(UTC) + timedelta(hours=1),
        )
    )
    sessao.add(GirlTopic(girl_id=alana.id, topic=Topic.IA))
    sessao.add(GirlTopic(girl_id=bia.id, topic=Topic.DADOS))

    # Inscrições: as três na ação passada (a da Alana com tudo preenchido), duas
    # na outra passada, e a Alana e a Bia na futura.
    for girl in (alana, bia, cris):
        sessao.add(inscricao(girl, passada, presente=True, completa=girl is alana))
    sessao.add(inscricao(alana, passada_2, presente=True, completa=True))
    sessao.add(inscricao(bia, passada_2, presente=True))
    sessao.add(inscricao(alana, futura, presente=False, completa=True))
    sessao.add(inscricao(bia, futura, presente=False))

    # E-mails da presença: avaliação enviada na passada (as duas); a da Alana na
    # outra passada ainda está na fila.
    sessao.add(
        AttendanceEmail(
            girl_id=alana.id,
            action_id=passada.id,
            kind=AttendanceEmailKind.EVALUATION,
            sent_at=SALVA,
        )
    )
    sessao.add(
        AttendanceEmail(
            girl_id=bia.id,
            action_id=passada.id,
            kind=AttendanceEmailKind.EVALUATION,
            sent_at=SALVA,
        )
    )
    sessao.add(
        AttendanceEmail(
            girl_id=alana.id,
            action_id=passada_2.id,
            kind=AttendanceEmailKind.EVALUATION,
        )
    )
    sessao.add(
        Invite(
            code="convite-pessoal-ficticio",
            group_id=grupo.id,
            girl_id=alana.id,
            expires_at=datetime.now(UTC) + timedelta(days=30),
        )
    )
    sessao.add(
        Invite(
            code="convite-pessoal-da-bia",
            group_id=grupo.id,
            girl_id=bia.id,
            expires_at=datetime.now(UTC) + timedelta(days=30),
        )
    )
    sessao.add(
        Invite(
            code="convite-do-grupo",
            group_id=grupo.id,
            expires_at=datetime.now(UTC) + timedelta(days=30),
        )
    )

    # Respostas: a nota e as escolhas ficam; o texto livre sai.
    sessao.add(
        Answer(
            girl_id=alana.id,
            action_id=passada.id,
            stage=AnswerStage.RATING,
            score=4,
            comment=COMENTARIO,
        )
    )
    resposta = FollowupAnswer(
        girl_id=alana.id,
        round=FollowupRound.THREE_MONTHS,
        computing_view=ComputingView.WANT_TO_FOLLOW,
        comment=COMENTARIO_FOLLOWUP,
    )
    sessao.add(resposta)
    await sessao.flush()
    sessao.add(FollowupActivity(answer_id=resposta.id, activity=Activity.ONLINE_COURSE))
    sessao.add(FollowupHelp(answer_id=resposta.id, help=HelpWanted.MENTORING))

    # O curso que ela deixou, com o nome digitado em "Outro curso".
    sessao.add(
        Enrollment(
            girl_id=alana.id,
            level=CourseLevel.TECNICO,
            course=CURSO_DIGITADO,
            enrolled_on=date(2025, 3, 1),
            left_on=date(2025, 12, 1),
            origin=AdmissionOrigin.SELF_DECLARED,
        )
    )

    # Ingresso: Alana e Bia (Cris só entra no denominador do percentual).
    for girl, instituicao in ((alana, INSTITUICAO), (bia, "UFAL")):
        sessao.add(
            Enrollment(
                girl_id=girl.id,
                level=CourseLevel.GRADUACAO,
                course="Ciência da Computação",
                institution=instituicao,
                enrolled_on=date(2026, 3, 1),
                origin=AdmissionOrigin.SELF_DECLARED,
            )
        )

    # F31: indício aberto e "Não sou eu" da Alana, e aprovação; indício da Bia.
    ufal = OfficialList(institution="UFAL", selection_process="Sisu 2027", call="1ª")
    ifal = OfficialList(institution="IFAL", selection_process="Edital 2027", call="1ª")
    sessao.add_all([ufal, ifal])
    await sessao.flush()
    indicio = ListMatch(
        girl_id=alana.id,
        official_list_id=ufal.id,
        course="Ciência da Computação",
        level=CourseLevel.GRADUACAO,
        expires_at=datetime.now(UTC) + timedelta(days=10),
    )
    indicio_bia = ListMatch(
        girl_id=bia.id,
        official_list_id=ufal.id,
        course="Ciência da Computação",
        level=CourseLevel.GRADUACAO,
        expires_at=datetime.now(UTC) + timedelta(days=10),
    )
    sessao.add_all([indicio, indicio_bia])
    await sessao.flush()
    sessao.add(MatchEmail(list_match_id=indicio.id))
    sessao.add(MatchEmail(list_match_id=indicio_bia.id))
    sessao.add(DismissedMatch(girl_id=alana.id, official_list_id=ifal.id))
    sessao.add(
        Approval(
            girl_id=alana.id,
            level=CourseLevel.TECNICO,
            course="Informática",
            institution=INSTITUICAO,
            origin=AdmissionOrigin.SELF_DECLARED,
        )
    )

    # Filé: ela se inscreveu num evento e pediu lembrete.
    sessao.add(
        FileEntry(
            girl_id=alana.id,
            action_id=futura.id,
            status=FileStatus.SIGNED_UP,
            reminder=True,
        )
    )
    # E concluiu no filé o evento de uma ação depois da primeira a que veio.
    sessao.add(
        FileEntry(
            girl_id=alana.id,
            action_id=passada_2.id,
            status=FileStatus.CONCLUDED,
            concluded_on=passada_2.starts_on,
            rating=5,
            similar_choice=SimilarChoice.MAIS_AVANCADO,
        )
    )
    await sessao.flush()

    return Cenario(grupo, passada, passada_2, futura, alana, alana_user, bia, cris)


async def numeros(sessao: AsyncSession, c: Cenario) -> dict[str, Any]:
    """Tudo que os painéis C2, C3, C5 e C8 mostram em números."""
    sessao.expunge_all()
    inscritas, total = await list_registrations(sessao, c.passada, None, 0, 100)
    pagina = await build_attendance_page(sessao, c.passada, HOJE)
    depois = await after_action(
        sessao, c.grupo.id, ResultsFilters(period=Period.ALL), HOJE
    )
    entraram = await entered_the_field(
        sessao, c.grupo.id, ResultsFilters(period=Period.ALL), HOJE
    )
    ingressos, total_ingressos = await list_group_enrollments(sessao, c.grupo.id, 1)
    resumo = await get_enrollment_summary(sessao, c.grupo.id)

    return {
        "c2_total": total,
        # A ordem segue o nome mostrado, que muda; o que importa são as linhas.
        "c2_participacoes": sorted(p.id for p, _, _ in inscritas),
        "c3": {
            "registered_count": pagina.registered_count,
            "saved_count": pagina.saved_count,
            "present_count": pagina.present_count,
            "invites_sent": pagina.invites_sent,
            "evaluations_sent": pagina.evaluations_sent,
            "linhas": len(pagina.girls),
        },
        "c5": dataclasses.asdict(depois),
        "c5_entraram": [dataclasses.asdict(etapa) for etapa in entraram],
        "c8_total": total_ingressos,
        "c8_ids": [enrollment.id for enrollment, _ in ingressos],
        "c8_resumo": {
            "total": resumo.total,
            "percent": resumo.percent,
            "graduacao": resumo.graduacao.count,
            "tecnico": resumo.tecnico.count,
        },
    }


async def excluir_pela_rota(sessao: AsyncSession, c: Cenario) -> None:
    response = await chamar_rota(
        app, "DELETE", "/api/profile", sessao, create_access_token(c.alana_user.id)
    )
    assert response.status_code == 204, response.text
    sessao.expunge_all()


async def todas_as_linhas(sessao: AsyncSession) -> dict[str, list[tuple[Any, ...]]]:
    """SELECT * de todas as tabelas, para varrer ou comparar."""
    linhas: dict[str, list[tuple[Any, ...]]] = {}
    for nome in sorted(Base.metadata.tables):
        resultado = await sessao.execute(text(f'SELECT * FROM "{nome}"'))
        linhas[nome] = sorted((tuple(r) for r in resultado), key=repr)
    return linhas


# C4: os números dos painéis são iguais antes e depois.
async def test_os_numeros_dos_paineis_nao_mudam(db_session: AsyncSession) -> None:
    c = await montar(db_session)
    # "Elas entraram na área?" separa pela etapa escolar do cadastro, que fica.
    db_session.add(
        FollowupAnswer(
            girl_id=c.alana.id,
            round=FollowupRound.SIX_MONTHS,
            course_status=CourseStatus.GRADUACAO,
        )
    )
    await db_session.flush()
    antes = await numeros(db_session, c)
    # A linha dela existe, ainda com os dados.
    assert antes["c2_total"] == 3
    assert antes["c3"] == {
        "registered_count": 3,
        "saved_count": 3,
        "present_count": 3,
        "invites_sent": 0,
        "evaluations_sent": 2,
        "linhas": 3,
    }
    assert antes["c8_resumo"] == {
        "total": 2,
        "percent": 67,
        "graduacao": 2,
        "tecnico": 0,
    }

    # O filé dela conta nos dois cartões (RF-F5.31).
    assert antes["c5"]["started_file"]["participants"] == 1
    assert antes["c5"]["concluded_file"]["participants"] == 1
    medio = next(e for e in antes["c5_entraram"] if e["stage"].value == "medio")
    assert medio["bars"][0]["graduacao"] == 1

    await excluir_pela_rota(db_session, c)

    assert await numeros(db_session, c) == antes


# C4: a linha dela continua, com o rótulo e sem o que identifica.
async def test_a_linha_dela_fica_com_o_rotulo_anonimizado(
    db_session: AsyncSession,
) -> None:
    c = await montar(db_session)

    await excluir_pela_rota(db_session, c)

    inscritas, _ = await list_registrations(db_session, c.passada, None, 0, 100)
    dela = [(p, n, e) for p, n, e in inscritas if p.girl_id == c.alana.id]
    assert len(dela) == 1
    participacao, nome, email = dela[0]
    assert nome == "Registro anonimizado"
    assert email == f"registro-{c.alana.id}@anonimizado.invalid"
    assert participacao.whatsapp is None
    assert participacao.study_stage is None
    assert participacao.school_year is None
    # O que alimenta número fica.
    assert participacao.attended_at == SALVA
    assert participacao.saved_present is True

    pagina = await build_attendance_page(db_session, c.passada, HOJE)
    linha = next(g for g in pagina.girls if g.id == participacao.id)
    assert linha.name == "Registro anonimizado"
    assert linha.email == f"registro-{c.alana.id}@anonimizado.invalid"
    assert (linha.whatsapp, linha.study_stage, linha.school_year) == (None, None, None)
    assert linha.present is True

    ingressos, _ = await list_group_enrollments(db_session, c.grupo.id, 1)
    nomes = {e.girl_id: nome for e, nome in ingressos}
    assert nomes[c.alana.id] == "Registro anonimizado"


# C15: a inscrição em ação que ainda não começou some e a vaga reabre.
async def test_inscricao_em_acao_futura_some(db_session: AsyncSession) -> None:
    c = await montar(db_session)
    antes = await build_attendance_page(db_session, c.futura, HOJE)
    assert antes.registered_count == 2

    await excluir_pela_rota(db_session, c)

    depois = await build_attendance_page(db_session, c.futura, HOJE)
    assert depois.registered_count == 1
    assert [g.name for g in depois.girls] == ["Bia Souza"]
    # E a da ação que já começou continua.
    existe = await db_session.scalar(
        select(func.count())
        .select_from(Participation)
        .where(
            Participation.girl_id == c.alana.id,
            Participation.action_id.in_([c.passada.id, c.passada_2.id]),
        )
    )
    assert existe == 2


# C15: a fronteira é o dia de hoje. A ação de hoje já começou (fica); a de
# amanhã, não (some).
async def test_acao_de_hoje_fica_e_a_de_amanha_some(db_session: AsyncSession) -> None:
    c = await montar(db_session)
    hoje = await acao(db_session, c.grupo, "Oficina de hoje", 0, False)
    amanha = await acao(db_session, c.grupo, "Oficina de amanha", 1, False)
    db_session.add(inscricao(c.alana, hoje, presente=False))
    db_session.add(inscricao(c.alana, amanha, presente=False))
    await db_session.flush()

    await excluir_pela_rota(db_session, c)

    ficou = await db_session.scalars(
        select(Participation.action_id).where(Participation.girl_id == c.alana.id)
    )
    assert hoje.id in set(ficou)
    assert amanha.id not in set(
        await db_session.scalars(
            select(Participation.action_id).where(Participation.girl_id == c.alana.id)
        )
    )


# C13: nenhum envio alcança a linha anonimizada.
async def test_nenhum_envio_alcanca_o_registro_anonimizado(
    db_session: AsyncSession,
) -> None:
    c = await montar(db_session)

    await excluir_pela_rota(db_session, c)

    pendente = await db_session.scalar(
        select(AttendanceEmail).where(
            AttendanceEmail.girl_id == c.alana.id,
            AttendanceEmail.action_id == c.passada_2.id,
        )
    )
    assert pendente is not None
    assert pendente.sent_at is None
    assert pendente.dropped_at is not None

    enviados: list[str] = []
    conexoes: list[int] = []

    class Falso:
        def send(self, to: str, subject: str, body: str) -> None:
            enviados.append(to)

        def close(self) -> None:
            pass

    def conectar() -> Falso:
        conexoes.append(1)
        return Falso()

    resultado = await send_attendance_emails(db_session, connect=conectar)
    assert resultado.sent == 0
    assert enviados == []
    assert not any(a.endswith(".invalid") for a in enviados)

    # Uma ação nova: ela não entra na fila, nem como convite nem como avaliação.
    nova = await acao(db_session, c.grupo, "Oficina de Jogos", -5, False)
    linhas_antes = await db_session.scalar(
        select(func.count()).select_from(AttendanceEmail)
    )
    await queue_attendance_emails(db_session, nova, [c.alana.id], [c.alana.id])
    linhas_depois = await db_session.scalar(
        select(func.count()).select_from(AttendanceEmail)
    )
    assert linhas_depois == linhas_antes

    # Nem a busca de indícios do F31.
    por_nome = await _girls_by_name(db_session)
    assert "registro anonimizado" not in por_nome
    assert c.alana.id not in {i for ids in por_nome.values() for i in ids}
    assert por_nome["bia souza"] == [c.bia.id]


# C13: sem a baixa, a avaliação pendente iria para o endereço `.invalid`.
async def test_sem_a_baixa_a_avaliacao_pendente_iria_para_o_invalid(
    db_session: AsyncSession,
) -> None:
    # Prova de que o teste acima olha o que importa: a avaliação pendente da
    # Alana, com a presença dela, é enviada ao e-mail da menina se ninguém a
    # descartar. Depois da exclusão, o e-mail é o `.invalid`.
    c = await montar(db_session)
    await excluir_pela_rota(db_session, c)
    pendente = await db_session.scalar(
        select(AttendanceEmail).where(
            AttendanceEmail.girl_id == c.alana.id,
            AttendanceEmail.action_id == c.passada_2.id,
        )
    )
    assert pendente is not None
    pendente.dropped_at = None
    await db_session.flush()
    enviados: list[str] = []

    class Falso:
        def send(self, to: str, subject: str, body: str) -> None:
            enviados.append(to)

        def close(self) -> None:
            pass

    await send_attendance_emails(db_session, connect=Falso)

    assert enviados == [f"registro-{c.alana.id}@anonimizado.invalid"]


# C3/C14: nada identificável sobra em nenhuma tabela.
async def test_nada_identificavel_sobra_em_nenhuma_tabela(
    db_session: AsyncSession,
) -> None:
    c = await montar(db_session)
    # Antes, a varredura acha tudo: o teste enxerga os dados que procura.
    antes = await todas_as_linhas(db_session)
    achados = {
        dado
        for linhas in antes.values()
        for linha in linhas
        for valor in linha
        for dado in IDENTIFICA
        if dado in str(valor).lower()
    }
    assert achados == set(IDENTIFICA)

    await excluir_pela_rota(db_session, c)

    depois = await todas_as_linhas(db_session)
    sobrou = [
        (tabela, dado)
        for tabela, linhas in depois.items()
        for linha in linhas
        for valor in linha
        for dado in IDENTIFICA
        if dado in str(valor).lower()
    ]
    assert sobrou == []
    # Cada tabela de dado só dela está sem linha dela.
    for tabela, destino in DESTINO.items():
        if destino["acao"] != APAGAR or tabela == "match_emails":
            continue
        coluna = (
            "user_id"
            if tabela in {"oauth_accounts", "password_reset_tokens"}
            else "girl_id"
        )
        dono = c.alana_user.id if coluna == "user_id" else c.alana.id
        resultado = await db_session.execute(
            text(f'SELECT count(*) FROM "{tabela}" WHERE {coluna} = :dono'),
            {"dono": dono},
        )
        assert resultado.scalar_one() == 0, tabela
    # Os e-mails dos indícios dela saíram junto; o da Bia ficou.
    assert await db_session.scalar(select(func.count()).select_from(MatchEmail)) == 1


# Só a Alana: o que é da Bia continua inteiro.
async def test_o_que_e_de_outra_menina_nao_muda(db_session: AsyncSession) -> None:
    c = await montar(db_session)

    def da_bia(linhas: dict[str, list[tuple[Any, ...]]]) -> dict[str, int]:
        return {
            tabela: len(linhas_da_tabela)
            for tabela, linhas_da_tabela in linhas.items()
            if tabela in {"girl_topics", "list_matches", "invites", "participations"}
        }

    antes = await todas_as_linhas(db_session)
    await excluir_pela_rota(db_session, c)
    depois = await todas_as_linhas(db_session)

    bia = await db_session.get(Girl, c.bia.id)
    assert bia is not None
    assert (bia.name, bia.email) == ("Bia Souza", "bia@exemplo.com")
    assert bia.birth_date == date(2008, 1, 5)
    assert bia.city_ibge_code == CIDADE
    topicos = await db_session.scalar(
        select(func.count()).select_from(GirlTopic).where(GirlTopic.girl_id == c.bia.id)
    )
    assert topicos == 1
    convites = await db_session.scalars(select(Invite.code).order_by(Invite.code))
    assert list(convites) == ["convite-do-grupo", "convite-pessoal-da-bia"]
    # Só as linhas dela saíram: 1 tópico, 1 convite pessoal, 1 indício,
    # 1 e-mail de indício, 1 inscrição futura.
    contagem_antes, contagem_depois = da_bia(antes), da_bia(depois)
    assert contagem_antes["girl_topics"] - contagem_depois["girl_topics"] == 1
    assert contagem_antes["invites"] - contagem_depois["invites"] == 1
    assert contagem_antes["list_matches"] - contagem_depois["list_matches"] == 1
    assert contagem_antes["participations"] - contagem_depois["participations"] == 1


# C5: o aceite dos termos fica, ligado à linha anonimizada.
async def test_o_aceite_dos_termos_fica(db_session: AsyncSession) -> None:
    c = await montar(db_session)
    antes = (await todas_as_linhas(db_session))["terms_acceptances"]

    await excluir_pela_rota(db_session, c)

    depois = (await todas_as_linhas(db_session))["terms_acceptances"]
    assert depois == antes
    assert len(depois) == 3
    usuaria = await db_session.get(User, c.alana_user.id)
    assert usuaria is not None
    assert usuaria.deleted_at is not None
    assert usuaria.deleted_at.tzinfo is not None
    assert usuaria.name == "Registro anonimizado"
    assert usuaria.email == f"conta-{c.alana_user.id}@anonimizado.invalid"
    assert usuaria.password_hash is None
    assert usuaria.role == Role.GIRL
    assert (
        await db_session.scalar(
            select(TermsAcceptance.terms_version).where(
                TermsAcceptance.user_id == usuaria.id
            )
        )
        == CURRENT_TERMS_VERSION
    )


# C6: o texto livre sai; as respostas fechadas ficam.
async def test_texto_livre_sai_e_resposta_fechada_fica(
    db_session: AsyncSession,
) -> None:
    c = await montar(db_session)

    await excluir_pela_rota(db_session, c)

    resposta = await db_session.scalar(
        select(Answer).where(Answer.girl_id == c.alana.id)
    )
    assert resposta is not None
    assert (resposta.score, resposta.stage, resposta.action_id) == (
        4,
        AnswerStage.RATING,
        c.passada.id,
    )
    assert resposta.comment is None

    followup = await db_session.scalar(
        select(FollowupAnswer).where(FollowupAnswer.girl_id == c.alana.id)
    )
    assert followup is not None
    assert followup.computing_view == ComputingView.WANT_TO_FOLLOW
    assert followup.round == FollowupRound.THREE_MONTHS
    assert followup.comment is None
    assert await db_session.scalar(select(FollowupActivity.activity)) == (
        Activity.ONLINE_COURSE
    )
    assert await db_session.scalar(select(FollowupHelp.help)) == HelpWanted.MENTORING


# C6: o curso digitado vira "Outro curso" e a ligação com a lista oficial sai.
async def test_ingressos_ficam_sem_curso_digitado_e_sem_lista_oficial(
    db_session: AsyncSession,
) -> None:
    c = await montar(db_session)
    lista = await db_session.scalar(
        select(OfficialList.id).where(OfficialList.institution == "IFAL")
    )
    # Confirmado numa lista, com um curso fora da lista fixa do questionário.
    for girl in (c.alana, c.bia):
        db_session.add(
            Enrollment(
                girl_id=girl.id,
                level=CourseLevel.TECNICO,
                course="Informática",
                institution="IFAL",
                enrolled_on=date(2026, 4, 1),
                origin=AdmissionOrigin.OFFICIAL_LIST,
                official_list_id=lista,
            )
        )
    await db_session.flush()

    await excluir_pela_rota(db_session, c)

    async def ingressos(girl_id: int) -> list[tuple[Any, ...]]:
        resultado = await db_session.execute(
            select(
                Enrollment.course,
                Enrollment.institution,
                Enrollment.official_list_id,
                Enrollment.origin,
                Enrollment.level,
            )
            .where(Enrollment.girl_id == girl_id)
            .order_by(Enrollment.enrolled_on)
        )
        return [tuple(linha) for linha in resultado]

    declarado = AdmissionOrigin.SELF_DECLARED
    oficial = AdmissionOrigin.OFFICIAL_LIST
    tecnico, graduacao = CourseLevel.TECNICO, CourseLevel.GRADUACAO
    assert await ingressos(c.alana.id) == [
        ("Outro curso", None, None, declarado, tecnico),
        ("Ciência da Computação", None, None, declarado, graduacao),
        ("Informática", None, None, oficial, tecnico),
    ]
    # O da Bia continua inteiro.
    assert await ingressos(c.bia.id) == [
        ("Ciência da Computação", "UFAL", None, declarado, graduacao),
        ("Informática", "IFAL", lista, oficial, tecnico),
    ]


# C6: fica o que está no filé, sem nota, preferência nem lembrete; o resto sai.
async def test_do_file_fica_so_o_que_conta_nos_paineis(
    db_session: AsyncSession,
) -> None:
    c = await montar(db_session)
    fora_do_file = [
        (FileStatus.LATER, None),
        (FileStatus.DISMISSED, DismissReason.SEM_TEMPO_AGORA),
        (FileStatus.DID_NOT_GO, None),
    ]
    for numero, (status, motivo) in enumerate(fora_do_file):
        outra = await acao(db_session, c.grupo, f"Outra {numero}", 40, False)
        db_session.add(
            FileEntry(
                girl_id=c.alana.id,
                action_id=outra.id,
                status=status,
                dismiss_reason=motivo,
            )
        )
    await db_session.flush()

    await excluir_pela_rota(db_session, c)

    entradas = await db_session.scalars(
        select(FileEntry)
        .where(FileEntry.girl_id == c.alana.id)
        .order_by(FileEntry.action_id)
    )
    ficaram = list(entradas)
    assert [(e.action_id, e.status) for e in ficaram] == [
        (c.passada_2.id, FileStatus.CONCLUDED),
        (c.futura.id, FileStatus.SIGNED_UP),
    ]
    for entrada in ficaram:
        assert entrada.filed_at is not None
        assert entrada.rating is None
        assert entrada.similar_choice is None
        assert entrada.dismiss_reason is None
        assert entrada.reminder is False
        assert entrada.reminder_sent_for is None
    assert ficaram[0].concluded_on == c.passada_2.starts_on


# C7: duas vezes anonimiza uma só.
async def test_excluir_duas_vezes_deixa_o_banco_igual(
    db_session: AsyncSession,
) -> None:
    c = await montar(db_session)

    primeira = await delete_account(db_session, c.alana_user.id, HOJE)
    depois_da_primeira = await todas_as_linhas(db_session)
    db_session.expunge_all()
    segunda = await delete_account(db_session, c.alana_user.id, HOJE)

    assert (primeira, segunda) == (
        DeletionResult.DELETED,
        DeletionResult.ALREADY_DELETED,
    )
    assert await todas_as_linhas(db_session) == depois_da_primeira


# C3: a conta excluída não entra mais; a sessão antiga dá 401.
async def test_sessao_antiga_da_conta_excluida_da_401(
    db_session: AsyncSession,
) -> None:
    c = await montar(db_session)
    token = create_access_token(c.alana_user.id)
    await excluir_pela_rota(db_session, c)

    for rota in ("/api/auth/me", "/api/profile/details"):
        response = await chamar_rota(app, "GET", rota, db_session, token)
        assert response.status_code == 401, rota
    # Outra aba que ainda manda o cookie: 204, e nada muda.
    de_novo = await chamar_rota(app, "DELETE", "/api/profile", db_session, token)
    assert de_novo.status_code == 204


# C12: depois, ela cria uma conta nova com o mesmo e-mail, do zero.
async def test_conta_nova_com_o_mesmo_email_comeca_do_zero(
    db_session: AsyncSession,
) -> None:
    c = await montar(db_session)
    antes = await numeros(db_session, c)
    await excluir_pela_rota(db_session, c)

    nova = await signup_with_email(
        db_session,
        EmailSignupIn(
            name=NOME,
            email=EMAIL,
            password="senha-ficticia-123",
            birth_date=NASCIMENTO,
            city_id=CIDADE,
        ),
    )

    assert nova is not None
    assert nova.id != c.alana_user.id
    girl_nova = await db_session.scalar(select(Girl).where(Girl.user_id == nova.id))
    assert girl_nova is not None
    assert girl_nova.id != c.alana.id
    assert girl_nova.email == EMAIL
    # A linha anonimizada continua anonimizada e a nova não vira ingressante.
    anonima = await db_session.get(Girl, c.alana.id)
    assert anonima is not None
    assert anonima.email == f"registro-{c.alana.id}@anonimizado.invalid"
    assert await numeros(db_session, c) == antes


# C9: a exclusão não escreve nada no log.
async def test_exclusao_no_banco_nao_loga(
    db_session: AsyncSession, caplog: pytest.LogCaptureFixture
) -> None:
    c = await montar(db_session)

    with caplog.at_level(logging.DEBUG):
        await excluir_pela_rota(db_session, c)

    for dado in IDENTIFICA:
        assert dado not in caplog.text.lower()
