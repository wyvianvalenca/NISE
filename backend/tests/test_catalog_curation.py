"""Carga da curadoria pelo script (#79, RF-F11.06). Dados fictícios.

save_curated_items roda com uma sessão falsa; a carga contra o Postgres de
verdade está no "Como testar" do PR.
"""

from typing import Any
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.modules.actions.models import ActionFormat
from app.modules.catalog.models import (
    CuratedItem,
    CuratedItemTopic,
    CuratedType,
    ItemKind,
)
from app.modules.catalog.schemas import CuratedItemIn
from app.modules.catalog.service import apply_entry, save_curated_items
from app.modules.girls.models import EffortBand, StudyStage, Topic
from scripts.carregar_curadoria import DATA_FILE, CurationFileError, parse, read


def dados(**campos: Any) -> dict[str, Any]:
    # Como uma entrada do JSON da curadoria.
    entrada: dict[str, Any] = {
        "slug": "curso-ficticio",
        "kind": "atividade",
        "type": "course",
        "title": "Curso ficticio",
        "source": "Plataforma ficticia",
        "description": "Descricao de exemplo.",
        "url": "https://exemplo.com/curso",
        "effort_band": "no-meu-ritmo",
        "level": "iniciante",
        "topics": ["programacao"],
        "format": "online",
        "duration": "~10 horas",
    }
    entrada.update(campos)
    return entrada


def evento(**campos: Any) -> dict[str, Any]:
    datas_do_evento: dict[str, Any] = {
        "slug": "hackathon-ficticio",
        "kind": "evento",
        "type": "hackathon",
        "starts_on": "2026-12-05",
        "ends_on": "2026-12-06",
        "registration_deadline": "2026-11-30",
        "prerequisites": "Nenhum",
    }
    datas_do_evento.update(campos)
    return dados(**datas_do_evento)


# Validação do arquivo


def test_entrada_valida_vira_item() -> None:
    [entrada] = parse([dados()])

    assert entrada.kind is ItemKind.ACTIVITY
    assert entrada.type is CuratedType.COURSE
    assert entrada.effort_band is EffortBand.NO_MEU_RITMO
    assert entrada.topics == [Topic.PROGRAMACAO]
    assert entrada.stages == []
    assert entrada.cost_cents == 0
    assert entrada.active is True


def test_evento_com_datas_e_valido() -> None:
    [entrada] = parse([evento()])

    assert entrada.kind is ItemKind.EVENT
    assert entrada.prerequisites == "Nenhum"


@pytest.mark.parametrize(
    ("campos", "trecho"),
    [
        ({"url": "http://exemplo.com"}, "url"),
        ({"topics": []}, "topics"),
        ({"topics": ["culinaria"]}, "topics"),
        ({"effort_band": "um-mes"}, "effort_band"),
        ({"level": "expert"}, "level"),
        ({"cost_cents": -100}, "cost_cents"),
        ({"slug": "Com Espaco"}, "slug"),
        ({"tags": ["robotica"]}, "tags"),
        ({"format": "in_person"}, "city_ibge_code"),
        ({"city_ibge_code": 2704302}, "online não tem cidade"),
        ({"starts_on": "2026-12-05"}, "Só evento"),
    ],
    ids=[
        "link-sem-https",
        "sem-tema",
        "tema-fora-da-lista",
        "faixa-fora-da-lista",
        "nivel-fora-da-lista",
        "custo-negativo",
        "slug-invalido",
        "campo-a-mais",
        "presencial-sem-cidade",
        "online-com-cidade",
        "atividade-com-data",
    ],
)
def test_entrada_invalida_e_recusada_com_o_motivo(
    campos: dict[str, Any], trecho: str
) -> None:
    with pytest.raises(CurationFileError) as erro:
        parse([dados(**campos)])

    # A mensagem diz qual item (pelo slug) e o que corrigir.
    assert str(erro.value).startswith(campos.get("slug", "curso-ficticio"))
    assert trecho in str(erro.value)


def test_evento_sem_datas_e_recusado() -> None:
    with pytest.raises(CurationFileError, match="starts_on e ends_on"):
        parse([evento(starts_on=None)])


def test_evento_que_termina_antes_de_comecar_e_recusado() -> None:
    with pytest.raises(CurationFileError, match="antes de starts_on"):
        parse([evento(ends_on="2026-12-01")])


