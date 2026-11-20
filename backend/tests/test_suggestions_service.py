"""Sugestões por regras (#80): filtro pelo perfil, o que já está no filé e a ordem.

Funções puras sobre uma base fixa de itens, mais o load_suggestions com uma
sessão falsa. Dados fictícios.
"""

from datetime import date
from unittest.mock import AsyncMock

import pytest

from app.modules.actions.models import (
    Action,
    ActionFormat,
    ActionTopic,
    ActionType,
    ActionVisibility,
)
from app.modules.catalog.models import (
    CuratedItem,
    CuratedItemTopic,
    CuratedType,
    ItemKind,
    ItemLevel,
    ItemOrigin,
)
from app.modules.catalog.schemas import CatalogItem
from app.modules.catalog.utils import item_id
from app.modules.girl_file.models import (
    DismissReason,
    FileEntry,
    FileStatus,
    SimilarChoice,
)
from app.modules.girls.models import EffortBand, Girl, GirlTopic, StudyStage, Topic
from app.modules.suggestions.service import (
    GirlProfile,
    PastChoice,
    build_suggestions,
    load_choices,
    load_suggestions,
    matches_profile,
    profile_of,
    rank,
    why_for_you,
)

TODAY = date(2026, 11, 18)
# Códigos IBGE usados só como números fictícios nos testes.
CIDADE_DA_MENINA = 2704302
OUTRA_CIDADE = 2700300

PROG = Topic.PROGRAMACAO
DADOS = Topic.DADOS
IA = Topic.IA
ROBOTICA = Topic.ROBOTICA

INICIANTE = ItemLevel.BEGINNER
INTERMEDIARIO = ItemLevel.INTERMEDIATE
AVANCADO = ItemLevel.ADVANCED


def item(
    id: int,
    topics: list[Topic],
    *,
    level: ItemLevel = INICIANTE,
    band: EffortBand = EffortBand.UMA_TARDE,
    stages: list[StudyStage] | None = None,
    min_age: int | None = None,
) -> CatalogItem:
    return CatalogItem(
        id=item_id(ItemOrigin.CURATED, id),
        origin=ItemOrigin.CURATED,
        kind=ItemKind.ACTIVITY,
        type="course",
        type_label="Curso online",
        title=f"Item ficticio {id}",
        source="Plataforma ficticia",
        description="Um item de exemplo.",
        url="https://exemplo.com/item",
        effort_band=band,
        level=level,
        topics=topics,
        stages=stages or [],
        format=ActionFormat.ONLINE,
        city_ibge_code=None,
        min_age=min_age,
        cost_cents=0,
        duration="~2 horas",
        event=None,
    )


def perfil(
    *topics: Topic,
    all_topics: bool = False,
    stage: StudyStage | None = StudyStage.MEDIO,
    age: int | None = 16,
) -> GirlProfile:
    return GirlProfile(
        topics=frozenset(topics), all_topics=all_topics, stage=stage, age=age
    )


def escolha(
    feito: CatalogItem,
    status: FileStatus,
    *,
    reason: DismissReason | None = None,
    rating: int | None = None,
    similar: SimilarChoice | None = None,
) -> PastChoice:
    return PastChoice(
        item_id=feito.id,
        status=status,
        topics=frozenset(feito.topics),
        level=feito.level,
        effort_band=feito.effort_band,
        dismiss_reason=reason,
        rating=rating,
        similar_choice=similar,
    )


def concluida(
    feito: CatalogItem,
    *,
    rating: int | None = None,
    similar: SimilarChoice | None = None,
) -> PastChoice:
    return escolha(feito, FileStatus.CONCLUDED, rating=rating, similar=similar)


def dispensada(feito: CatalogItem, reason: DismissReason) -> PastChoice:
    return escolha(feito, FileStatus.DISMISSED, reason=reason)


def ids(
    catalog: list[CatalogItem], profile: GirlProfile, choices: list[PastChoice]
) -> list[str]:
    # A ordem de todas as sugestões, sem separar por faixa.
    return [sugestao.id for sugestao in rank(catalog, profile, choices)]


# Filtro pelo perfil (RF-F11.02)


