""" "Você foi?" do evento de fora depois da data (A06·4b, #190, #192): "Fui!", "Não
deu" e o "Desfazer" do "Não deu".

As rotas rodam com uma sessão falsa. Os dados são fictícios.
"""

from unittest.mock import AsyncMock

import pytest
from httpx2 import Response

from app.auth.utils import create_access_token
from app.main import app
from app.modules.girl_file.models import DismissReason, FileEntry, FileStatus
from app.modules.girls.models import EffortBand
from tests.helpers import chamar_rota
from tests.test_discover_routes import curado, menina
from tests.test_events_routes import (
    ACAO,
    EVENTO,
    HOJE,
    da_oficina,
    dia,
    do_hackathon,
    hackathon,
    hoje_fixo,  # noqa: F401 (fixture: o dia de hoje fixo)
    oficina,
    sessao_do_evento,
)

# Um evento de fora que acabou ontem, com o prazo bem antes.
PASSOU = {"starts_on": dia(-3), "ends_on": dia(-1), "registration_deadline": dia(-10)}


async def chamar(
    sessao_falsa: AsyncMock, metodo: str, acao: str, item: str = EVENTO
) -> Response:
    return await chamar_rota(
        app,
        metodo,
        f"/api/events/{item}/{acao}",
        sessao_falsa,
        token=create_access_token(1),
    )


# --- PUT /api/events/{id}/went: "Fui!" ----------------------------------------


async def test_fui_conclui_o_evento_com_o_dia_de_hoje() -> None:
    achados = do_hackathon(FileStatus.SIGNED_UP, **PASSOU)
    sessao_falsa = sessao_do_evento(menina(), achados)

    response = await chamar(sessao_falsa, "PUT", "went")

    assert response.status_code == 200
    assert response.json()["status"] == "concluded"
    entry = achados[0]
    assert isinstance(entry, FileEntry)
    assert entry.status is FileStatus.CONCLUDED
    assert entry.concluded_on == HOJE
    sessao_falsa.commit.assert_awaited_once()


async def test_no_ultimo_dia_do_evento_ainda_nao_pergunta() -> None:
    # O evento acaba no fim do último dia, no fuso de Maceió.
    achados = do_hackathon(
        FileStatus.SIGNED_UP,
        starts_on=dia(-1),
        ends_on=HOJE,
        registration_deadline=dia(-10),
    )
    sessao_falsa = sessao_do_evento(menina(), achados)

    response = await chamar(sessao_falsa, "PUT", "went")

    assert response.status_code == 409
    assert response.json() == {"error": "event_not_asked"}
    sessao_falsa.commit.assert_not_called()


async def test_antes_da_data_responde_409() -> None:
    sessao_falsa = sessao_do_evento(menina(), do_hackathon(FileStatus.SIGNED_UP))

    response = await chamar(sessao_falsa, "PUT", "went")

    assert response.status_code == 409
    assert response.json() == {"error": "event_not_asked"}


async def test_evento_de_grupo_da_nise_nao_pergunta() -> None:
    # Quem conclui é a presença que a coordenadora registra (#194).
    achados = da_oficina(FileStatus.SIGNED_UP, starts_on=dia(-2), ends_on=dia(-2))
    sessao_falsa = sessao_do_evento(menina(), achados)

    response = await chamar(sessao_falsa, "PUT", "went", ACAO)

    assert response.status_code == 409
    assert response.json() == {"error": "event_not_asked"}
    entry = achados[0]
    assert isinstance(entry, FileEntry)
    assert entry.status is FileStatus.SIGNED_UP
    sessao_falsa.commit.assert_not_called()


async def test_evento_que_nao_esta_inscrita_nao_pergunta() -> None:
    sessao_falsa = sessao_do_evento(menina(), do_hackathon(FileStatus.NEXT, **PASSOU))

    response = await chamar(sessao_falsa, "PUT", "went")

    assert response.status_code == 409
    assert response.json() == {"error": "event_not_asked"}
    sessao_falsa.commit.assert_not_called()


async def test_fui_repetido_vale_sem_mudar_o_dia() -> None:
    # Clique duplo: o segundo pedido acha o evento já concluído.
    achados = do_hackathon(FileStatus.CONCLUDED, **PASSOU)
    entry = achados[0]
    assert isinstance(entry, FileEntry)
    entry.concluded_on = dia(-1)
    sessao_falsa = sessao_do_evento(menina(), achados)

    response = await chamar(sessao_falsa, "PUT", "went")

    assert response.status_code == 200
    assert response.json()["status"] == "concluded"
    assert entry.concluded_on == dia(-1)
    sessao_falsa.commit.assert_not_called()