def test_slug_repetido_e_recusado() -> None:
    with pytest.raises(CurationFileError, match="slug repetido"):
        parse([dados(), dados(title="Outro titulo")])


def test_um_erro_barra_o_arquivo_inteiro_e_lista_todos() -> None:
    with pytest.raises(CurationFileError) as erro:
        parse([dados(slug="bom"), dados(slug="ruim-1", url="ftp://x"), "texto"])

    mensagem = str(erro.value)
    assert "ruim-1" in mensagem
    assert "item 3" in mensagem
    assert "bom" not in mensagem


def test_temas_repetidos_viram_um() -> None:
    [entrada] = parse([dados(topics=["ia", "ia", "dados"])])

    assert entrada.topics == [Topic.IA, Topic.DADOS]


# A base inicial do repositório (D-13)


def test_arquivo_do_repositorio_e_valido() -> None:
    assert len(read(DATA_FILE)) > 0


def test_base_inicial_tem_itens_nas_5_faixas() -> None:
    faixas = {entrada.effort_band for entrada in read(DATA_FILE)}

    assert faixas == set(EffortBand)


def test_base_inicial_cobre_todos_os_temas_do_perfil() -> None:
    temas = {tema for entrada in read(DATA_FILE) for tema in entrada.topics}

    assert temas == set(Topic)


# Gravação: cria, atualiza e não duplica


def entrada(**campos: Any) -> CuratedItemIn:
    return CuratedItemIn.model_validate(dados(**campos))


def sessao_com(existentes: list[CuratedItem]) -> AsyncMock:
    # scalars devolve os itens que já estão no banco; add é síncrono.
    sessao_falsa = AsyncMock()
    sessao_falsa.scalars.return_value = existentes
    sessao_falsa.add = MagicMock()
    return sessao_falsa


async def test_item_novo_e_criado() -> None:
    sessao_falsa = sessao_com([])

    criados, atualizados = await save_curated_items(sessao_falsa, [entrada()])

    assert (criados, atualizados) == (1, 0)
    [item] = [chamada.args[0] for chamada in sessao_falsa.add.call_args_list]
    assert item.slug == "curso-ficticio"
    assert item.title == "Curso ficticio"
    assert [linha.topic for linha in item.topics] == [Topic.PROGRAMACAO]
    sessao_falsa.commit.assert_awaited_once()


async def test_rodar_de_novo_atualiza_sem_duplicar() -> None:
    primeira = sessao_com([])
    await save_curated_items(primeira, [entrada()])
    gravados = [chamada.args[0] for chamada in primeira.add.call_args_list]

    # A segunda carga encontra no banco o que a primeira gravou.
    segunda = sessao_com(gravados)
    criados, atualizados = await save_curated_items(
        segunda, [entrada(title="Curso ficticio, 2a edicao")]
    )

    assert (criados, atualizados) == (0, 1)
    segunda.add.assert_not_called()
    assert gravados[0].title == "Curso ficticio, 2a edicao"


async def test_desativar_pelo_arquivo() -> None:
    existente = CuratedItem(slug="curso-ficticio", topics=[], audiences=[])

    await save_curated_items(sessao_com([existente]), [entrada(active=False)])

    assert existente.active is False


def test_temas_que_continuam_mantem_a_mesma_linha() -> None:
    linha_de_programacao = CuratedItemTopic(topic=Topic.PROGRAMACAO)
    item = CuratedItem(
        slug="curso-ficticio",
        topics=[linha_de_programacao, CuratedItemTopic(topic=Topic.JOGOS)],
        audiences=[],
    )

    apply_entry(
        item, entrada(topics=["programacao", "ia"], stages=["medio", "tecnico"])
    )

    assert [linha.topic for linha in item.topics] == [Topic.PROGRAMACAO, Topic.IA]
    # A mesma linha, não uma nova: não apaga e recria (restrição de único).
    assert item.topics[0] is linha_de_programacao
    assert [linha.stage for linha in item.audiences] == [
        StudyStage.MEDIO,
        StudyStage.TECNICO,
    ]


def test_presencial_guarda_a_cidade() -> None:
    item = CuratedItem(slug="curso-ficticio", topics=[], audiences=[])

    apply_entry(item, entrada(format="in_person", city_ibge_code=2704302))

    assert item.format is ActionFormat.IN_PERSON
    assert item.city_ibge_code == 2704302
