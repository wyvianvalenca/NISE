"""Exportação anônima (F24, #375): o arquivo, sem rota.

Rodam no Postgres de teste (`db_session`). Dados fictícios. Cada teste diz o
critério de aceite da #375 que cobre.
"""

from datetime import UTC, date, datetime, timedelta

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.actions.models import (
    Action,
    ActionFormat,
    ActionTopic,
    ActionType,
    ActionVisibility,
    Participation,
)
from app.modules.cities.models import City
from app.modules.exports.models import DataExport
from app.modules.exports.service import (
    BOM,
    CSV_ENCODING,
    NO_CUT,
    Column,
    ExportCut,
    ExportSummary,
    ExportTable,
    action_is_of_group,
    age_band,
    build_table,
    create_export,
    cut_options,
    file_name,
    new_code,
    purge_old_files,
    safe_cell,
    summarize,
    to_csv,
)
from app.modules.girls.models import Girl, StudyStage, Topic
from app.modules.groups.models import Group
from app.users.models import User

HOJE = date(2026, 10, 16)


async def grupo(sessao: AsyncSession, nome: str = "Rendeiras do Código") -> Group:
    novo = Group(name=nome)
    sessao.add(novo)
    await sessao.flush()
    return novo


async def acao(
    sessao: AsyncSession,
    do_grupo: Group,
    nome: str = "Oficina de Python",
    tipo: ActionType = ActionType.OFICINA,
    dia: date = date(2026, 9, 20),
    tags: tuple[Topic, ...] = (Topic.PROGRAMACAO, Topic.IA),
) -> Action:
    nova = Action(
        group_id=do_grupo.id,
        name=nome,
        type=tipo,
        starts_on=dia,
        ends_on=dia,
        format=ActionFormat.ONLINE,
        visibility=ActionVisibility.CLOSED,
        topics=[ActionTopic(topic=t) for t in tags],
    )
    sessao.add(nova)
    await sessao.flush()
    return nova


async def menina(
    sessao: AsyncSession, n: int, nascimento: date | None = date(2010, 3, 1)
) -> Girl:
    nova = Girl(
        email=f"menina{n}@exemplo.com",
        name=f"Menina Ficticia {n}",
        birth_date=nascimento,
        study_stage=StudyStage.MEDIO,
    )
    sessao.add(nova)
    await sessao.flush()
    return nova


async def inscrever(sessao: AsyncSession, quem: Girl, em: Action) -> None:
    sessao.add(Participation(girl_id=quem.id, action_id=em.id))
    await sessao.flush()


# --- Generalização (critério: faixa etária e mês) -----------------------------


def test_faixa_etaria() -> None:
    def faixa(anos: int) -> str:
        return age_band(date(HOJE.year - anos, 1, 1), HOJE)

    assert [faixa(13), faixa(14), faixa(15), faixa(16), faixa(17), faixa(18)] == [
        "13",
        "14-15",
        "14-15",
        "16-17",
        "16-17",
        "18+",
    ]
    assert faixa(30) == "18+"
    assert age_band(None, HOJE) == ""


def test_celula_que_comeca_com_formula_vira_texto() -> None:
    assert safe_cell("=SOMA(A1)") == "'=SOMA(A1)"
    assert safe_cell("Oficina") == "Oficina"


def test_csv_separa_por_tabulacao_e_poe_entre_aspas_o_que_quebraria_a_linha() -> None:
    """Revisão da #431: tabulação entre as colunas (RF-F24.34).

    Célula com tabulação, quebra de linha ou aspas vai entre aspas, e fórmula
    continua virando texto.
    """
    tabela = ExportTable(
        columns=(
            Column("a", "ação", "action"),
            Column("b", "tags", "action"),
            Column("c", "nota", "action"),
        ),
        rows=[["Oficina\tde Python", 'Robótica "kids"\nlinha 2', "=1+1"]],
        no_action=[False],
    )

    texto = to_csv(tabela)

    assert texto == (
        BOM + "ação\ttags\tnota\r\n"
        '"Oficina\tde Python"\t"Robótica ""kids""\nlinha 2"\t\'=1+1\r\n'
    )


def test_csv_baixa_em_utf16_com_bom() -> None:
    """Revisão da #431: UTF-16 com BOM, pra o Excel acertar os acentos."""
    texto = to_csv(ExportTable((Column("a", "município", "action"),), [["Maceió"]], []))

    baixado = texto.encode(CSV_ENCODING)

    assert baixado.startswith(b"\xff\xfe")  # BOM do UTF-16 little-endian
    assert baixado.decode("utf-16") == "município\r\nMaceió\r\n"


