"""Exportação anônima (F24, #380): as meninas sem ação entram no arquivo.

"Sem ação" é a menina com conta que não esteve presente em nenhuma ação (D-105,
RF-F24.31), menos quem já está no arquivo do grupo com "nao_compareceu" (sem
contar duas vezes). Não é o mesmo que "chegou sozinha", que é a origem dela
(RN-32).
Elas só entram com o pacote "Grupos de comparação" (D-106), e o recorte não muda
quantas entram (D-107).

Rodam no Postgres de teste (`db_session`). Dados fictícios. Cada teste diz o
critério que cobre.
"""

from datetime import date

from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.actions.models import ActionType
from app.modules.exports.service import (
    NO_CUT,
    ExportCut,
    ExportModel,
    ExportTable,
    Package,
    build_table,
    create_export,
    packages_of,
    summarize,
)
from app.modules.followup.models import ComputingView, FollowupAnswer, FollowupRound
from app.modules.girls.models import Girl
from app.users.models import Role, User
from tests.test_exports_packages import marcar
from tests.test_exports_routes import PESQUISA, cenario, chamar
from tests.test_exports_service import HOJE, acao, grupo, inscrever, menina


async def com_conta(sessao: AsyncSession, n: int, conta: bool = True) -> Girl:
    """Uma menina com conta e sem nenhuma ação: está "sem ação"."""
    quem = await menina(sessao, n)
    if conta:
        usuaria = User(
            email=quem.email, name=quem.name, role=Role.GIRL, password_hash=None
        )
        sessao.add(usuaria)
        await sessao.flush()
        quem.user_id = usuaria.id
        await sessao.flush()
    return quem


def linhas_de(tabela: ExportTable) -> list[dict[str, str]]:
    """As linhas do arquivo, chave = nome da coluna."""
    return [
        {c.label: v for c, v in zip(tabela.columns, linha, strict=True)}
        for linha in tabela.rows
    ]


async def test_resumo_conta_as_sem_acao(db_session: AsyncSession) -> None:
    """Critério: o aviso diz quantas entram; sem nenhuma, o número é 0."""
    rendeiras = await grupo(db_session)
    a = await acao(db_session, rendeiras)
    await inscrever(db_session, await menina(db_session, 1), a)
    assert (await summarize(db_session, rendeiras.id, NO_CUT)).no_action == 0
    for n in (2, 3):
        await com_conta(db_session, n)
    resumo = await summarize(db_session, rendeiras.id, NO_CUT)
    assert (resumo.rows, resumo.girls, resumo.no_action) == (3, 3, 2)


async def test_linha_sem_acao_tem_grupo_e_colunas_da_acao_vazias(
    db_session: AsyncSession,
) -> None:
    """Critérios: uma linha por menina, "sem_acao" e colunas da ação vazias."""
    rendeiras = await grupo(db_session)
    await acao(db_session, rendeiras)
    await com_conta(db_session, 1)
    tabela = await build_table(db_session, rendeiras.id, HOJE)
    assert len(tabela.rows) == 1 and tabela.no_action == [True]
    linha = linhas_de(tabela)[0]
    assert linha["grupo de comparação"] == "sem_acao"
    for vazia in ("tipo", "tags", "mês", "ação", "inscrita", "presente", "concluinte"):
        assert linha[vazia] == ""
    assert linha["faixa etária"] == "16-17"
    assert linha["código"].startswith("M-")


async def test_so_o_que_os_pacotes_deixam(db_session: AsyncSession) -> None:
    """Critério: só as colunas dos pacotes ligados; nada que identifique (RN-60)."""
    rendeiras = await grupo(db_session)
    quem = await com_conta(db_session, 1)
    db_session.add(
        FollowupAnswer(
            girl_id=quem.id,
            round=FollowupRound.THREE_MONTHS,
            computing_view=ComputingView.WANT_TO_FOLLOW,
        )
    )
    await db_session.flush()
    tabela = await build_table(
        db_session, rendeiras.id, HOJE, packages=[Package.GROUPS, Package.INTEREST]
    )
    linha = linhas_de(tabela)[0]
    assert linha["interesse_3m"] == "Quero seguir"
    assert "inscrita" not in linha
    texto = " ".join(" ".join(r) for r in tabela.rows)
    assert quem.name not in texto and quem.email not in texto


async def test_codigo_muda_a_cada_exportacao(db_session: AsyncSession) -> None:
    """Critério: o código é sorteado em cada exportação (RN-09)."""
    rendeiras = await grupo(db_session)
    for n in range(1, 4):
        await com_conta(db_session, n)
    primeira = {r[0] for r in (await build_table(db_session, rendeiras.id, HOJE)).rows}
    segunda = {r[0] for r in (await build_table(db_session, rendeiras.id, HOJE)).rows}
    assert len(primeira) == 3 and primeira != segunda