def test_tema_precisa_ter_pelo_menos_um_em_comum() -> None:
    menina = perfil(PROG, IA)

    assert matches_profile(item(1, [IA, DADOS]), menina)
    assert not matches_profile(item(2, [ROBOTICA]), menina)


def test_quem_pediu_de_tudo_ve_todos_os_temas() -> None:
    assert matches_profile(item(1, [ROBOTICA]), perfil(all_topics=True))


def test_quem_ainda_nao_escolheu_temas_ve_todos() -> None:
    assert matches_profile(item(1, [ROBOTICA]), perfil())


def test_item_sem_tema_serve_para_quem_escolheu_temas() -> None:
    # Uma ação de grupo pode ser cadastrada sem tema (RF-F17.06). Sem esta regra,
    # ela nunca apareceria para quem escolheu temas.
    assert matches_profile(item(1, []), perfil(PROG, IA))


def test_etapa_de_estudo_do_publico() -> None:
    menina = perfil(PROG, stage=StudyStage.MEDIO)

    assert matches_profile(item(1, [PROG], stages=[StudyStage.MEDIO]), menina)
    assert not matches_profile(item(2, [PROG], stages=[StudyStage.GRADUACAO]), menina)
    # Sem etapas, o item serve para todas.
    assert matches_profile(item(3, [PROG], stages=[]), menina)


def test_quem_nao_informou_a_etapa_ve_todas() -> None:
    menina = perfil(PROG, stage=None)

    assert matches_profile(item(1, [PROG], stages=[StudyStage.GRADUACAO]), menina)


def test_idade_minima() -> None:
    menina = perfil(PROG, age=15)

    assert matches_profile(item(1, [PROG], min_age=15), menina)
    assert not matches_profile(item(2, [PROG], min_age=16), menina)
    assert matches_profile(item(3, [PROG], min_age=None), menina)


def test_sem_data_de_nascimento_nao_ve_itens_com_idade_minima() -> None:
    menina = perfil(PROG, age=None)

    assert not matches_profile(item(1, [PROG], min_age=13), menina)
    assert matches_profile(item(2, [PROG]), menina)


def test_perfil_usa_so_temas_etapa_e_idade() -> None:
    # RN-05: nada de nome, e-mail ou data de nascimento nas regras.
    menina = Girl(
        id=3,
        email="ficticia@exemplo.com",
        name="Menina Ficticia",
        birth_date=date(2010, 11, 19),
        study_stage=StudyStage.MEDIO,
        all_topics=False,
        topics=[GirlTopic(topic=PROG), GirlTopic(topic=IA)],
    )

    resultado = profile_of(menina, TODAY)

    assert resultado == GirlProfile(
        topics=frozenset({PROG, IA}),
        all_topics=False,
        stage=StudyStage.MEDIO,
        # Faz 16 anos amanhã.
        age=15,
    )
    assert set(GirlProfile.__dataclass_fields__) == {
        "topics",
        "all_topics",
        "stage",
        "age",
    }


# As 5 faixas (RF-F10.03)


def test_devolve_as_5_faixas_na_ordem_da_tela_com_a_contagem() -> None:
    catalogo = [
        item(1, [PROG], band=EffortBand.PRIMEIROS_PASSOS),
        item(2, [PROG], band=EffortBand.UMA_TARDE),
        item(3, [PROG], band=EffortBand.UMA_TARDE),
        item(4, [PROG], band=EffortBand.GRANDE_DESAFIO),
        item(5, [ROBOTICA], band=EffortBand.NO_MEU_RITMO),
    ]

    faixas = build_suggestions(catalogo, perfil(PROG), [])

    assert [faixa.band for faixa in faixas] == list(EffortBand)
    assert [faixa.count for faixa in faixas] == [1, 2, 0, 0, 1]
    assert [s.id for s in faixas[1].items] == ["curadoria-2", "curadoria-3"]
    # A faixa sem sugestões vem com 0 e a lista vazia.
    assert faixas[2].items == []


# O que já está no filé não volta


@pytest.mark.parametrize("status", list(FileStatus), ids=lambda s: s.value)
def test_item_ja_no_file_nao_volta_como_sugestao(status: FileStatus) -> None:
    # Quero fazer, em andamento, concluído, inscrita, ver depois e não é pra mim.
    feito = item(1, [PROG])
    catalogo = [feito, item(2, [PROG])]

    assert ids(catalogo, perfil(PROG), [escolha(feito, status)]) == ["curadoria-2"]


