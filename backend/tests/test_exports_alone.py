"""Exportação anônima (F24, #380): quem chegou sozinha entra no arquivo.

Rodam no Postgres de teste (`db_session`). Dados fictícios. Cada teste diz o
critério de aceite da #380 que cobre.
"""

from datetime import date

from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.exports.service import (
    NO_CUT,
    ExportCut,
    Package,
    build_table,
    summarize,
)
from app.modules.followup.models import ComputingView, FollowupAnswer, FollowupRound
from app.modules.girls.models import Girl
from app.users.models import Role, User
from tests.test_exports_routes import cenario, chamar
from tests.test_exports_service import HOJE, acao, grupo, inscrever, menina


async def sozinha(sessao: AsyncSession, n: int, com_conta: bool = True) -> Girl:
    """Uma menina com conta e sem nenhuma ação."""
    quem = await menina(sessao, n)
    if com_conta:
        conta = User(
            email=quem.email, name=quem.name, role=Role.GIRL, password_hash=None
        )
        sessao.add(conta)
        await sessao.flush()
        quem.user_id = conta.id
        await sessao.flush()
    return quem


async def test_resumo_conta_as_sozinhas(db_session: AsyncSession) -> None:
    """Critério: o aviso diz quantas entram; sem nenhuma, o número é 0."""
    rendeiras = await grupo(db_session)
    a = await acao(db_session, rendeiras)
    await inscrever(db_session, await menina(db_session, 1), a)
    assert (await summarize(db_session, rendeiras.id, NO_CUT)).alone == 0
    for n in (2, 3):
        await sozinha(db_session, n)
    resumo = await summarize(db_session, rendeiras.id, NO_CUT)
    assert (resumo.rows, resumo.girls, resumo.alone) == (3, 3, 2)


async def test_linha_de_sozinha_tem_grupo_e_colunas_da_acao_vazias(
    db_session: AsyncSession,
) -> None:
    """Critérios: uma linha por menina, "sozinha" e colunas da ação vazias."""
    rendeiras = await grupo(db_session)
    await acao(db_session, rendeiras)
    await sozinha(db_session, 1)
    tabela = await build_table(db_session, rendeiras.id, HOJE)
    assert len(tabela.rows) == 1 and tabela.alone == [True]
    linha = {c.label: v for c, v in zip(tabela.columns, tabela.rows[0], strict=True)}
    assert linha["grupo de comparação"] == "sozinha"
    for vazia in ("tipo", "tags", "mês", "ação", "inscrita", "presente", "concluinte"):
        assert linha[vazia] == ""
    assert linha["faixa etária"] == "16-17"
    assert linha["código"].startswith("M-")


async def test_so_o_que_os_pacotes_deixam(db_session: AsyncSession) -> None:
    """Critério: sem pacotes, só a Base; nada que identifique (RN-60)."""
    rendeiras = await grupo(db_session)
    quem = await sozinha(db_session, 1)
    db_session.add(
        FollowupAnswer(
            girl_id=quem.id,
            round=FollowupRound.THREE_MONTHS,
            computing_view=ComputingView.WANT_TO_FOLLOW,
        )
    )
    await db_session.flush()
    so_base = await build_table(db_session, rendeiras.id, HOJE, packages=[])
    assert "grupo de comparação" not in [c.label for c in so_base.columns]
    com_interesse = await build_table(
        db_session, rendeiras.id, HOJE, packages=[Package.INTEREST]
    )
    assert "Quero seguir" in com_interesse.rows[0]
    texto = " ".join(" ".join(r) for r in com_interesse.rows)
    assert quem.name not in texto and quem.email not in texto


async def test_codigo_muda_a_cada_exportacao(db_session: AsyncSession) -> None:
    """Critério: o código é sorteado em cada exportação (RN-09)."""
    rendeiras = await grupo(db_session)
    for n in range(1, 4):
        await sozinha(db_session, n)
    primeira = {r[0] for r in (await build_table(db_session, rendeiras.id, HOJE)).rows}
    segunda = {r[0] for r in (await build_table(db_session, rendeiras.id, HOJE)).rows}
    assert len(primeira) == 3 and primeira != segunda


async def test_poucas_entram_mesmo_assim(db_session: AsyncSession) -> None:
    """Critério: entram mesmo sendo menos de 5 (RN-60, D-101)."""
    rendeiras = await grupo(db_session)
    await sozinha(db_session, 1)
    assert len((await build_table(db_session, rendeiras.id, HOJE)).rows) == 1


async def test_quem_foi_a_uma_acao_deixa_de_ser_sozinha(
    db_session: AsyncSession,
) -> None:
    """Critério: quem vai a uma ação, de qualquer grupo, sai das sozinhas."""
    rendeiras = await grupo(db_session)
    outro = await grupo(db_session, "Outro Grupo")
    quem = await sozinha(db_session, 1)
    await inscrever(db_session, quem, await acao(db_session, outro))
    resumo = await summarize(db_session, rendeiras.id, NO_CUT)
    assert resumo.alone == 0


async def test_sem_conta_nao_entra(db_session: AsyncSession) -> None:
    """Quem não tem conta (só importada, ou conta apagada) não entra (RN-12)."""
    rendeiras = await grupo(db_session)
    await sozinha(db_session, 1, com_conta=False)
    assert (await summarize(db_session, rendeiras.id, NO_CUT)).alone == 0


async def test_recorte_nao_muda_quantas_sozinhas(db_session: AsyncSession) -> None:
    """Suposição da #380: elas não têm ação, então o recorte não as tira."""
    rendeiras = await grupo(db_session)
    await acao(db_session, rendeiras, dia=date(2026, 9, 20))
    await sozinha(db_session, 1)
    resumo = await summarize(db_session, rendeiras.id, ExportCut(year=2025))
    assert resumo.alone == 1


async def test_revisao_traz_uma_sozinha_entre_as_cinco(
    db_session: AsyncSession,
) -> None:
    """Critério: a Revisão mostra uma linha de sozinha entre as cinco."""
    rendeiras = await grupo(db_session)
    a = await acao(db_session, rendeiras)
    for n in range(1, 8):
        await inscrever(db_session, await menina(db_session, n), a)
    await sozinha(db_session, 20)
    tabela = await build_table(db_session, rendeiras.id, HOJE, limit=5)
    assert len(tabela.rows) == 5 and tabela.alone == [False] * 4 + [True]


async def test_rota_resumo_e_previa(db_session: AsyncSession) -> None:
    """A rota conta as sozinhas e a prévia marca a linha delas."""
    _, katia = await cenario(db_session)
    await sozinha(db_session, 30)
    resumo = (await chamar(db_session, katia, "GET", "/summary")).json()
    assert resumo["alone"] == 1 and resumo["rows"] == 3
    previa = (await chamar(db_session, katia, "GET", "/preview")).json()
    assert previa["alone"] == [False, False, True] and previa["totalRows"] == 3
