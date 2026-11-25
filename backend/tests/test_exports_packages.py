"""Exportação anônima (F24, #377): os pacotes de colunas.

Rodam no Postgres de teste (`db_session`). Dados fictícios. Cada teste diz o
critério de aceite da #377 que cobre.
"""

from dataclasses import replace
from datetime import UTC, date, datetime

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.utils import create_access_token
from app.main import app
from app.modules.actions.models import Action, Participation
from app.modules.admissions.models import AdmissionOrigin, CourseLevel, Enrollment
from app.modules.answers.models import Answer, AnswerStage
from app.modules.exports.service import (
    BASE_COLUMNS,
    PACKAGE_COLUMNS,
    RESEARCH_PACKAGES,
    ExportCut,
    Package,
    build_table,
    columns_for,
    to_csv,
)
from app.modules.followup.models import ComputingView, FollowupAnswer, FollowupRound
from app.modules.girls.models import Girl
from app.modules.groups.models import Group
from tests.helpers import chamar_rota
from tests.test_exports_routes import URL, cenario
from tests.test_exports_service import HOJE, acao, grupo, inscrever, menina


async def marcar(
    sessao: AsyncSession, quem: Girl, em: Action, veio: bool | None
) -> None:
    """Anota a presença: True veio, False faltou, None ainda não anotada."""
    inscricao = await sessao.scalar(
        select(Participation).where(
            Participation.girl_id == quem.id, Participation.action_id == em.id
        )
    )
    assert inscricao is not None
    if veio is not None:
        em.attendance_registered_at = datetime(2026, 9, 21, tzinfo=UTC)
    if veio:
        inscricao.attended_at = datetime(2026, 9, 20, tzinfo=UTC)
    await sessao.flush()


async def linha(
    sessao: AsyncSession, do_grupo: Group, pacotes: list[Package]
) -> dict[str, str]:
    """A primeira linha do arquivo, chave = nome da coluna."""
    tabela = await build_table(sessao, do_grupo.id, HOJE, packages=pacotes)
    return {c.label: v for c, v in zip(tabela.columns, tabela.rows[0], strict=True)}


# --- Cartões e Base (critérios 1 e 9) -----------------------------------------


async def test_so_a_base_sai_sem_nenhum_pacote(db_session: AsyncSession) -> None:
    g = await grupo(db_session)
    a = await acao(db_session, g)
    await inscrever(db_session, await menina(db_session, 1), a)

    tabela = await build_table(db_session, g.id, HOJE, packages=[])

    assert tabela.columns == BASE_COLUMNS
    assert len(tabela.rows[0]) == 8


def test_desligar_um_pacote_tira_as_colunas_dele() -> None:
    sem_funil = [p for p in Package if p is not Package.FUNNEL]

    com = columns_for(Package)
    sem = columns_for(sem_funil)

    assert len(com) == 8 + sum(len(c) for c in PACKAGE_COLUMNS.values()) == 22
    assert {c.key for c in com} - {c.key for c in sem} == {
        "signed_up",
        "present",
        "concluded",
    }


def test_padrao_liga_tudo_menos_outros_grupos() -> None:
    assert Package.OTHER_GROUPS not in RESEARCH_PACKAGES
    assert set(RESEARCH_PACKAGES) | {Package.OTHER_GROUPS} == set(Package)


# --- Grupos de comparação e Funil ----------------------------------------------


async def test_grupos_de_comparacao_participante_e_nao_compareceu(
    db_session: AsyncSession,
) -> None:
    g = await grupo(db_session)
    a = await acao(db_session, g)
    veio = await menina(db_session, 1)
    faltou = await menina(db_session, 2)
    await inscrever(db_session, veio, a)
    await inscrever(db_session, faltou, a)
    await marcar(db_session, veio, a, True)
    await marcar(db_session, faltou, a, False)

    tabela = await build_table(db_session, g.id, HOJE, packages=[Package.GROUPS])

    assert [r[-1] for r in tabela.rows] == ["participante", "nao_compareceu"]


