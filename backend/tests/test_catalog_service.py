"""Catálogo de sugestões (#79): formato único e quem pode ser sugerido.

Funções puras, mais o load_catalog com uma sessão falsa. Dados fictícios.
"""

from datetime import date, timedelta
from unittest.mock import AsyncMock

import pytest

from app.modules.actions.models import (
    Action,
    ActionAudience,
    ActionFormat,
    ActionTopic,
    ActionType,
    ActionVisibility,
)
from app.modules.catalog.models import (
    CuratedItem,
    CuratedItemAudience,
    CuratedItemTopic,
    CuratedType,
    ItemKind,
    ItemLevel,
    ItemOrigin,
)
from app.modules.catalog.service import (
    action_effort_band,
    action_is_visible,
    curated_is_visible,
    from_action,
    from_curated,
    load_catalog,
    reaches_city,
)
from app.modules.catalog.utils import (
    ACTION_TYPE_LABELS,
    CURATED_TYPE_LABELS,
    LEVEL_ORDER,
    item_id,
    parse_item_id,
)
from app.modules.girls.models import EffortBand, StudyStage, Topic

TODAY = date(2026, 11, 18)
TOMORROW = TODAY + timedelta(days=1)
YESTERDAY = TODAY - timedelta(days=1)
# Códigos IBGE usados só como números fictícios nos testes.
CIDADE_DA_MENINA = 2704302
OUTRA_CIDADE = 2700300


def item_curado(
    id: int = 1,
    *,
    kind: ItemKind = ItemKind.ACTIVITY,
    active: bool = True,
    expires_on: date | None = None,
    format: ActionFormat = ActionFormat.ONLINE,
    city: int | None = None,
    starts_on: date | None = None,
    ends_on: date | None = None,
    registration_deadline: date | None = None,
) -> CuratedItem:
    return CuratedItem(
        id=id,
        slug=f"item-ficticio-{id}",
        kind=kind,
        type=CuratedType.COURSE,
        title="Curso ficticio de Python",
        source="Plataforma ficticia",
        description="Um curso de exemplo.",
        url="https://exemplo.com/curso",
        effort_band=EffortBand.NO_MEU_RITMO,
        level=ItemLevel.INTERMEDIATE,
        format=format,
        city_ibge_code=city,
        min_age=13,
        cost_cents=0,
        duration="~10 horas",
        expires_on=expires_on,
        active=active,
        starts_on=starts_on,
        ends_on=ends_on,
        registration_deadline=registration_deadline,
        prerequisites="Saber usar o navegador" if kind is ItemKind.EVENT else None,
        topics=[
            CuratedItemTopic(topic=Topic.PROGRAMACAO),
            CuratedItemTopic(topic=Topic.IA),
        ],
        audiences=[CuratedItemAudience(stage=StudyStage.MEDIO)],
    )


def evento_curado(id: int = 2, **campos: date | None) -> CuratedItem:
    datas: dict[str, date | None] = {
        "starts_on": TOMORROW,
        "ends_on": TOMORROW + timedelta(days=1),
    }
    datas.update(campos)
    return item_curado(
        id,
        kind=ItemKind.EVENT,
        starts_on=datas["starts_on"],
        ends_on=datas["ends_on"],
        registration_deadline=datas.get("registration_deadline"),
    )


def acao(
    id: int = 7,
    *,
    starts_on: date = TOMORROW,
    ends_on: date | None = None,
    visibility: ActionVisibility = ActionVisibility.OPEN,
    registrations_open: bool = True,
    format: ActionFormat = ActionFormat.IN_PERSON,
    city: int | None = CIDADE_DA_MENINA,
    url: str | None = "https://forms.exemplo.com/inscricao?grupo=ficticio",
) -> Action:
    return Action(
        id=id,
        group_id=1,
        name="Oficina ficticia de robotica",
        type=ActionType.OFICINA,
        starts_on=starts_on,
        ends_on=ends_on or starts_on,
        format=format,
        city_ibge_code=city if format is ActionFormat.IN_PERSON else None,
        visibility=visibility,
        registration_url=url,
        description="Robôs com sucata.",
        registrations_open=registrations_open,
        topics=[ActionTopic(topic=Topic.ROBOTICA)],
        audiences=[
            ActionAudience(stage=StudyStage.FUNDAMENTAL),
            ActionAudience(stage=StudyStage.MEDIO),
        ],
    )


# Curadoria: ativo e na validade (RF-F11.06, RF-F11.07)


def test_item_ativo_sem_validade_aparece() -> None:
    assert curated_is_visible(item_curado(), TODAY)


def test_item_desativado_nunca_aparece() -> None:
    assert not curated_is_visible(item_curado(active=False), TODAY)


def test_item_vencido_ontem_nao_aparece() -> None:
    assert not curated_is_visible(item_curado(expires_on=YESTERDAY), TODAY)