async def test_fui_no_evento_de_outra_menina_responde_404() -> None:
    sessao_falsa = sessao_do_evento(menina(), [None])

    response = await chamar(sessao_falsa, "PUT", "went")

    assert response.status_code == 404
    sessao_falsa.commit.assert_not_called()


# --- PUT /api/events/{id}/did-not-go: "Não deu" -------------------------------


def linha(status: FileStatus, motivo: DismissReason | None = None) -> FileEntry:
    return FileEntry(
        id=40, girl_id=3, curated_item_id=12, status=status, dismiss_reason=motivo
    )


async def test_nao_deu_tira_o_evento_do_file() -> None:
    inscrita = linha(FileStatus.SIGNED_UP)
    sessao_falsa = sessao_do_evento(menina(), [inscrita, hackathon(**PASSOU), "Maceió"])

    response = await chamar(sessao_falsa, "PUT", "did-not-go")

    assert response.status_code == 204
    # Sai do filé, e a linha fica para o "Desfazer" saber que ela estava inscrita.
    assert inscrita.status is FileStatus.DID_NOT_GO
    sessao_falsa.commit.assert_awaited_once()


async def test_nao_deu_repetido_vale() -> None:
    # Clique duplo: o segundo pedido acha o evento já fora do filé.
    saiu = linha(FileStatus.DID_NOT_GO)
    sessao_falsa = sessao_do_evento(menina(), [saiu, hackathon(**PASSOU), "Maceió"])

    response = await chamar(sessao_falsa, "PUT", "did-not-go")

    assert response.status_code == 204
    sessao_falsa.commit.assert_not_called()


async def test_nao_deu_antes_da_data_responde_409() -> None:
    inscrita = linha(FileStatus.SIGNED_UP)
    sessao_falsa = sessao_do_evento(menina(), [inscrita, hackathon(), "Maceió"])

    response = await chamar(sessao_falsa, "PUT", "did-not-go")

    assert response.status_code == 409
    assert response.json() == {"error": "event_not_asked"}
    assert inscrita.status is FileStatus.SIGNED_UP


async def test_nao_deu_num_evento_de_grupo_da_nise_responde_409() -> None:
    inscrita = FileEntry(id=41, girl_id=3, action_id=7, status=FileStatus.SIGNED_UP)
    acao = oficina(starts_on=dia(-2), ends_on=dia(-2))
    sessao_falsa = sessao_do_evento(menina(), [inscrita, acao, "Rendeiras", "Maceió"])

    response = await chamar(sessao_falsa, "PUT", "did-not-go", ACAO)

    assert response.status_code == 409
    assert response.json() == {"error": "event_not_asked"}
    assert inscrita.status is FileStatus.SIGNED_UP


async def test_nao_deu_numa_atividade_responde_404() -> None:
    # Uma atividade do filé não é um evento.
    atividade = linha(FileStatus.NEXT)
    sessao_falsa = sessao_do_evento(
        menina(), [atividade, curado(12, EffortBand.UMA_TARDE)]
    )

    response = await chamar(sessao_falsa, "PUT", "did-not-go")

    assert response.status_code == 404
    assert response.json() == {"error": "item_not_found"}
    assert atividade.status is FileStatus.NEXT


@pytest.mark.parametrize("status", [FileStatus.NEXT, FileStatus.CONCLUDED])
async def test_nao_deu_num_evento_que_nao_esta_inscrita_responde_409(
    status: FileStatus,
) -> None:
    escolha = linha(status)
    sessao_falsa = sessao_do_evento(menina(), [escolha, hackathon(**PASSOU), "Maceió"])

    response = await chamar(sessao_falsa, "PUT", "did-not-go")

    assert response.status_code == 409
    assert escolha.status is status
    sessao_falsa.commit.assert_not_called()


@pytest.mark.parametrize("motivo", [None, DismissReason.SEM_TEMPO_AGORA])
async def test_nao_deu_num_evento_dispensado_responde_404(
    motivo: DismissReason | None,
) -> None:
    # Um "Não é pra mim", com motivo ou sem, nunca esteve no filé.
    dispensado = linha(FileStatus.DISMISSED, motivo)
    sessao_falsa = sessao_do_evento(
        menina(), [dispensado, hackathon(**PASSOU), "Maceió"]
    )

    response = await chamar(sessao_falsa, "PUT", "did-not-go")

    assert response.status_code == 404
    assert dispensado.status is FileStatus.DISMISSED
    sessao_falsa.commit.assert_not_called()


