"""Marcar a inscrição num evento e desfazer (A09 e versão "Inscrita", #182, #184).

"Tirar do filé" é DELETE /api/file/{id} (#108); os testes dele, para o evento
próximo e o inscrita, estão em test_file_undo_routes.py.

As rotas rodam com uma sessão falsa. Os dados são fictícios.
"""

from collections.abc import Callable
from datetime import UTC, datetime
from unittest.mock import AsyncMock

import pytest
from httpx2 import Response

from app.auth.utils import create_access_token
from app.main import app
from app.modules.actions.models import Action
from app.modules.catalog.models import CuratedItem
from app.modules.events.service import EventPhase, FileEvent, event_phase
from app.modules.girl_file.models import FileEntry, FileStatus
from tests.helpers import chamar_rota, sql_do_postgres
from tests.test_discover_routes import menina
from tests.test_events_routes import (
    ACAO,
    EVENTO,
    HOJE,
    da_oficina,
    dia,
    do_hackathon,
    hackathon,
    hoje_fixo,  # noqa: F401 (fixture: o dia de hoje fixo)
    linha,
    oficina,
    sessao_do_evento,
)


async def marcar(sessao_falsa: AsyncMock, item: str = EVENTO) -> Response:
    return await chamar_rota(
        app,
        "PUT",
        f"/api/events/{item}/sign-up",
        sessao_falsa,
        token=create_access_token(1),
    )


async def desfazer(sessao_falsa: AsyncMock, item: str = EVENTO) -> Response:
    return await chamar_rota(
        app,
        "DELETE",
        f"/api/events/{item}/sign-up",
        sessao_falsa,
        token=create_access_token(1),
    )


# --- PUT /api/events/{id}/sign-up: "Sim, me inscrevi" e "Já me inscrevi" ------


async def test_marcar_passa_de_proxima_para_inscrita() -> None:
    achados = do_hackathon(FileStatus.NEXT)
    sessao_falsa = sessao_do_evento(menina(), achados)

    response = await marcar(sessao_falsa)

    assert response.status_code == 200
    assert response.json()["status"] == "in_progress"
    assert achados[0].status is FileStatus.SIGNED_UP  # type: ignore[union-attr]
    sessao_falsa.commit.assert_awaited_once()


async def test_marcar_duas_vezes_da_o_mesmo_resultado() -> None:
    achados = do_hackathon(FileStatus.SIGNED_UP)
    sessao_falsa = sessao_do_evento(menina(), achados)

    response = await marcar(sessao_falsa)

    assert response.status_code == 200
    assert response.json()["status"] == "in_progress"
    # Nada mudou, então nada é gravado.
    sessao_falsa.commit.assert_not_called()


async def test_o_prazo_nao_bloqueia_a_marca() -> None:
    # Ela se inscreveu no último minuto e só voltou depois do prazo.
    achados = do_hackathon(FileStatus.NEXT, registration_deadline=dia(-2))
    sessao_falsa = sessao_do_evento(menina(), achados)

    response = await marcar(sessao_falsa)

    assert response.status_code == 200
    assert response.json()["status"] == "in_progress"
    assert response.json()["registrationsOpen"] is False


async def test_marcar_num_evento_de_grupo_da_nise() -> None:
    achados = da_oficina(FileStatus.NEXT)
    sessao_falsa = sessao_do_evento(menina(), achados)

    response = await marcar(sessao_falsa, ACAO)

    assert response.status_code == 200
    assert response.json()["status"] == "in_progress"
    assert achados[0].status is FileStatus.SIGNED_UP  # type: ignore[union-attr]


async def test_marcar_num_evento_concluido_responde_409() -> None:
    achados = do_hackathon(FileStatus.CONCLUDED)
    sessao_falsa = sessao_do_evento(menina(), achados)

    response = await marcar(sessao_falsa)

    assert response.status_code == 409
    assert response.json() == {"error": "event_concluded"}
    assert achados[0].status is FileStatus.CONCLUDED  # type: ignore[union-attr]
    sessao_falsa.commit.assert_not_called()