# "Por que pra você" (RF-F11.04)


def test_por_que_pra_voce_cita_os_temas_em_comum() -> None:
    sugestao = item(1, [IA, PROG, ROBOTICA])

    assert why_for_you(sugestao, perfil(PROG, IA)) == (
        "você curtiu Programação e Inteligência artificial"
    )
    assert why_for_you(sugestao, perfil(PROG, IA, ROBOTICA)) == (
        "você curtiu Programação, Robótica e Inteligência artificial"
    )


def test_por_que_pra_voce_de_quem_pediu_de_tudo() -> None:
    assert why_for_you(item(1, [DADOS]), perfil(all_topics=True)) == (
        "você pediu pra ver de tudo"
    )


def test_sem_motivo_o_por_que_fica_vazio() -> None:
    assert why_for_you(item(1, [DADOS]), perfil()) is None


def test_cada_sugestao_leva_o_por_que() -> None:
    faixas = build_suggestions([item(1, [DADOS])], perfil(DADOS), [])

    assert faixas[1].items[0].why == "você curtiu Dados"


# Base da ordem: mais temas dela primeiro, depois a ordem do catálogo


def test_mais_temas_em_comum_vem_primeiro() -> None:
    catalogo = [item(1, [PROG]), item(2, [PROG, IA]), item(3, [IA])]

    assert ids(catalogo, perfil(PROG, IA), []) == [
        "curadoria-2",
        "curadoria-1",
        "curadoria-3",
    ]


# "Sugestões parecidas" de uma atividade concluída (RF-F10.09)

# Ela concluiu um curso intermediário de Programação. Gosta de Programação e Dados.
CONCLUIDO = item(10, [PROG], level=INTERMEDIARIO)
PROG_INICIANTE = item(1, [PROG], level=INICIANTE)
PROG_AVANCADO = item(2, [PROG], level=AVANCADO)
DADOS_AVANCADO = item(3, [DADOS], level=AVANCADO)
PROG_INTERMEDIARIO = item(4, [PROG], level=INTERMEDIARIO)
BASE = [CONCLUIDO, PROG_INICIANTE, PROG_AVANCADO, DADOS_AVANCADO, PROG_INTERMEDIARIO]
MENINA = perfil(PROG, DADOS)


def test_sem_escolhas_fica_na_ordem_do_catalogo() -> None:
    assert ids(BASE, MENINA, [concluida(CONCLUIDO)]) == [
        "curadoria-1",
        "curadoria-2",
        "curadoria-3",
        "curadoria-4",
    ]


def test_algo_mais_avancado_sobe_o_mesmo_tema_num_nivel_acima() -> None:
    escolhas = [concluida(CONCLUIDO, similar=SimilarChoice.MAIS_AVANCADO)]

    assert ids(BASE, MENINA, escolhas) == [
        "curadoria-2",
        "curadoria-1",
        "curadoria-3",
        "curadoria-4",
    ]


def test_mais_do_mesmo_nivel_sobe_o_mesmo_tema_no_mesmo_nivel() -> None:
    escolhas = [concluida(CONCLUIDO, similar=SimilarChoice.MESMO_NIVEL)]

    assert ids(BASE, MENINA, escolhas) == [
        "curadoria-4",
        "curadoria-1",
        "curadoria-2",
        "curadoria-3",
    ]


def test_outro_tema_sobe_os_outros_temas_dela_e_desce_o_concluido() -> None:
    escolhas = [concluida(CONCLUIDO, similar=SimilarChoice.OUTRO_TEMA)]

    assert ids(BASE, MENINA, escolhas) == [
        "curadoria-3",
        "curadoria-1",
        "curadoria-2",
        "curadoria-4",
    ]


def test_por_enquanto_ta_bom_nao_muda_nada() -> None:
    sem_resposta = ids(BASE, MENINA, [concluida(CONCLUIDO)])
    ta_bom = ids(
        BASE, MENINA, [concluida(CONCLUIDO, similar=SimilarChoice.POR_ENQUANTO_NAO)]
    )

    assert ta_bom == sem_resposta