async def test_funil_inscrita_presente_e_concluinte(db_session: AsyncSession) -> None:
    g = await grupo(db_session)
    a = await acao(db_session, g)
    veio = await menina(db_session, 1)
    faltou = await menina(db_session, 2)
    await inscrever(db_session, veio, a)
    await inscrever(db_session, faltou, a)
    await marcar(db_session, veio, a, True)
    await marcar(db_session, faltou, a, False)

    tabela = await build_table(db_session, g.id, HOJE, packages=[Package.FUNNEL])

    assert [c.label for c in tabela.columns][-3:] == [
        "inscrita",
        "presente",
        "concluinte",
    ]
    assert [r[-3:] for r in tabela.rows] == [
        ["sim", "sim", "sim"],
        ["sim", "não", "não"],
    ]


async def test_quem_veio_numa_acao_que_nao_terminou_ainda_nao_concluiu(
    db_session: AsyncSession,
) -> None:
    g = await grupo(db_session)
    a = await acao(db_session, g)
    quem = await menina(db_session, 1)
    await inscrever(db_session, quem, a)
    await marcar(db_session, quem, a, True)

    antes = await build_table(
        db_session, g.id, date(2026, 9, 19), packages=[Package.FUNNEL]
    )

    assert antes.rows[0][-3:] == ["sim", "sim", "não"]


# --- Avaliações -----------------------------------------------------------------


async def test_avaliacoes_trazem_a_nota_e_nunca_o_comentario(
    db_session: AsyncSession,
) -> None:
    g = await grupo(db_session)
    a = await acao(db_session, g)
    avaliou = await menina(db_session, 1)
    calada = await menina(db_session, 2)
    await inscrever(db_session, avaliou, a)
    await inscrever(db_session, calada, a)
    db_session.add(
        Answer(
            girl_id=avaliou.id,
            action_id=a.id,
            stage=AnswerStage.RATING,
            score=4,
            comment="Texto livre ficticio que não pode sair",
        )
    )
    await db_session.flush()

    tabela = await build_table(db_session, g.id, HOJE, packages=[Package.RATINGS])

    assert [r[-1] for r in tabela.rows] == ["4", ""]
    assert "Texto livre" not in to_csv(tabela)


# --- Interesse ---------------------------------------------------------------------


async def test_interesse_tem_uma_coluna_por_marco(db_session: AsyncSession) -> None:
    g = await grupo(db_session)
    a = await acao(db_session, g)
    quem = await menina(db_session, 1)
    await inscrever(db_session, quem, a)
    db_session.add_all(
        [
            FollowupAnswer(
                girl_id=quem.id,
                round=FollowupRound.THREE_MONTHS,
                computing_view=ComputingView.WANT_TO_FOLLOW,
                comment="Comentário ficticio",
            ),
            FollowupAnswer(
                girl_id=quem.id,
                round=FollowupRound.EIGHTEEN_MONTHS,
                computing_view=ComputingView.NOT_FOR_ME,
            ),
        ]
    )
    await db_session.flush()

    valores = await linha(db_session, g, [Package.INTEREST])

    assert [k for k in valores if k.startswith("interesse")] == [
        "interesse_cadastro",
        "interesse_3m",
        "interesse_6m",
        "interesse_12m",
        "interesse_18m",
    ]
    # Sem resposta na A05a "Antes de começar" (#303): pulou ou é conta antiga.
    assert valores["interesse_cadastro"] == ""
    assert valores["interesse_3m"] == "Quero seguir"
    assert valores["interesse_6m"] == ""
    assert valores["interesse_18m"] == "Não é pra mim"
    assert "Comentário" not in "".join(valores.values())


async def test_interesse_cadastro_vem_da_a05a(db_session: AsyncSession) -> None:
    # O marco "cadastro" é a pergunta 1 da A05a "Antes de começar" (#303).
    g = await grupo(db_session)
    a = await acao(db_session, g)
    quem = await menina(db_session, 1)
    await inscrever(db_session, quem, a)
    quem.signup_computing_view = ComputingView.LIKE_BUT_UNSURE
    await db_session.flush()

    valores = await linha(db_session, g, [Package.INTEREST])

    assert valores["interesse_cadastro"] == "Gosto, mas não sei"
    assert valores["interesse_3m"] == ""


# --- Ingresso -----------------------------------------------------------------------


async def ingressar(
    sessao: AsyncSession,
    quem: Girl,
    curso: str,
    nivel: CourseLevel,
    origem: AdmissionOrigin = AdmissionOrigin.SELF_DECLARED,
) -> None:
    sessao.add(
        Enrollment(
            girl_id=quem.id,
            level=nivel,
            course=curso,
            institution="Instituição Ficticia",
            enrolled_on=date(2026, 8, 1),
            origin=origem,
        )
    )
    await sessao.flush()