async def test_marcar_depois_do_ultimo_dia_do_evento_responde_409() -> None:
    # Depois da data a tela pergunta "Você foi?" ou espera a presença.
    achados = do_hackathon(
        FileStatus.NEXT,
        starts_on=dia(-3),
        ends_on=dia(-1),
        registration_deadline=dia(-10),
    )
    sessao_falsa = sessao_do_evento(menina(), achados)

    response = await marcar(sessao_falsa)

    assert response.status_code == 409
    assert response.json() == {"error": "event_over"}
    sessao_falsa.commit.assert_not_called()


async def test_no_ultimo_dia_do_evento_ainda_da_para_marcar() -> None:
    achados = do_hackathon(
        FileStatus.NEXT, starts_on=dia(-1), ends_on=HOJE, registration_deadline=None
    )
    sessao_falsa = sessao_do_evento(menina(), achados)

    response = await marcar(sessao_falsa)

    assert response.status_code == 200


async def test_marcar_num_evento_cancelado_pela_curadoria_responde_409() -> None:
    achados = do_hackathon(FileStatus.NEXT, active=False)
    sessao_falsa = sessao_do_evento(menina(), achados)

    response = await marcar(sessao_falsa)

    assert response.status_code == 409
    assert response.json() == {"error": "event_cancelled"}
    sessao_falsa.commit.assert_not_called()


async def test_marcar_depois_que_a_coordenadora_concluiu_a_presenca() -> None:
    # Ação de dois dias: ela conclui a presença no primeiro dia, e a menina
    # tenta marcar no segundo. A marca ficaria esperando para sempre.
    achados = da_oficina(
        FileStatus.NEXT,
        starts_on=dia(-1),
        ends_on=HOJE,
        attendance_registered_at=datetime(2026, 11, 18, 15, tzinfo=UTC),
    )
    sessao_falsa = sessao_do_evento(menina(), achados)

    response = await marcar(sessao_falsa, ACAO)

    assert response.status_code == 409
    assert response.json() == {"error": "event_over"}
    sessao_falsa.commit.assert_not_called()


async def test_marcar_trava_a_linha_antes_de_decidir() -> None:
    sessao_falsa = sessao_do_evento(menina(), do_hackathon(FileStatus.NEXT))

    await marcar(sessao_falsa)

    # SELECT ... FOR UPDATE: um "Tirar do filé" ao mesmo tempo espera.
    busca_da_linha = sessao_falsa.scalar.await_args_list[2].args[0]
    assert "FOR UPDATE" in sql_do_postgres(busca_da_linha)


@pytest.mark.parametrize("status", [FileStatus.LATER, FileStatus.DISMISSED])
async def test_marcar_um_evento_fora_do_file_responde_404(status: FileStatus) -> None:
    sessao_falsa = sessao_do_evento(menina(), [linha(status)])

    response = await marcar(sessao_falsa)

    assert response.status_code == 404
    assert response.json() == {"error": "item_not_found"}
    sessao_falsa.commit.assert_not_called()


async def test_marcar_o_evento_de_outra_menina_responde_404() -> None:
    # A linha é buscada pelo id dela: a de outra menina nunca é achada (RNF-G.03).
    sessao_falsa = sessao_do_evento(menina(), [None])

    response = await marcar(sessao_falsa)

    assert response.status_code == 404
    busca_da_linha = sessao_falsa.scalar.await_args_list[2].args[0]
    assert busca_da_linha.compile().params["girl_id_1"] == 3
    sessao_falsa.commit.assert_not_called()


# --- DELETE /api/events/{id}/sign-up: o "Desfazer" do aviso -------------------


async def test_desfazer_volta_para_proxima() -> None:
    achados = do_hackathon(FileStatus.SIGNED_UP)
    sessao_falsa = sessao_do_evento(menina(), achados)

    response = await desfazer(sessao_falsa)

    assert response.status_code == 200
    assert response.json()["status"] == "next"
    assert achados[0].status is FileStatus.NEXT  # type: ignore[union-attr]
    sessao_falsa.commit.assert_awaited_once()