def test_parecidas_mudam_a_ordem_dentro_da_faixa() -> None:
    # O que a tela mostra: as sugestões de uma faixa, já na nova ordem.
    escolhas = [concluida(CONCLUIDO, similar=SimilarChoice.MAIS_AVANCADO)]

    faixas = build_suggestions(BASE, MENINA, escolhas)

    assert faixas[1].items[0].id == "curadoria-2"


# Motivos do "Não é pra mim" (RF-F11.05)


def test_muito_dificil_desce_o_mesmo_tema_no_mesmo_nivel_ou_acima() -> None:
    escolhas = [dispensada(CONCLUIDO, DismissReason.MUITO_DIFICIL)]

    assert ids(BASE, MENINA, escolhas) == [
        "curadoria-1",
        "curadoria-3",
        "curadoria-2",
        "curadoria-4",
    ]


def test_muito_facil_sobe_os_niveis_acima() -> None:
    # Vale para qualquer tema: Programação e Dados avançados sobem.
    escolhas = [dispensada(CONCLUIDO, DismissReason.MUITO_FACIL)]

    assert ids(BASE, MENINA, escolhas) == [
        "curadoria-2",
        "curadoria-3",
        "curadoria-1",
        "curadoria-4",
    ]


def test_nao_curto_o_tema_desce_o_tema_todo() -> None:
    escolhas = [dispensada(CONCLUIDO, DismissReason.NAO_CURTO_O_TEMA)]

    assert ids(BASE, MENINA, escolhas) == [
        "curadoria-3",
        "curadoria-1",
        "curadoria-2",
        "curadoria-4",
    ]


def test_sem_tempo_agora_desce_as_faixas_longas() -> None:
    curto = item(1, [PROG], band=EffortBand.PRIMEIROS_PASSOS)
    no_meu_ritmo = item(2, [PROG], band=EffortBand.NO_MEU_RITMO)
    uma_tarde = item(3, [PROG], band=EffortBand.UMA_TARDE)
    grande = item(4, [PROG], band=EffortBand.GRANDE_DESAFIO)
    galera = item(5, [PROG], band=EffortBand.ROLE_COM_A_GALERA)
    dispensado = item(6, [PROG], band=EffortBand.NO_MEU_RITMO)
    catalogo = [curto, no_meu_ritmo, uma_tarde, grande, galera, dispensado]
    escolhas = [dispensada(dispensado, DismissReason.SEM_TEMPO_AGORA)]

    assert ids(catalogo, perfil(PROG), escolhas) == [
        "curadoria-1",
        "curadoria-3",
        "curadoria-5",
        "curadoria-2",
        "curadoria-4",
    ]


@pytest.mark.parametrize(
    "reason",
    [DismissReason.JA_CONHECO, DismissReason.OUTRO_MOTIVO, None],
    ids=["ja-conheco", "outro-motivo", "sem-motivo"],
)
def test_ja_conheco_e_outro_motivo_so_escondem_o_item(
    reason: DismissReason | None,
) -> None:
    escolhas = [escolha(CONCLUIDO, FileStatus.DISMISSED, reason=reason)]

    assert ids(BASE, MENINA, escolhas) == ids(BASE, MENINA, [concluida(CONCLUIDO)])


def test_outras_escolhas_somam() -> None:
    # Dois "Muito difícil" em Programação: o avançado de Dados passa à frente.
    outro = item(11, [PROG], level=INICIANTE)
    escolhas = [
        dispensada(CONCLUIDO, DismissReason.MUITO_DIFICIL),
        dispensada(outro, DismissReason.MUITO_DIFICIL),
    ]

    assert ids([*BASE, outro], MENINA, escolhas) == [
        "curadoria-3",
        "curadoria-1",
        "curadoria-2",
        "curadoria-4",
    ]


# Nota da atividade concluída (RF-F11.05)


@pytest.mark.parametrize("nota", [4, 5])
def test_nota_alta_sobe_o_tema_um_pouco(nota: int) -> None:
    # Dados empata com Programação no começo; a nota desempata.
    gostou = item(12, [DADOS])
    catalogo = [gostou, PROG_INICIANTE, DADOS_AVANCADO]

    assert ids(catalogo, MENINA, [concluida(gostou, rating=nota)]) == [
        "curadoria-3",
        "curadoria-1",
    ]