async def test_ingresso_traz_se_entrou_nivel_e_area_sem_a_instituicao(
    db_session: AsyncSession,
) -> None:
    g = await grupo(db_session)
    a = await acao(db_session, g)
    entrou = await menina(db_session, 1)
    nao_entrou = await menina(db_session, 2)
    await inscrever(db_session, entrou, a)
    await inscrever(db_session, nao_entrou, a)
    await ingressar(db_session, entrou, "Redes de computadores", CourseLevel.TECNICO)
    for n in range(10, 14):  # com ela, cinco meninas na área: sai por extenso
        outra = await menina(db_session, n)
        await inscrever(db_session, outra, a)
        await ingressar(db_session, outra, "Redes de computadores", CourseLevel.TECNICO)

    tabela = await build_table(db_session, g.id, HOJE, packages=[Package.ADMISSION])

    assert [r[-3:] for r in tabela.rows[:2]] == [
        ["sim", "técnico", "Redes de computadores"],
        ["não", "", ""],
    ]
    assert "Instituição" not in to_csv(tabela)


async def test_area_com_menos_de_cinco_meninas_vira_ti_agrupado(
    db_session: AsyncSession,
) -> None:
    g = await grupo(db_session)
    a = await acao(db_session, g)
    for n in range(1, 5):
        quem = await menina(db_session, n)
        await inscrever(db_session, quem, a)
        await ingressar(
            db_session, quem, "Ciência da Computação", CourseLevel.GRADUACAO
        )

    tabela = await build_table(db_session, g.id, HOJE, packages=[Package.ADMISSION])

    assert {r[-1] for r in tabela.rows} == {"TI (agrupado)"}
    assert {r[-2] for r in tabela.rows} == {"graduação"}
    assert "Ciência" not in to_csv(tabela)


async def test_ti_agrupado_conta_as_meninas_do_recorte_e_nao_do_grupo(
    db_session: AsyncSession,
) -> None:
    """RF-F24.35: com o recorte numa ação, a área conta só quem está no arquivo."""
    g = await grupo(db_session)
    a = await acao(db_session, g, "Ação A")
    b = await acao(db_session, g, "Ação B")
    for n in (1, 2):
        quem = await menina(db_session, n)
        await inscrever(db_session, quem, a)
        await ingressar(db_session, quem, "Redes de computadores", CourseLevel.TECNICO)
    for n in (3, 4, 5):
        quem = await menina(db_session, n)
        await inscrever(db_session, quem, b)
        await ingressar(db_session, quem, "Redes de computadores", CourseLevel.TECNICO)

    so_a = await build_table(
        db_session,
        g.id,
        HOJE,
        packages=[Package.ADMISSION],
        cut=ExportCut(action_id=a.id),
    )
    tudo = await build_table(db_session, g.id, HOJE, packages=[Package.ADMISSION])

    # Duas meninas no arquivo: a área some, mesmo com cinco no grupo.
    assert [r[-1] for r in so_a.rows] == ["TI (agrupado)", "TI (agrupado)"]
    assert {r[-1] for r in tudo.rows} == {"Redes de computadores"}


async def test_curso_digitado_em_outro_curso_sai_como_outro_curso(
    db_session: AsyncSession,
) -> None:
    """RN-11: o nome que ela digitou é texto livre e nunca sai, nem com 5 iguais."""
    g = await grupo(db_session)
    a = await acao(db_session, g)
    for n in range(1, 6):
        quem = await menina(db_session, n)
        await inscrever(db_session, quem, a)
        await ingressar(
            db_session, quem, "Ciência de Dados Ficticia", CourseLevel.GRADUACAO
        )

    tabela = await build_table(db_session, g.id, HOJE, packages=[Package.ADMISSION])

    assert {r[-1] for r in tabela.rows} == {"Outro curso"}
    assert "Ciência de Dados" not in to_csv(tabela)


async def test_cursos_digitados_diferentes_contam_juntos_como_outro_curso(
    db_session: AsyncSession,
) -> None:
    """Cinco nomes digitados, todos diferentes: juntos são cinco em "Outro curso"."""
    g = await grupo(db_session)
    a = await acao(db_session, g)
    for n in range(1, 6):
        quem = await menina(db_session, n)
        await inscrever(db_session, quem, a)
        await ingressar(db_session, quem, f"Curso Ficticio {n}", CourseLevel.TECNICO)

    tabela = await build_table(db_session, g.id, HOJE, packages=[Package.ADMISSION])

    assert {r[-1] for r in tabela.rows} == {"Outro curso"}