async def test_desfazer_duas_vezes_da_o_mesmo_resultado() -> None:
    sessao_falsa = sessao_do_evento(menina(), do_hackathon(FileStatus.NEXT))

    response = await desfazer(sessao_falsa)

    assert response.status_code == 200
    assert response.json()["status"] == "next"
    sessao_falsa.commit.assert_not_called()


async def test_desfazer_num_evento_concluido_responde_409() -> None:
    achados = do_hackathon(FileStatus.CONCLUDED)
    sessao_falsa = sessao_do_evento(menina(), achados)

    response = await desfazer(sessao_falsa)

    assert response.status_code == 409
    assert response.json() == {"error": "event_concluded"}
    assert achados[0].status is FileStatus.CONCLUDED  # type: ignore[union-attr]
    sessao_falsa.commit.assert_not_called()


async def test_desfazer_depois_do_ultimo_dia_do_evento_responde_409() -> None:
    # Depois da data, uma próxima não teria como andar: nem marcar, nem "Fui!".
    achados = do_hackathon(
        FileStatus.SIGNED_UP,
        starts_on=dia(-3),
        ends_on=dia(-1),
        registration_deadline=dia(-10),
    )
    sessao_falsa = sessao_do_evento(menina(), achados)

    response = await desfazer(sessao_falsa)

    assert response.status_code == 409
    assert response.json() == {"error": "event_over"}
    assert achados[0].status is FileStatus.SIGNED_UP  # type: ignore[union-attr]
    sessao_falsa.commit.assert_not_called()


async def test_desfazer_o_evento_de_outra_menina_responde_404() -> None:
    sessao_falsa = sessao_do_evento(menina(), [None])

    response = await desfazer(sessao_falsa)

    assert response.status_code == 404
    sessao_falsa.commit.assert_not_called()


# --- A fase do evento: a única regra de data e organização --------------------


def evento(item: object) -> FileEvent:
    return FileEvent(
        entry=FileEntry(id=40, girl_id=3, status=FileStatus.NEXT),
        curated=item if isinstance(item, CuratedItem) else None,
        action=item if isinstance(item, Action) else None,
        group=None,
        city=None,
        first_name="Alana",
    )


@pytest.mark.parametrize(
    ("item", "fase"),
    [
        (lambda: hackathon(), EventPhase.BEFORE),
        (lambda: hackathon(ends_on=HOJE, starts_on=HOJE), EventPhase.BEFORE),
        (
            lambda: hackathon(starts_on=dia(-3), ends_on=dia(-1)),
            EventPhase.ASKS_IF_WENT,
        ),
        (lambda: hackathon(active=False), EventPhase.CANCELLED),
        (
            # Depois do último dia, desativar só tira das sugestões.
            lambda: hackathon(active=False, starts_on=dia(-3), ends_on=dia(-1)),
            EventPhase.ASKS_IF_WENT,
        ),
        (lambda: oficina(), EventPhase.BEFORE),
        (
            lambda: oficina(starts_on=dia(-2), ends_on=dia(-2)),
            EventPhase.WAITING_ATTENDANCE,
        ),
        (
            # Ela concluiu a presença no primeiro dia de uma ação de dois dias.
            lambda: oficina(
                starts_on=HOJE,
                ends_on=dia(1),
                attendance_registered_at=datetime(2026, 11, 19, 15, tzinfo=UTC),
            ),
            EventPhase.ATTENDANCE_CONCLUDED,
        ),
    ],
    ids=[
        "de-fora-antes",
        "de-fora-no-ultimo-dia",
        "de-fora-depois",
        "cancelado-antes",
        "desativado-depois-de-acontecer",
        "grupo-antes",
        "grupo-depois-sem-presenca",
        "grupo-presenca-concluida",
    ],
)
def test_fase_do_evento(item: Callable[[], object], fase: EventPhase) -> None:
    assert event_phase(evento(item()), HOJE) is fase