@pytest.mark.parametrize("nota", [1, 2])
def test_nota_baixa_desce_o_tema_um_pouco(nota: int) -> None:
    catalogo = [CONCLUIDO, PROG_INICIANTE, DADOS_AVANCADO]

    assert ids(catalogo, MENINA, [concluida(CONCLUIDO, rating=nota)]) == [
        "curadoria-3",
        "curadoria-1",
    ]


def test_nota_3_nao_muda_nada() -> None:
    catalogo = [CONCLUIDO, PROG_INICIANTE, DADOS_AVANCADO]

    assert ids(catalogo, MENINA, [concluida(CONCLUIDO, rating=3)]) == [
        "curadoria-1",
        "curadoria-3",
    ]


def test_nota_pesa_menos_que_parecidas() -> None:
    # "Um pouco": a nota 1 não desfaz o "Algo mais avançado" da mesma atividade.
    escolhas = [concluida(CONCLUIDO, rating=1, similar=SimilarChoice.MAIS_AVANCADO)]

    assert ids(BASE, MENINA, escolhas)[0] == "curadoria-2"


# Base fixa: o mesmo perfil sempre recebe a mesma lista

BASE_FIXA = [
    item(1, [PROG], band=EffortBand.PRIMEIROS_PASSOS),
    item(2, [IA, PROG], band=EffortBand.PRIMEIROS_PASSOS),
    item(3, [ROBOTICA], band=EffortBand.PRIMEIROS_PASSOS),
    item(4, [PROG], level=INTERMEDIARIO),
    item(5, [IA], level=AVANCADO),
    item(6, [PROG], level=AVANCADO),
    item(7, [IA], band=EffortBand.NO_MEU_RITMO, min_age=18),
    item(8, [PROG], band=EffortBand.NO_MEU_RITMO, stages=[StudyStage.MEDIO]),
    item(9, [IA], band=EffortBand.ROLE_COM_A_GALERA),
    item(10, [DADOS], band=EffortBand.GRANDE_DESAFIO),
]
MENINA_FIXA = perfil(PROG, IA, stage=StudyStage.MEDIO, age=16)
ESCOLHAS_FIXAS = [
    concluida(BASE_FIXA[3], rating=5, similar=SimilarChoice.MAIS_AVANCADO),
    dispensada(BASE_FIXA[0], DismissReason.MUITO_FACIL),
]


def test_base_fixa_da_sempre_a_mesma_resposta() -> None:
    primeira = build_suggestions(BASE_FIXA, MENINA_FIXA, ESCOLHAS_FIXAS)
    segunda = build_suggestions(BASE_FIXA, MENINA_FIXA, ESCOLHAS_FIXAS)

    assert primeira == segunda
    assert {faixa.band: [s.id for s in faixa.items] for faixa in primeira} == {
        EffortBand.PRIMEIROS_PASSOS: ["curadoria-2"],
        EffortBand.UMA_TARDE: ["curadoria-6", "curadoria-5"],
        EffortBand.NO_MEU_RITMO: ["curadoria-8"],
        EffortBand.ROLE_COM_A_GALERA: ["curadoria-9"],
        EffortBand.GRANDE_DESAFIO: [],
    }
    assert [faixa.count for faixa in primeira] == [1, 2, 1, 1, 0]


# load_suggestions e load_choices, com sessão falsa


def curado(id: int, topic: Topic, level: ItemLevel, **campos: object) -> CuratedItem:
    dados: dict[str, object] = {
        "id": id,
        "slug": f"item-ficticio-{id}",
        "kind": ItemKind.ACTIVITY,
        "type": CuratedType.COURSE,
        "title": f"Curso ficticio {id}",
        "source": "Plataforma ficticia",
        "description": "Um curso de exemplo.",
        "url": "https://exemplo.com/curso",
        "effort_band": EffortBand.UMA_TARDE,
        "level": level,
        "format": ActionFormat.ONLINE,
        "city_ibge_code": None,
        "min_age": None,
        "cost_cents": 0,
        "duration": "~2 horas",
        "active": True,
        "topics": [CuratedItemTopic(topic=topic)],
        "audiences": [],
    }
    dados.update(campos)
    return CuratedItem(**dados)