def test_nome_do_arquivo() -> None:
    assert (
        file_name("Rendeiras do Código", HOJE)
        == "rendeiras-do-codigo_do-meu-jeito_2026-10-16.csv"
    )


def test_codigo_nao_repete_e_tem_o_formato_do_figma() -> None:
    usados: set[str] = set()
    codigos = [new_code(usados) for _ in range(500)]

    assert len(set(codigos)) == 500
    assert all(c.startswith("M-") and len(c) == 6 for c in codigos)


# --- O arquivo (RF-F24.01, RF-F24.02) ------------------------------------------


async def test_uma_linha_por_menina_e_acao_so_do_grupo(
    db_session: AsyncSession,
) -> None:
    rendeiras = await grupo(db_session)
    outro = await grupo(db_session, "Outro Grupo Fictício")
    a1 = await acao(db_session, rendeiras, "Oficina 1")
    a2 = await acao(db_session, rendeiras, "Oficina 2")
    de_fora = await acao(db_session, outro, "Ação de outro grupo")
    ana, bia = await menina(db_session, 1), await menina(db_session, 2)
    for quem, onde in ((ana, a1), (ana, a2), (bia, a1), (bia, de_fora)):
        await inscrever(db_session, quem, onde)

    tabela = await build_table(db_session, rendeiras.id, HOJE)

    assert len(tabela.rows) == 3
    assert {linha[7] for linha in tabela.rows} == {"Oficina 1", "Oficina 2"}


async def test_arquivo_sem_identificador_direto(db_session: AsyncSession) -> None:
    g = await grupo(db_session)
    a = await acao(db_session, g)
    quem = await menina(db_session, 7)
    quem.city_ibge_code = 2800000
    db_session.add(
        City(id=2800000, name="São José da Tapera", state="AL", search_name="x")
    )
    await db_session.flush()
    await inscrever(db_session, quem, a)

    texto = to_csv(await build_table(db_session, g.id, HOJE, packages=[]))

    assert texto.startswith(BOM)
    assert "Menina Ficticia" not in texto
    assert "menina7@exemplo.com" not in texto
    assert "2010" not in texto  # a data de nascimento virou faixa
    cabecalho, linha, *_ = texto.removeprefix(BOM).split("\r\n")
    assert cabecalho == (
        "código\tfaixa etária\tmunicípio\tetapa escolar\ttipo\ttags\tmês\tação"
    )
    campos = linha.split("\t")
    assert campos[1:] == [
        "16-17",
        "São José da Tapera",  # o município como cadastrado (D-102)
        "Ensino médio",
        "Oficina",
        "Inteligência artificial, Programação",
        "2026-09",
        "Oficina de Python",
    ]


async def test_codigo_igual_para_a_menina_e_diferente_a_cada_exportacao(
    db_session: AsyncSession,
) -> None:
    g = await grupo(db_session)
    a1, a2 = await acao(db_session, g), await acao(db_session, g)
    ana, bia = await menina(db_session, 1), await menina(db_session, 2)
    for quem, onde in ((ana, a1), (ana, a2), (bia, a1)):
        await inscrever(db_session, quem, onde)

    primeira = await build_table(db_session, g.id, HOJE)
    segunda = await build_table(db_session, g.id, HOJE)

    codigos = [linha[0] for linha in primeira.rows]
    assert codigos[0] == codigos[2]  # as duas linhas da Ana (ações 1 e 2)
    assert codigos[0] != codigos[1]
    assert {linha[0] for linha in primeira.rows}.isdisjoint(
        {linha[0] for linha in segunda.rows}
    )


async def test_menina_sem_conta_no_banco_nao_aparece(db_session: AsyncSession) -> None:
    # RN-12: quem pediu exclusão perde a inscrição junto (CASCADE) e sai do arquivo.
    g = await grupo(db_session)
    a = await acao(db_session, g)
    ana, bia = await menina(db_session, 1), await menina(db_session, 2)
    await inscrever(db_session, ana, a)
    await inscrever(db_session, bia, a)
    await db_session.execute(delete(Girl).where(Girl.id == bia.id))
    await db_session.flush()

    tabela = await build_table(db_session, g.id, HOJE)

    assert len(tabela.rows) == 1


# --- Registro e prazo (RF-F24.34, RN-07) --------------------------------------


async def test_gerar_registra_e_o_link_vale_15_minutos(
    db_session: AsyncSession,
) -> None:
    g = await grupo(db_session)
    a = await acao(db_session, g)
    await inscrever(db_session, await menina(db_session, 1), a)
    usuaria = User(email="coord@exemplo.com", name="Coord Ficticia")
    db_session.add(usuaria)
    await db_session.flush()
    agora = datetime(2026, 10, 16, 12, 0, tzinfo=UTC)

    feito = await create_export(db_session, g.id, usuaria.id, HOJE, agora)

    assert feito.row_count == 1
    # Sem modelo vale "Do meu jeito", que começa sem pacotes (RF-F24.10).
    assert feito.column_count == 8
    assert feito.expires_at == agora + timedelta(minutes=15)
    assert feito.filename == "rendeiras-do-codigo_do-meu-jeito_2026-10-16.csv"
    assert feito.content is not None