async def test_poucas_entram_mesmo_assim(db_session: AsyncSession) -> None:
    """Critério: entram mesmo sendo menos de 5 (RN-60, D-101)."""
    rendeiras = await grupo(db_session)
    await com_conta(db_session, 1)
    assert len((await build_table(db_session, rendeiras.id, HOJE)).rows) == 1


async def test_nunca_inscrita_e_sem_acao(db_session: AsyncSession) -> None:
    """D-105: com conta e nunca inscrita em nenhuma ação, ela é sem ação.

    Resultado: uma linha só, "sem_acao"; o resumo conta 1 linha, 1 menina, 1 sem
    ação.
    """
    rendeiras = await grupo(db_session)
    await acao(db_session, rendeiras)
    await com_conta(db_session, 1)

    tabela = await build_table(
        db_session, rendeiras.id, HOJE, packages=[Package.GROUPS]
    )

    assert [linha["grupo de comparação"] for linha in linhas_de(tabela)] == ["sem_acao"]
    resumo = await summarize(db_session, rendeiras.id, NO_CUT)
    assert (resumo.rows, resumo.girls, resumo.no_action) == (1, 1, 1)


async def test_quem_esteve_presente_numa_acao_do_grupo_nao_e_sem_acao(
    db_session: AsyncSession,
) -> None:
    """D-105: a partir da primeira presença, ela deixa de ser sem ação.

    Resultado: uma linha só, a da ação, com "participante".
    """
    rendeiras = await grupo(db_session)
    oficina = await acao(db_session, rendeiras)
    quem = await com_conta(db_session, 1)
    await inscrever(db_session, quem, oficina)
    await marcar(db_session, quem, oficina, veio=True)

    tabela = await build_table(
        db_session, rendeiras.id, HOJE, packages=[Package.GROUPS]
    )

    assert [linha["grupo de comparação"] for linha in linhas_de(tabela)] == [
        "participante"
    ]
    resumo = await summarize(db_session, rendeiras.id, NO_CUT)
    assert (resumo.rows, resumo.girls, resumo.no_action) == (1, 1, 0)


async def test_quem_esteve_presente_numa_acao_de_outro_grupo_nao_e_sem_acao(
    db_session: AsyncSession,
) -> None:
    """D-105: presença em ação de qualquer grupo conta, como o código já fazia.

    O doc ainda não decidiu se só as ações do grupo deveriam contar (RF-F24.31).
    Resultado: nenhuma linha no arquivo das Rendeiras.
    """
    rendeiras = await grupo(db_session)
    outro = await grupo(db_session, "Outro Grupo")
    quem = await com_conta(db_session, 1)
    oficina = await acao(db_session, outro)
    await inscrever(db_session, quem, oficina)
    await marcar(db_session, quem, oficina, veio=True)

    resumo = await summarize(db_session, rendeiras.id, NO_CUT)

    assert (resumo.rows, resumo.girls, resumo.no_action) == (0, 0, 0)


async def test_inscrita_so_em_acao_ainda_nao_concluida_e_sem_acao(
    db_session: AsyncSession,
) -> None:
    """D-105: o que conta é a presença, não a inscrição.

    Inscrita só numa ação do grupo que ainda não foi concluída (a presença não
    foi anotada), ela nunca esteve presente: é sem ação. Resultado: a linha da
    ação, sem grupo de comparação (ainda não é "nao_compareceu", RF-F24.08), e a
    linha "sem_acao", com o mesmo código (RF-F24.03). O resumo conta 2 linhas e 1
    menina.
    """
    rendeiras = await grupo(db_session)
    futura = await acao(db_session, rendeiras, dia=date(2026, 11, 20))
    quem = await com_conta(db_session, 1)
    await inscrever(db_session, quem, futura)

    tabela = await build_table(
        db_session, rendeiras.id, HOJE, packages=[Package.GROUPS]
    )

    linhas = linhas_de(tabela)
    assert [linha["grupo de comparação"] for linha in linhas] == ["", "sem_acao"]
    assert linhas[0]["código"] == linhas[1]["código"]
    assert tabela.no_action == [False, True]
    resumo = await summarize(db_session, rendeiras.id, NO_CUT)
    assert (resumo.rows, resumo.girls, resumo.no_action) == (2, 1, 1)


async def test_inscrita_so_em_acao_de_outro_grupo_ainda_nao_concluida_e_sem_acao(
    db_session: AsyncSession,
) -> None:
    """D-105: inscrição sem presença não tira de sem ação, em nenhum grupo."""
    rendeiras = await grupo(db_session)
    outro = await grupo(db_session, "Outro Grupo")
    quem = await com_conta(db_session, 1)
    await inscrever(db_session, quem, await acao(db_session, outro))

    assert (await summarize(db_session, rendeiras.id, NO_CUT)).no_action == 1