async def test_nao_deu_no_evento_de_outra_menina_responde_404() -> None:
    sessao_falsa = sessao_do_evento(menina(), [None])

    response = await chamar(sessao_falsa, "PUT", "did-not-go")

    assert response.status_code == 404
    assert response.json() == {"error": "item_not_found"}
    sessao_falsa.commit.assert_not_called()


# --- DELETE /api/events/{id}/did-not-go: o "Desfazer" do "Não deu" ------------


async def test_desfazer_traz_o_evento_de_volta_inscrita() -> None:
    saiu = linha(FileStatus.DID_NOT_GO)
    sessao_falsa = sessao_do_evento(menina(), [saiu, hackathon(**PASSOU), "Maceió"])

    response = await chamar(sessao_falsa, "DELETE", "did-not-go")

    assert response.status_code == 200
    assert response.json()["status"] == "in_progress"
    assert response.json()["afterEvent"] is True
    assert saiu.status is FileStatus.SIGNED_UP
    sessao_falsa.commit.assert_awaited_once()


async def test_desfazer_de_novo_da_o_mesmo_resultado() -> None:
    ja_voltou = linha(FileStatus.SIGNED_UP)
    sessao_falsa = sessao_do_evento(
        menina(), [ja_voltou, hackathon(**PASSOU), "Maceió"]
    )

    response = await chamar(sessao_falsa, "DELETE", "did-not-go")

    assert response.status_code == 200
    assert response.json()["status"] == "in_progress"
    sessao_falsa.commit.assert_not_called()


async def test_desfazer_sem_ter_o_evento_responde_404() -> None:
    # Ela nunca escolheu o evento: o "Desfazer" não põe nada no filé dela.
    sessao_falsa = sessao_do_evento(menina(), [None])

    response = await chamar(sessao_falsa, "DELETE", "did-not-go")

    assert response.status_code == 404
    assert response.json() == {"error": "item_not_found"}
    sessao_falsa.commit.assert_not_called()


@pytest.mark.parametrize("motivo", [None, DismissReason.MUITO_DIFICIL])
async def test_desfazer_um_nao_e_pra_mim_responde_404(
    motivo: DismissReason | None,
) -> None:
    # Um "Não é pra mim", com motivo ou sem, não vira inscrita: só o "Não deu".
    dispensado = linha(FileStatus.DISMISSED, motivo)
    sessao_falsa = sessao_do_evento(
        menina(), [dispensado, hackathon(**PASSOU), "Maceió"]
    )

    response = await chamar(sessao_falsa, "DELETE", "did-not-go")

    assert response.status_code == 404
    assert dispensado.status is FileStatus.DISMISSED
    sessao_falsa.commit.assert_not_called()


async def test_desfazer_um_evento_no_ver_depois_responde_404() -> None:
    guardado = linha(FileStatus.LATER)
    sessao_falsa = sessao_do_evento(menina(), [guardado, hackathon(**PASSOU), "Maceió"])

    response = await chamar(sessao_falsa, "DELETE", "did-not-go")

    assert response.status_code == 404
    assert response.json() == {"error": "item_not_found"}


@pytest.mark.parametrize("status", [FileStatus.NEXT, FileStatus.CONCLUDED])
async def test_desfazer_quando_ela_tem_outra_escolha_responde_409(
    status: FileStatus,
) -> None:
    escolha = linha(status)
    sessao_falsa = sessao_do_evento(menina(), [escolha, hackathon(**PASSOU), "Maceió"])

    response = await chamar(sessao_falsa, "DELETE", "did-not-go")

    assert response.status_code == 409
    assert escolha.status is status
    sessao_falsa.commit.assert_not_called()


async def test_desfazer_um_nao_deu_de_evento_adiado_volta_inscrita() -> None:
    # A curadoria adiou o evento depois do "Não deu": a linha não fica presa
    # fora do filé, volta inscrita e espera a data nova.
    saiu = linha(FileStatus.DID_NOT_GO)
    sessao_falsa = sessao_do_evento(menina(), [saiu, hackathon(), "Maceió"])

    response = await chamar(sessao_falsa, "DELETE", "did-not-go")

    assert response.status_code == 200
    assert response.json()["afterEvent"] is False
    assert saiu.status is FileStatus.SIGNED_UP