async def test_arquivo_some_em_24_horas_e_o_registro_fica(
    db_session: AsyncSession,
) -> None:
    g = await grupo(db_session)
    antigo = DataExport(
        group_id=g.id,
        filename="x.csv",
        row_count=0,
        column_count=8,
        content="texto",
        expires_at=datetime(2026, 1, 1, tzinfo=UTC),
    )
    db_session.add(antigo)
    await db_session.flush()

    quantos = await purge_old_files(db_session, datetime.now(UTC) + timedelta(hours=25))

    assert quantos == 1
    restante = await db_session.scalar(select(DataExport))
    assert restante is not None
    assert restante.content is None


# --- Recorte (#378: período, ação, tipo e tag) -------------------------------


async def cenario_recorte(sessao: AsyncSession) -> tuple[Group, dict[str, Action]]:
    g = await grupo(sessao)
    acoes = {
        "oficina26": await acao(
            sessao, g, "Oficina 26", ActionType.OFICINA, date(2026, 3, 1), (Topic.IA,)
        ),
        "oficina25": await acao(
            sessao, g, "Oficina 25", ActionType.OFICINA, date(2025, 3, 1), (Topic.IA,)
        ),
        "palestra26": await acao(
            sessao,
            g,
            "Palestra 26",
            ActionType.PALESTRA,
            date(2026, 5, 1),
            (Topic.DADOS,),
        ),
    }
    ana, bia = await menina(sessao, 1), await menina(sessao, 2)
    for quem, em in (
        (ana, "oficina26"),
        (bia, "oficina26"),
        (ana, "oficina25"),
        (ana, "palestra26"),
    ):
        await inscrever(sessao, quem, acoes[em])
    return g, acoes


async def test_recorte_oficina_de_2026_so_tem_oficinas_de_2026(
    db_session: AsyncSession,
) -> None:
    g, _ = await cenario_recorte(db_session)

    corte = ExportCut(year=2026, type=ActionType.OFICINA)
    table = await build_table(db_session, g.id, HOJE, cut=corte)

    assert [linha[7] for linha in table.rows] == ["Oficina 26", "Oficina 26"]


async def test_recorte_por_acao_e_por_tag(db_session: AsyncSession) -> None:
    g, acoes = await cenario_recorte(db_session)

    uma = await build_table(
        db_session, g.id, HOJE, cut=ExportCut(action_id=acoes["oficina25"].id)
    )
    com_tag = await build_table(db_session, g.id, HOJE, cut=ExportCut(tag=Topic.DADOS))

    assert [linha[7] for linha in uma.rows] == ["Oficina 25"]
    assert [linha[7] for linha in com_tag.rows] == ["Palestra 26"]


async def test_resumo_acompanha_o_recorte(db_session: AsyncSession) -> None:
    g, _ = await cenario_recorte(db_session)

    tudo = await summarize(db_session, g.id, NO_CUT)
    oficinas_2026 = await summarize(
        db_session, g.id, ExportCut(year=2026, type=ActionType.OFICINA)
    )

    assert tudo == ExportSummary(rows=4, girls=2, no_action=0, actions=3)
    assert oficinas_2026 == ExportSummary(rows=2, girls=2, no_action=0, actions=1)


async def test_resumo_so_conta_o_proprio_grupo(db_session: AsyncSession) -> None:
    g, _ = await cenario_recorte(db_session)
    outro = await grupo(db_session, "Outro Grupo Fictício")
    a = await acao(db_session, outro)
    await inscrever(db_session, await menina(db_session, 9), a)

    assert (await summarize(db_session, g.id, NO_CUT)).rows == 4
    assert not await action_is_of_group(db_session, g.id, a.id)
    assert (await cut_options(db_session, g.id)).years == [2026, 2025]


async def test_exportacao_guarda_o_recorte_usado(db_session: AsyncSession) -> None:
    g, _ = await cenario_recorte(db_session)
    usuaria = User(email="coord@exemplo.com", name="Coord Ficticia")
    db_session.add(usuaria)
    await db_session.flush()

    feito = await create_export(
        db_session, g.id, usuaria.id, HOJE, cut=ExportCut(year=2026)
    )

    assert feito.row_count == 3
    assert feito.cut == {
        "year": 2026,
        "action_id": None,
        "type": None,
        "tag": None,
    }