async def test_curso_da_lista_oficial_sai_com_o_nome_da_instituicao(
    db_session: AsyncSession,
) -> None:
    """O curso de uma lista oficial não é texto livre: sai como a lista escreve."""
    g = await grupo(db_session)
    a = await acao(db_session, g)
    for n in range(1, 6):
        quem = await menina(db_session, n)
        await inscrever(db_session, quem, a)
        await ingressar(
            db_session,
            quem,
            "Tecnologia em Redes de Computadores",
            CourseLevel.TECNICO,
            AdmissionOrigin.OFFICIAL_LIST,
        )

    tabela = await build_table(db_session, g.id, HOJE, packages=[Package.ADMISSION])

    assert {r[-1] for r in tabela.rows} == {"Tecnologia em Redes de Computadores"}


# --- Outros grupos --------------------------------------------------------------------


async def test_outros_grupos_e_so_a_contagem_de_quem_frequentou(
    db_session: AsyncSession,
) -> None:
    g = await grupo(db_session)
    a = await acao(db_session, g)
    outro = await grupo(db_session, "Outro Grupo")
    b1 = await acao(db_session, outro, "Ação B1")
    b2 = await acao(db_session, outro, "Ação B2")
    b3 = await acao(db_session, outro, "Ação B3")
    quem = await menina(db_session, 1)
    for acao_ in (a, b1, b2, b3):
        await inscrever(db_session, quem, acao_)
    await marcar(db_session, quem, b1, True)
    await marcar(db_session, quem, b2, True)
    await marcar(db_session, quem, b3, False)

    tabela = await build_table(db_session, g.id, HOJE, packages=[Package.OTHER_GROUPS])

    assert len(tabela.rows) == 1
    assert tabela.rows[0][-1] == "2"
    assert "Outro Grupo" not in to_csv(tabela)
    assert "Ação B" not in to_csv(tabela)


# --- RN-13 --------------------------------------------------------------------------


def test_coluna_sem_classificacao_nunca_sai(monkeypatch: pytest.MonkeyPatch) -> None:
    sem_classe = replace(PACKAGE_COLUMNS[Package.RATINGS][0], classification=None)
    monkeypatch.setitem(PACKAGE_COLUMNS, Package.RATINGS, (sem_classe,))

    assert sem_classe.key not in {c.key for c in columns_for(Package)}


def test_toda_coluna_declarada_tem_classificacao() -> None:
    declaradas = [*BASE_COLUMNS, *(c for cs in PACKAGE_COLUMNS.values() for c in cs)]
    assert all(c.classification is not None for c in declaradas)


# --- Rotas ----------------------------------------------------------------------------


async def test_rota_gera_so_com_os_pacotes_pedidos(db_session: AsyncSession) -> None:
    _, katia = await cenario(db_session)
    token = create_access_token(katia.id)

    feito = await chamar_rota(
        app, "POST", URL, db_session, token, corpo={"packages": ["funnel"]}
    )

    assert feito.status_code == 201
    assert feito.json()["columnCount"] == 8 + 3


async def test_rota_sem_corpo_sai_so_a_base(db_session: AsyncSession) -> None:
    """Sem corpo vale "Do meu jeito", que começa sem pacotes (RF-F24.10, D-104)."""
    _, katia = await cenario(db_session)
    token = create_access_token(katia.id)

    feito = await chamar_rota(app, "POST", URL, db_session, token)

    assert feito.json()["columnCount"] == 8


async def test_revisao_segue_os_pacotes(db_session: AsyncSession) -> None:
    _, katia = await cenario(db_session)
    token = create_access_token(katia.id)

    so_base = await chamar_rota(
        app, "GET", f"{URL}/preview?packages=", db_session, token
    )
    com_outros = await chamar_rota(
        app, "GET", f"{URL}/preview?packages=other_groups", db_session, token
    )
    ruim = await chamar_rota(
        app, "GET", f"{URL}/preview?packages=nome", db_session, token
    )

    assert len(so_base.json()["columns"]) == 8
    assert len(com_outros.json()["columns"]) == 9
    assert ruim.status_code == 422