async def test_inscrita_que_faltou_numa_acao_concluida_nao_e_sem_acao(
    db_session: AsyncSession,
) -> None:
    """Sem contar duas vezes: quem faltou já sai como "nao_compareceu".

    Inscrita numa ação do grupo já concluída e sem presença, ela nunca esteve
    presente, mas já está no arquivo com "nao_compareceu" (RF-F24.08). Resultado:
    uma linha só, "nao_compareceu", sem a linha "sem_acao"; o resumo conta 1
    linha, 1 menina, 0 sem ação.
    """
    rendeiras = await grupo(db_session)
    oficina = await acao(db_session, rendeiras)
    quem = await com_conta(db_session, 1)
    await inscrever(db_session, quem, oficina)
    await marcar(db_session, quem, oficina, veio=False)

    tabela = await build_table(
        db_session, rendeiras.id, HOJE, packages=[Package.GROUPS]
    )

    assert [linha["grupo de comparação"] for linha in linhas_de(tabela)] == [
        "nao_compareceu"
    ]
    assert tabela.no_action == [False]
    resumo = await summarize(db_session, rendeiras.id, NO_CUT)
    assert (resumo.rows, resumo.girls, resumo.no_action) == (1, 1, 0)


async def test_quem_faltou_nao_vira_sem_acao_por_causa_do_recorte(
    db_session: AsyncSession,
) -> None:
    """D-107: o recorte não muda quem é sem ação, nem para quem faltou.

    Com um recorte que deixa de fora a ação concluída a que ela faltou, ela não
    vira "sem_acao": a conta de sem ação é a mesma com e sem recorte. Resultado:
    nesse recorte ela não tem linha, como qualquer menina de uma ação que o
    recorte deixa de fora.
    """
    rendeiras = await grupo(db_session)
    oficina = await acao(db_session, rendeiras)
    quem = await com_conta(db_session, 1)
    await inscrever(db_session, quem, oficina)
    await marcar(db_session, quem, oficina, veio=False)
    palestras = ExportCut(type=ActionType.PALESTRA)

    resumo = await summarize(db_session, rendeiras.id, palestras)
    tabela = await build_table(db_session, rendeiras.id, HOJE, cut=palestras)

    assert (resumo.rows, resumo.girls, resumo.no_action) == (0, 0, 0)
    assert tabela.rows == []


async def test_quem_faltou_em_acao_de_outro_grupo_e_sem_acao_aqui(
    db_session: AsyncSession,
) -> None:
    """Sem contar duas vezes, mas só dentro do arquivo do grupo.

    A linha "nao_compareceu" dela fica no arquivo do outro grupo; no arquivo das
    Rendeiras ela não tem linha de ação, então entra como "sem_acao". Resultado:
    1 sem ação aqui e 0 no outro grupo.
    """
    rendeiras = await grupo(db_session)
    outro = await grupo(db_session, "Outro Grupo")
    oficina = await acao(db_session, outro)
    quem = await com_conta(db_session, 1)
    await inscrever(db_session, quem, oficina)
    await marcar(db_session, quem, oficina, veio=False)

    assert (await summarize(db_session, rendeiras.id, NO_CUT)).no_action == 1
    no_outro = await summarize(db_session, outro.id, NO_CUT)
    assert (no_outro.rows, no_outro.girls, no_outro.no_action) == (1, 1, 0)


async def test_sem_conta_nao_entra(db_session: AsyncSession) -> None:
    """Quem não tem conta (só importada, ou conta apagada) não entra (RN-12)."""
    rendeiras = await grupo(db_session)
    await com_conta(db_session, 1, conta=False)
    assert (await summarize(db_session, rendeiras.id, NO_CUT)).no_action == 0


async def test_recorte_nao_muda_quantas_sem_acao(db_session: AsyncSession) -> None:
    """D-107: período, ação, tipo e tag não mudam quantas entram."""
    rendeiras = await grupo(db_session)
    await acao(db_session, rendeiras, dia=date(2026, 9, 20))
    await com_conta(db_session, 1)
    for recorte in (ExportCut(year=2025), ExportCut(type=ActionType.PALESTRA)):
        assert (await summarize(db_session, rendeiras.id, recorte)).no_action == 1
        tabela = await build_table(db_session, rendeiras.id, HOJE, cut=recorte)
        assert tabela.no_action == [True]