def test_validade_vale_ate_o_proprio_dia() -> None:
    assert curated_is_visible(item_curado(expires_on=TODAY), TODAY)


def test_evento_futuro_dentro_do_prazo_aparece() -> None:
    assert curated_is_visible(evento_curado(registration_deadline=TODAY), TODAY)


@pytest.mark.parametrize("inicio", [TODAY, YESTERDAY], ids=["hoje", "ontem"])
def test_evento_que_ja_comecou_nao_aparece(inicio: date) -> None:
    evento = evento_curado(starts_on=inicio, ends_on=TOMORROW)

    assert not curated_is_visible(evento, TODAY)


def test_evento_com_prazo_de_inscricao_vencido_nao_aparece() -> None:
    evento = evento_curado(registration_deadline=YESTERDAY)

    assert not curated_is_visible(evento, TODAY)


def test_evento_desativado_ou_vencido_nao_aparece() -> None:
    desativado = evento_curado()
    desativado.active = False
    vencido = evento_curado()
    vencido.expires_on = YESTERDAY

    assert not curated_is_visible(desativado, TODAY)
    assert not curated_is_visible(vencido, TODAY)


# Ações dos grupos (RN-16)


def test_acao_aberta_futura_e_com_inscricoes_abertas_aparece() -> None:
    assert action_is_visible(acao(), TODAY)


def test_acao_fechada_nunca_aparece() -> None:
    assert not action_is_visible(acao(visibility=ActionVisibility.CLOSED), TODAY)


def test_acao_com_inscricoes_encerradas_nao_aparece() -> None:
    assert not action_is_visible(acao(registrations_open=False), TODAY)


@pytest.mark.parametrize("inicio", [TODAY, YESTERDAY], ids=["hoje", "ontem"])
def test_acao_que_nao_e_futura_nao_aparece(inicio: date) -> None:
    assert not action_is_visible(acao(starts_on=inicio), TODAY)


# Cidade (RN-16): vale para as duas fontes


def test_online_aparece_para_todas() -> None:
    assert reaches_city(ActionFormat.ONLINE, None, CIDADE_DA_MENINA)
    assert reaches_city(ActionFormat.ONLINE, None, None)


def test_presencial_aparece_so_na_mesma_cidade() -> None:
    assert reaches_city(ActionFormat.IN_PERSON, CIDADE_DA_MENINA, CIDADE_DA_MENINA)
    assert not reaches_city(ActionFormat.IN_PERSON, OUTRA_CIDADE, CIDADE_DA_MENINA)


def test_presencial_nao_aparece_para_quem_nao_informou_a_cidade() -> None:
    assert not reaches_city(ActionFormat.IN_PERSON, CIDADE_DA_MENINA, None)


# Faixa de esforço das ações


def test_acao_de_um_dia_e_role_com_a_galera() -> None:
    assert action_effort_band(acao()) is EffortBand.ROLE_COM_A_GALERA


def test_acao_de_mais_de_um_dia_e_grande_desafio() -> None:
    varios_dias = acao(ends_on=TOMORROW + timedelta(days=1))

    assert action_effort_band(varios_dias) is EffortBand.GRANDE_DESAFIO


# Formato único (RF-F11.01)


def test_curadoria_e_acao_saem_no_mesmo_formato() -> None:
    da_curadoria = from_curated(item_curado())
    do_grupo = from_action(acao(), "Grupo Ficticio")

    assert type(da_curadoria) is type(do_grupo)
    assert da_curadoria.model_dump().keys() == do_grupo.model_dump().keys()


def test_item_da_curadoria_leva_todos_os_campos() -> None:
    item = from_curated(item_curado(id=12))

    assert item.id == "curadoria-12"
    assert item.origin is ItemOrigin.CURATED
    assert item.kind is ItemKind.ACTIVITY
    assert item.type == "course"
    assert item.type_label == "Curso online"
    assert item.effort_band is EffortBand.NO_MEU_RITMO
    assert item.level is ItemLevel.INTERMEDIATE
    assert item.topics == [Topic.PROGRAMACAO, Topic.IA]
    assert item.stages == [StudyStage.MEDIO]
    assert item.format is ActionFormat.ONLINE
    assert item.city_ibge_code is None
    assert item.url == "https://exemplo.com/curso"
    assert item.min_age == 13
    assert item.cost_cents == 0
    assert item.duration == "~10 horas"
    assert item.description == "Um curso de exemplo."
    assert item.event is None


def test_evento_da_curadoria_leva_datas_prazo_organizador_e_pre_requisitos() -> None:
    evento = from_curated(evento_curado(registration_deadline=TODAY))

    assert evento.kind is ItemKind.EVENT
    assert evento.event is not None
    assert evento.event.starts_on == TOMORROW
    assert evento.event.ends_on == TOMORROW + timedelta(days=1)
    assert evento.event.registration_deadline == TODAY
    assert evento.event.organizer == "Plataforma ficticia"
    assert evento.event.prerequisites == "Saber usar o navegador"