def acao_ficticia(id: int) -> Action:
    return Action(
        id=id,
        group_id=1,
        name="Oficina ficticia",
        type=ActionType.OFICINA,
        starts_on=date(2026, 12, 1),
        ends_on=date(2026, 12, 3),
        format=ActionFormat.IN_PERSON,
        city_ibge_code=CIDADE_DA_MENINA,
        visibility=ActionVisibility.OPEN,
        registration_url="https://forms.exemplo.com/inscricao",
        registrations_open=True,
        topics=[ActionTopic(topic=ROBOTICA)],
        audiences=[],
    )


async def test_load_choices_traz_tema_nivel_e_faixa_das_duas_fontes() -> None:
    entradas = [
        FileEntry(
            girl_id=3,
            curated_item_id=10,
            status=FileStatus.CONCLUDED,
            rating=5,
            similar_choice=SimilarChoice.MAIS_AVANCADO,
        ),
        FileEntry(girl_id=3, action_id=7, status=FileStatus.LATER),
    ]
    sessao_falsa = AsyncMock()
    # Na ordem: as linhas do filé, os itens da curadoria e as ações.
    sessao_falsa.scalars.side_effect = [
        entradas,
        [curado(10, PROG, INTERMEDIARIO)],
        [acao_ficticia(7)],
    ]

    escolhas = await load_choices(sessao_falsa, 3)

    assert escolhas == [
        PastChoice(
            item_id="curadoria-10",
            status=FileStatus.CONCLUDED,
            topics=frozenset({PROG}),
            level=INTERMEDIARIO,
            effort_band=EffortBand.UMA_TARDE,
            rating=5,
            similar_choice=SimilarChoice.MAIS_AVANCADO,
        ),
        PastChoice(
            item_id="acao-7",
            status=FileStatus.LATER,
            topics=frozenset({ROBOTICA}),
            level=INICIANTE,
            effort_band=EffortBand.GRANDE_DESAFIO,
        ),
    ]


async def test_load_choices_sem_file_nao_busca_itens() -> None:
    sessao_falsa = AsyncMock()
    sessao_falsa.scalars.side_effect = [[]]

    assert await load_choices(sessao_falsa, 3) == []
    assert sessao_falsa.scalars.await_count == 1


async def test_load_suggestions_junta_catalogo_perfil_e_file() -> None:
    menina = Girl(
        id=3,
        email="ficticia@exemplo.com",
        name="Menina Ficticia",
        birth_date=date(2010, 1, 1),
        city_ibge_code=CIDADE_DA_MENINA,
        study_stage=StudyStage.MEDIO,
        all_topics=False,
        topics=[GirlTopic(topic=PROG)],
    )
    concluido = curado(10, PROG, INTERMEDIARIO)
    avancado = curado(11, PROG, AVANCADO)
    iniciante = curado(12, PROG, INICIANTE)
    longe = curado(
        13,
        PROG,
        AVANCADO,
        format=ActionFormat.IN_PERSON,
        city_ibge_code=OUTRA_CIDADE,
    )
    robotica = curado(14, ROBOTICA, INICIANTE)
    sessao_falsa = AsyncMock()
    sessao_falsa.scalars.side_effect = [
        # load_catalog: os itens da curadoria.
        [concluido, iniciante, avancado, longe, robotica],
        # load_choices: as linhas do filé e os itens delas.
        [
            FileEntry(
                girl_id=3,
                curated_item_id=10,
                status=FileStatus.CONCLUDED,
                similar_choice=SimilarChoice.MAIS_AVANCADO,
            )
        ],
        [concluido],
    ]
    # load_catalog: as ações dos grupos (nenhuma).
    sessao_falsa.execute.return_value = []

    faixas = await load_suggestions(sessao_falsa, menina, TODAY)

    uma_tarde = faixas[1]
    assert uma_tarde.band is EffortBand.UMA_TARDE
    # Sem o concluído, sem a outra cidade e sem Robótica; o avançado sobe.
    assert [s.id for s in uma_tarde.items] == ["curadoria-11", "curadoria-12"]
    assert uma_tarde.count == 2
    assert uma_tarde.items[0].why == "você curtiu Programação"