async def test_so_entram_com_o_pacote_grupos_de_comparacao(
    db_session: AsyncSession,
) -> None:
    """D-106: só com o pacote "Grupos de comparação".

    Sempre em "Pesquisa"; em "Do meu jeito", só se ela liga o pacote; nunca em
    "Prestação de contas" nem em "Planejar a próxima ação".
    """
    rendeiras = await grupo(db_session)
    a = await acao(db_session, rendeiras)
    await inscrever(db_session, await menina(db_session, 1), a)
    await com_conta(db_session, 2)

    async def entram(pacotes: tuple[Package, ...]) -> int:
        resumo = await summarize(db_session, rendeiras.id, NO_CUT, pacotes)
        tabela = await build_table(db_session, rendeiras.id, HOJE, packages=pacotes)
        assert sum(tabela.no_action) == resumo.no_action
        assert len(tabela.rows) == resumo.rows
        return resumo.no_action

    assert await entram(packages_of(ExportModel.RESEARCH)) == 1
    assert await entram(packages_of(ExportModel.ACCOUNTABILITY)) == 0
    assert await entram(packages_of(ExportModel.PLANNING)) == 0
    assert await entram(packages_of(ExportModel.MY_WAY)) == 0
    assert await entram((*packages_of(ExportModel.MY_WAY), Package.GROUPS)) == 1


async def test_arquivo_gerado_segue_o_modelo(db_session: AsyncSession) -> None:
    """D-106 também no CSV, não só na tela."""
    rendeiras, katia = await cenario(db_session)
    await com_conta(db_session, 30)

    contas = await create_export(
        db_session, rendeiras.id, katia.id, HOJE, model=ExportModel.ACCOUNTABILITY
    )
    pesquisa = await create_export(
        db_session, rendeiras.id, katia.id, HOJE, model=ExportModel.RESEARCH
    )

    assert contas.row_count == 2
    assert pesquisa.row_count == 3
    assert pesquisa.content is not None and "sem_acao" in pesquisa.content


async def test_revisao_traz_uma_sem_acao_entre_as_cinco(
    db_session: AsyncSession,
) -> None:
    """Critério: a Revisão mostra uma linha sem ação entre as cinco."""
    rendeiras = await grupo(db_session)
    a = await acao(db_session, rendeiras)
    for n in range(1, 8):
        await inscrever(db_session, await menina(db_session, n), a)
    await com_conta(db_session, 20)
    tabela = await build_table(db_session, rendeiras.id, HOJE, limit=5)
    assert len(tabela.rows) == 5 and tabela.no_action == [False] * 4 + [True]


async def test_rota_resumo_e_previa(db_session: AsyncSession) -> None:
    """Com os pacotes da "Pesquisa", a rota conta as sem ação e a prévia marca a
    linha delas."""
    _, katia = await cenario(db_session)
    await com_conta(db_session, 30)
    pedido = f"?packages={PESQUISA}"
    resumo = (await chamar(db_session, katia, "GET", f"/summary{pedido}")).json()
    assert resumo["noAction"] == 1 and resumo["rows"] == 3
    previa = (await chamar(db_session, katia, "GET", f"/preview{pedido}")).json()
    assert previa["noAction"] == [False, False, True] and previa["totalRows"] == 3


async def test_rota_sem_pacotes_vale_do_meu_jeito(db_session: AsyncSession) -> None:
    """Sem o parâmetro `packages`, a prévia e o resumo descrevem o mesmo arquivo
    do POST sem corpo: "Do meu jeito", só a Base, sem as meninas sem ação
    (RF-F24.10, D-104, D-106). Resultado: 8 colunas, 2 linhas e 0 sem ação nos
    três.
    """
    _, katia = await cenario(db_session)
    await com_conta(db_session, 30)

    previa = (await chamar(db_session, katia, "GET", "/preview")).json()
    resumo = (await chamar(db_session, katia, "GET", "/summary")).json()
    feito = (await chamar(db_session, katia, "POST", "")).json()

    assert len(previa["columns"]) == feito["columnCount"] == 8
    assert previa["noAction"] == [False, False]
    assert (resumo["rows"], resumo["noAction"]) == (2, 0)
    assert previa["totalRows"] == feito["rowCount"] == 2


async def test_rota_resumo_sem_o_pacote_nao_conta(db_session: AsyncSession) -> None:
    """D-106 e RF-F24.33: sem o pacote, elas não entram e a contagem vem 0."""
    _, katia = await cenario(db_session)
    await com_conta(db_session, 30)
    sem = (await chamar(db_session, katia, "GET", "/summary?packages=funnel")).json()
    com = (await chamar(db_session, katia, "GET", "/summary?packages=groups")).json()
    assert (sem["rows"], sem["girls"], sem["noAction"]) == (2, 2, 0)
    assert (com["rows"], com["girls"], com["noAction"]) == (3, 3, 1)
    previa = await chamar(db_session, katia, "GET", "/preview?packages=funnel")
    assert previa.json()["noAction"] == [False, False]