def test_acao_vira_evento_do_grupo() -> None:
    item = from_action(acao(id=7, ends_on=TOMORROW + timedelta(days=2)), "Grupo X")

    assert item.id == "acao-7"
    assert item.origin is ItemOrigin.GROUP_ACTION
    assert item.kind is ItemKind.EVENT
    assert item.type == "oficina"
    assert item.type_label == "Oficina"
    assert item.title == "Oficina ficticia de robotica"
    assert item.source == "Grupo X"
    assert item.effort_band is EffortBand.GRANDE_DESAFIO
    assert item.level is ItemLevel.BEGINNER
    assert item.stages == [StudyStage.FUNDAMENTAL, StudyStage.MEDIO]
    assert item.city_ibge_code == CIDADE_DA_MENINA
    assert item.duration == "3 dias"
    assert item.cost_cents is None
    assert item.event is not None
    assert item.event.organizer == "Grupo X"
    assert item.event.starts_on == TOMORROW


def test_link_do_grupo_fica_exatamente_como_foi_cadastrado() -> None:
    # RN-19: nada da menina é acrescentado ao link.
    item = from_action(acao(), "Grupo X")

    assert item.url == "https://forms.exemplo.com/inscricao?grupo=ficticio"


def test_temas_do_item_sao_os_mesmos_codigos_do_perfil() -> None:
    # As tags da ação já são temas (D-44): nenhuma tradução no caminho.
    da_curadoria = from_curated(item_curado())
    do_grupo = from_action(acao(), "Grupo X")

    assert all(isinstance(tema, Topic) for tema in da_curadoria.topics)
    assert do_grupo.topics == [Topic.ROBOTICA]
    assert do_grupo.model_dump(mode="json")["topics"] == ["robotica"]


# load_catalog


def sessao_com(curados: list[CuratedItem], acoes: list[Action]) -> AsyncMock:
    # scalars devolve os itens da curadoria; execute, os pares (ação, nome do grupo).
    sessao_falsa = AsyncMock()
    sessao_falsa.scalars.return_value = curados
    sessao_falsa.execute.return_value = [(item, "Grupo Ficticio") for item in acoes]
    return sessao_falsa


async def test_catalogo_junta_as_duas_fontes_e_aplica_as_regras() -> None:
    curados = [
        item_curado(1),
        item_curado(2, active=False),
        item_curado(3, expires_on=YESTERDAY),
        item_curado(4, format=ActionFormat.IN_PERSON, city=OUTRA_CIDADE),
        item_curado(5, format=ActionFormat.IN_PERSON, city=CIDADE_DA_MENINA),
    ]
    acoes = [
        acao(7),
        acao(8, registrations_open=False),
        acao(9, city=OUTRA_CIDADE),
        acao(10, format=ActionFormat.ONLINE),
    ]

    itens = await load_catalog(sessao_com(curados, acoes), CIDADE_DA_MENINA, TODAY)

    assert [item.id for item in itens] == [
        "curadoria-1",
        "curadoria-5",
        "acao-7",
        "acao-10",
    ]


async def test_catalogo_sem_acoes_tem_so_a_curadoria() -> None:
    # Enquanto a C1 não existe, não há ações: o catálogo é só a curadoria.
    itens = await load_catalog(sessao_com([item_curado(1)], []), None, TODAY)

    assert [item.origin for item in itens] == [ItemOrigin.CURATED]


# Ids e listas


def test_id_do_item_vai_e_volta() -> None:
    assert parse_item_id(item_id(ItemOrigin.CURATED, 12)) == (ItemOrigin.CURATED, 12)
    assert parse_item_id("acao-7") == (ItemOrigin.GROUP_ACTION, 7)


@pytest.mark.parametrize("texto", ["", "7", "acao-", "acao-x", "grupo-7", "acao-²"])
def test_id_invalido_devolve_none(texto: str) -> None:
    assert parse_item_id(texto) is None


def test_todo_tipo_tem_nome_para_a_tela() -> None:
    assert set(CURATED_TYPE_LABELS) == set(CuratedType)
    assert set(ACTION_TYPE_LABELS) == set(ActionType)


def test_niveis_em_ordem_do_mais_facil_ao_mais_dificil() -> None:
    assert LEVEL_ORDER == [
        ItemLevel.BEGINNER,
        ItemLevel.INTERMEDIATE,
        ItemLevel.ADVANCED,
    ]
    assert set(LEVEL_ORDER) == set(ItemLevel)


def test_faixas_tem_os_codigos_que_o_front_usa() -> None:
    # Os mesmos de BAND_CODES em frontend/lib/descobrir.ts, na mesma ordem.
    assert [band.value for band in EffortBand] == [
        "primeiros-passos",
        "uma-tarde",
        "no-meu-ritmo",
        "role-com-a-galera",
        "grande-desafio",
    ]
