"""Resultados · "Elas entraram na área?" (C5, #370, RF-F5.34).

Rodam no Postgres de teste (`db_session`). Dados fictícios. Cada teste diz o
critério de aceite da #370 que cobre.
"""

from collections.abc import Mapping
from datetime import timedelta

from httpx2 import Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.utils import create_access_token
from app.main import app
from app.modules.followup.models import CourseStatus, FollowupAnswer, FollowupRound
from app.modules.girls.models import Girl, StudyStage
from app.modules.groups.models import Group
from app.users.models import Role, User
from tests.helpers import chamar_rota
from tests.test_results_after_action import HOJE, Cenario

URL = "/api/coordinator/results/entered-field"

SEIS = FollowupRound.SIX_MONTHS
DOZE = FollowupRound.TWELVE_MONTHS
DEZOITO = FollowupRound.EIGHTEEN_MONTHS


async def pedir(
    sessao: AsyncSession, usuaria: User | None, filtros: str = ""
) -> Response:
    token = create_access_token(usuaria.id) if usuaria else None
    return await chamar_rota(app, "GET", f"{URL}{filtros}", sessao, token)


async def menina_do_grupo(
    cenario: Cenario,
    grupo: Group,
    etapa: StudyStage | None,
    respostas: Mapping[FollowupRound, CourseStatus | None],
    dias: int = 30,
) -> Girl:
    """Uma menina inscrita numa ação do grupo, com a escolaridade e as respostas."""
    menina = await cenario.menina()
    menina.study_stage = etapa
    acao = await cenario.acao(grupo, HOJE - timedelta(days=dias))
    await cenario.inscrita(menina, acao, True)
    for rodada, status in respostas.items():
        cenario.sessao.add(
            FollowupAnswer(girl_id=menina.id, round=rodada, course_status=status)
        )
    await cenario.sessao.flush()
    return menina


async def card(
    sessao: AsyncSession, usuaria: User, filtros: str = ""
) -> dict[str, list[dict[str, int]]]:
    response = await pedir(sessao, usuaria, filtros)
    assert response.status_code == 200, response.text
    return {e["stage"]: e["bars"] for e in response.json()["stages"]}


async def test_sem_login_e_menina_nao_veem(db_session: AsyncSession) -> None:
    # Permissão no servidor (RN-01).
    cenario = Cenario(db_session)
    menina = await cenario.coordenadora(None, Role.GIRL)

    assert (await pedir(db_session, None)).status_code == 401
    assert (await pedir(db_session, menina)).status_code == 403


async def test_tres_etapas_com_tres_barras_de_6_12_e_18_meses(
    db_session: AsyncSession,
) -> None:
    # Critério: um seletor com as três etapas e, em cada uma, três barras.
    cenario = Cenario(db_session)
    grupo = await cenario.grupo("Rendeiras do Código")
    katia = await cenario.coordenadora(grupo)

    etapas = await card(db_session, katia)

    assert list(etapas) == ["fundamental", "medio", "tecnico_ou_graduacao"]
    for barras in etapas.values():
        assert [b["months"] for b in barras] == [6, 12, 18]
        # Sem ninguém: zero respondeu, e não erro.
        assert all(b["answered"] == 0 for b in barras)


async def test_barra_divide_as_respostas_e_mostra_quantas_responderam(
    db_session: AsyncSession,
) -> None:
    # Critérios: quatro respostas por barra e o n de respostas (RN-50), mesmo pequeno.
    cenario = Cenario(db_session)
    grupo = await cenario.grupo("Rendeiras do Código")
    katia = await cenario.coordenadora(grupo)
    for status in (
        CourseStatus.GRADUACAO,
        CourseStatus.TECNICO,
        CourseStatus.TECNICO,
        CourseStatus.TRYING,
        CourseStatus.NOT_YET,
    ):
        await menina_do_grupo(cenario, grupo, StudyStage.MEDIO, {SEIS: status})

    barra = (await card(db_session, katia))["medio"][0]

    assert barra == {
        "months": 6,
        "answered": 5,
        "graduacao": 1,
        "tecnico": 2,
        "trying": 1,
        "notYet": 1,
    }