async def test_desfazer_um_nao_deu_de_evento_adiado_e_cancelado_responde_409() -> None:
    # Adiado e depois cancelado: não vai acontecer, e de volta ao filé ficaria
    # inscrita para sempre, sem "Você foi?".
    saiu = linha(FileStatus.DID_NOT_GO)
    sessao_falsa = sessao_do_evento(menina(), [saiu, hackathon(active=False), "Maceió"])

    response = await chamar(sessao_falsa, "DELETE", "did-not-go")

    assert response.status_code == 409
    assert response.json() == {"error": "event_not_asked"}
    assert saiu.status is FileStatus.DID_NOT_GO
    sessao_falsa.commit.assert_not_called()


async def test_desfazer_num_evento_de_grupo_da_nise_responde_409() -> None:
    saiu = FileEntry(id=41, girl_id=3, action_id=7, status=FileStatus.DID_NOT_GO)
    acao = oficina(starts_on=dia(-2), ends_on=dia(-2))
    sessao_falsa = sessao_do_evento(menina(), [saiu, acao, "Rendeiras", "Maceió"])

    response = await chamar(sessao_falsa, "DELETE", "did-not-go", ACAO)

    assert response.status_code == 409
    assert saiu.status is FileStatus.DID_NOT_GO


async def test_desfazer_numa_atividade_responde_404() -> None:
    sessao_falsa = sessao_do_evento(
        menina(), [linha(FileStatus.NEXT), curado(12, EffortBand.UMA_TARDE)]
    )

    response = await chamar(sessao_falsa, "DELETE", "did-not-go")

    assert response.status_code == 404
    assert response.json() == {"error": "item_not_found"}


# --- Evento cancelado, ação fora do filé e desfazer repetido ------------------


async def test_fui_num_evento_desativado_depois_de_acontecer_vale() -> None:
    # Depois do último dia, desativar só tira o evento das sugestões
    # (scripts/carregar_curadoria.py): ele aconteceu e ainda pergunta.
    achados = do_hackathon(FileStatus.SIGNED_UP, active=False, **PASSOU)
    sessao_falsa = sessao_do_evento(menina(), achados)

    response = await chamar(sessao_falsa, "PUT", "went")

    assert response.status_code == 200
    assert achados[0].status is FileStatus.CONCLUDED  # type: ignore[union-attr]


async def test_nao_deu_num_evento_desativado_depois_de_acontecer_vale() -> None:
    inscrita = linha(FileStatus.SIGNED_UP)
    sessao_falsa = sessao_do_evento(
        menina(), [inscrita, hackathon(active=False, **PASSOU), "Maceió"]
    )

    response = await chamar(sessao_falsa, "PUT", "did-not-go")

    assert response.status_code == 204
    assert inscrita.status is FileStatus.DID_NOT_GO


@pytest.mark.parametrize("metodo", ["PUT", "DELETE"])
async def test_acao_de_grupo_fora_do_file_responde_404(metodo: str) -> None:
    # No Ver depois, a ação não está no filé: 404, como o evento de fora.
    depois = FileEntry(id=41, girl_id=3, action_id=7, status=FileStatus.LATER)
    sessao_falsa = sessao_do_evento(menina(), [depois])

    response = await chamar(sessao_falsa, metodo, "did-not-go", ACAO)

    assert response.status_code == 404
    assert response.json() == {"error": "item_not_found"}
    assert depois.status is FileStatus.LATER
    sessao_falsa.commit.assert_not_called()


async def test_desfazer_de_novo_num_evento_adiado_da_o_mesmo_resultado() -> None:
    # O primeiro "Desfazer" já trouxe o evento adiado de volta; o segundo não falha.
    inscrita = linha(FileStatus.SIGNED_UP)
    sessao_falsa = sessao_do_evento(menina(), [inscrita, hackathon(), "Maceió"])

    response = await chamar(sessao_falsa, "DELETE", "did-not-go")

    assert response.status_code == 200
    assert response.json()["status"] == "in_progress"
    assert inscrita.status is FileStatus.SIGNED_UP
    sessao_falsa.commit.assert_not_called()


async def test_fui_repetido_vale_mesmo_se_a_curadoria_mexeu_no_evento() -> None:
    # O "Fui!" foi gravado; antes da nova tentativa, a curadoria desativou o
    # evento. A conclusão continua valendo.
    achados = do_hackathon(FileStatus.CONCLUDED, active=False, **PASSOU)
    sessao_falsa = sessao_do_evento(menina(), achados)

    response = await chamar(sessao_falsa, "PUT", "went")

    assert response.status_code == 200
    assert response.json()["status"] == "concluded"
    sessao_falsa.commit.assert_not_called()