async def test_cada_menina_conta_com_a_resposta_mais_recente(
    db_session: AsyncSession,
) -> None:
    # Critério: cada menina conta uma vez, com a resposta mais recente.
    cenario = Cenario(db_session)
    grupo = await cenario.grupo("Rendeiras do Código")
    katia = await cenario.coordenadora(grupo)
    await menina_do_grupo(
        cenario,
        grupo,
        StudyStage.MEDIO,
        {SEIS: CourseStatus.NOT_YET, DOZE: CourseStatus.TRYING},
    )
    # Resposta mais recente sem a pergunta 3: vale a anterior.
    await menina_do_grupo(
        cenario,
        grupo,
        StudyStage.MEDIO,
        {SEIS: CourseStatus.TECNICO, DOZE: None},
    )

    barras = (await card(db_session, katia))["medio"]

    assert [b["answered"] for b in barras] == [1, 1, 0]
    assert barras[0]["tecnico"] == 1
    assert barras[1]["trying"] == 1


async def test_escolaridade_do_cadastro_separa_as_etapas(
    db_session: AsyncSession,
) -> None:
    # Critério: o seletor usa a escolaridade do cadastro; técnico e graduação
    # ficam juntos; "já me formei" e sem escolaridade ficam fora.
    cenario = Cenario(db_session)
    grupo = await cenario.grupo("Rendeiras do Código")
    katia = await cenario.coordenadora(grupo)
    resposta = {DEZOITO: CourseStatus.NOT_YET}
    for etapa in (
        StudyStage.FUNDAMENTAL,
        StudyStage.TECNICO,
        StudyStage.GRADUACAO,
        StudyStage.FORMADA,
        None,
    ):
        await menina_do_grupo(cenario, grupo, etapa, resposta)

    etapas = await card(db_session, katia)

    assert etapas["fundamental"][2]["answered"] == 1
    assert etapas["medio"][2]["answered"] == 0
    assert etapas["tecnico_ou_graduacao"][2]["answered"] == 2


async def test_rodada_de_3_meses_nao_tem_barra(db_session: AsyncSession) -> None:
    cenario = Cenario(db_session)
    grupo = await cenario.grupo("Rendeiras do Código")
    katia = await cenario.coordenadora(grupo)
    await menina_do_grupo(
        cenario,
        grupo,
        StudyStage.MEDIO,
        {FollowupRound.THREE_MONTHS: CourseStatus.TRYING},
    )

    barras = (await card(db_session, katia))["medio"]

    assert all(b["answered"] == 0 for b in barras)


async def test_so_meninas_das_acoes_do_proprio_grupo(
    db_session: AsyncSession,
) -> None:
    # RN-01: outro grupo não vê as respostas, só as dele.
    cenario = Cenario(db_session)
    rendeiras = await cenario.grupo("Rendeiras do Código")
    outro = await cenario.grupo("Outro Grupo Fictício")
    await menina_do_grupo(
        cenario, rendeiras, StudyStage.MEDIO, {SEIS: CourseStatus.TECNICO}
    )
    coordenadora_do_outro = await cenario.coordenadora(outro)

    barras = (await card(db_session, coordenadora_do_outro))["medio"]

    assert all(b["answered"] == 0 for b in barras)


async def test_periodo_filtra_as_acoes(db_session: AsyncSession) -> None:
    # Filtro Período (D-94): ação de há 200 dias fica fora dos "Últimos 6 meses".
    cenario = Cenario(db_session)
    grupo = await cenario.grupo("Rendeiras do Código")
    katia = await cenario.coordenadora(grupo)
    await menina_do_grupo(
        cenario, grupo, StudyStage.MEDIO, {SEIS: CourseStatus.TRYING}, dias=200
    )

    assim = (await card(db_session, katia, "?period=6m"))["medio"]
    padrao = (await card(db_session, katia))["medio"]

    assert assim[0]["answered"] == 0
    assert padrao[0]["answered"] == 1


async def test_resposta_so_traz_contagens(db_session: AsyncSession) -> None:
    # Critério: nunca nome da menina, do curso nem da instituição.
    cenario = Cenario(db_session)
    grupo = await cenario.grupo("Rendeiras do Código")
    katia = await cenario.coordenadora(grupo)
    await menina_do_grupo(
        cenario, grupo, StudyStage.MEDIO, {SEIS: CourseStatus.GRADUACAO}
    )

    response = await pedir(db_session, katia)

    texto = response.text
    assert "Ficticia" not in texto and "exemplo.com" not in texto
    chaves = set(response.json()["stages"][1]["bars"][0])
    assert chaves == {
        "months",
        "answered",
        "graduacao",
        "tecnico",
        "trying",
        "notYet",
    }
