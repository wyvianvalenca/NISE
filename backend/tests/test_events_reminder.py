""" "Me lembra um dia antes" (A06·4b inscrita, #186, #188): a escolha, o que a
desliga, quem lembrar hoje e o texto do e-mail.

As rotas rodam com uma sessão falsa. Os dados são fictícios.
"""

from datetime import date
from unittest.mock import AsyncMock, MagicMock

import pytest
from httpx2 import Response

from app.auth.utils import create_access_token
from app.main import app
from app.modules.events.service import (
    DueReminder,
    apply_attendance,
    mark_reminder_sent,
    reminder_email,
    reminders_due,
)
from app.modules.girl_file.models import FileEntry, FileStatus
from tests.helpers import chamar_rota, sql_do_postgres
from tests.test_consents_service import alana
from tests.test_discover_routes import menina
from tests.test_events_routes import (
    EVENTO,
    HOJE,
    dia,
    do_hackathon,
    hackathon,
    hoje_fixo,  # noqa: F401 (fixture: o dia de hoje fixo)
    sessao_do_evento,
)


async def lembrete(
    sessao_falsa: AsyncMock, corpo: dict[str, object], item: str = EVENTO
) -> Response:
    return await chamar_rota(
        app,
        "PUT",
        f"/api/events/{item}/reminder",
        sessao_falsa,
        token=create_access_token(1),
        corpo=corpo,
    )


def linha_de(achados: list[object | None]) -> FileEntry:
    entry = achados[0]
    assert isinstance(entry, FileEntry)
    return entry


# --- PUT /api/events/{id}/reminder --------------------------------------------


async def test_ligar_o_lembrete_de_um_evento_inscrita() -> None:
    achados = do_hackathon(FileStatus.SIGNED_UP)
    sessao_falsa = sessao_do_evento(menina(), achados)

    response = await lembrete(sessao_falsa, {"on": True})

    assert response.status_code == 200
    assert response.json()["reminder"] is True
    assert linha_de(achados).reminder is True
    sessao_falsa.commit.assert_awaited_once()


async def test_num_evento_cancelado_pela_curadoria_nao_da_para_ligar() -> None:
    # Um evento cancelado não é lembrado: ligar ficaria marcado sem e-mail.
    achados = do_hackathon(FileStatus.SIGNED_UP, active=False)
    sessao_falsa = sessao_do_evento(menina(), achados)

    response = await lembrete(sessao_falsa, {"on": True})

    assert response.status_code == 409
    assert response.json() == {"error": "reminder_not_available"}
    assert not linha_de(achados).reminder
    sessao_falsa.commit.assert_not_called()


async def test_num_evento_cancelado_ainda_da_para_desligar() -> None:
    achados = do_hackathon(FileStatus.SIGNED_UP, active=False)
    linha_de(achados).reminder = True
    sessao_falsa = sessao_do_evento(menina(), achados)

    response = await lembrete(sessao_falsa, {"on": False})

    assert response.status_code == 200
    assert linha_de(achados).reminder is False


async def test_desligar_o_lembrete() -> None:
    achados = do_hackathon(FileStatus.SIGNED_UP)
    linha_de(achados).reminder = True
    sessao_falsa = sessao_do_evento(menina(), achados)

    response = await lembrete(sessao_falsa, {"on": False})

    assert response.status_code == 200
    assert response.json()["reminder"] is False
    assert linha_de(achados).reminder is False


async def test_ligar_de_novo_nao_grava_nada() -> None:
    achados = do_hackathon(FileStatus.SIGNED_UP)
    linha_de(achados).reminder = True
    sessao_falsa = sessao_do_evento(menina(), achados)

    response = await lembrete(sessao_falsa, {"on": True})

    assert response.status_code == 200
    sessao_falsa.commit.assert_not_called()


async def test_com_o_evento_daqui_a_dois_dias_ainda_da_para_ligar() -> None:
    # A véspera é amanhã.
    achados = do_hackathon(FileStatus.SIGNED_UP, starts_on=dia(2), ends_on=dia(2))
    sessao_falsa = sessao_do_evento(menina(), achados)

    response = await lembrete(sessao_falsa, {"on": True})

    assert response.status_code == 200


@pytest.mark.parametrize("comeca", [0, 1])
async def test_com_a_vespera_hoje_ou_passada_nao_da_para_ligar(comeca: int) -> None:
    achados = do_hackathon(
        FileStatus.SIGNED_UP,
        starts_on=dia(comeca),
        ends_on=dia(comeca),
        registration_deadline=dia(-1),
    )
    sessao_falsa = sessao_do_evento(menina(), achados)

    response = await lembrete(sessao_falsa, {"on": True})

    assert response.status_code == 409
    assert response.json() == {"error": "reminder_not_available"}
    assert not linha_de(achados).reminder
    sessao_falsa.commit.assert_not_called()


async def test_desligar_vale_mesmo_com_a_vespera_passada() -> None:
    achados = do_hackathon(FileStatus.SIGNED_UP, starts_on=HOJE, ends_on=HOJE)
    linha_de(achados).reminder = True
    sessao_falsa = sessao_do_evento(menina(), achados)

    response = await lembrete(sessao_falsa, {"on": False})

    assert response.status_code == 200
    assert linha_de(achados).reminder is False


@pytest.mark.parametrize("status", [FileStatus.NEXT, FileStatus.CONCLUDED])
async def test_so_num_evento_inscrita(status: FileStatus) -> None:
    sessao_falsa = sessao_do_evento(menina(), do_hackathon(status))

    response = await lembrete(sessao_falsa, {"on": True})

    assert response.status_code == 409
    assert response.json() == {"error": "reminder_not_available"}
    sessao_falsa.commit.assert_not_called()


@pytest.mark.parametrize("status", [FileStatus.NEXT, FileStatus.CONCLUDED])
async def test_desligar_fora_da_inscricao_vale_sem_mudar_nada(
    status: FileStatus,
) -> None:
    # Outra aba desfez a inscrição antes: desligar dá o mesmo resultado.
    sessao_falsa = sessao_do_evento(menina(), do_hackathon(status))

    response = await lembrete(sessao_falsa, {"on": False})

    assert response.status_code == 200
    assert response.json()["reminder"] is False
    sessao_falsa.commit.assert_not_called()


@pytest.mark.parametrize("corpo", [{}, {"on": "true"}, {"on": 1}, {"on": True, "x": 1}])
async def test_corpo_invalido_responde_422(corpo: dict[str, object]) -> None:
    sessao_falsa = sessao_do_evento(menina(), do_hackathon(FileStatus.SIGNED_UP))

    response = await lembrete(sessao_falsa, corpo)

    assert response.status_code == 422


async def test_lembrete_do_evento_de_outra_menina_responde_404() -> None:
    sessao_falsa = sessao_do_evento(menina(), [None])

    response = await lembrete(sessao_falsa, {"on": True})

    assert response.status_code == 404
    sessao_falsa.commit.assert_not_called()


# --- O que desliga o lembrete -------------------------------------------------


async def test_desfazer_a_inscricao_desliga_o_lembrete() -> None:
    achados = do_hackathon(FileStatus.SIGNED_UP)
    linha_de(achados).reminder = True
    sessao_falsa = sessao_do_evento(menina(), achados)

    response = await chamar_rota(
        app,
        "DELETE",
        f"/api/events/{EVENTO}/sign-up",
        sessao_falsa,
        token=create_access_token(1),
    )

    assert response.json()["reminder"] is False
    assert linha_de(achados).reminder is False


async def test_nao_deu_desliga_o_lembrete() -> None:
    inscrita = FileEntry(
        id=40, girl_id=3, curated_item_id=12, status=FileStatus.SIGNED_UP, reminder=True
    )
    passou = hackathon(
        starts_on=dia(-3), ends_on=dia(-1), registration_deadline=dia(-10)
    )
    sessao_falsa = sessao_do_evento(menina(), [inscrita, passou, "Maceió"])

    response = await chamar_rota(
        app,
        "PUT",
        f"/api/events/{EVENTO}/did-not-go",
        sessao_falsa,
        token=create_access_token(1),
    )

    assert response.status_code == 204
    assert inscrita.reminder is False


async def test_fui_desliga_o_lembrete() -> None:
    achados = do_hackathon(
        FileStatus.SIGNED_UP,
        starts_on=dia(-3),
        ends_on=dia(-1),
        registration_deadline=dia(-10),
    )
    linha_de(achados).reminder = True
    sessao_falsa = sessao_do_evento(menina(), achados)

    response = await chamar_rota(
        app,
        "PUT",
        f"/api/events/{EVENTO}/went",
        sessao_falsa,
        token=create_access_token(1),
    )

    assert response.status_code == 200
    assert linha_de(achados).reminder is False


async def test_presenca_concluida_desliga_o_lembrete() -> None:
    inscrita = FileEntry(
        id=40, girl_id=3, action_id=7, status=FileStatus.SIGNED_UP, reminder=True
    )
    sessao_falsa = AsyncMock()
    sessao_falsa.scalar.return_value = 1
    sessao_falsa.scalars.side_effect = [[3], [inscrita]]

    assert await apply_attendance(sessao_falsa, 1, 7, [3], HOJE, concluding=True)

    assert inscrita.status is FileStatus.CONCLUDED
    assert inscrita.reminder is False


# --- Quem lembrar hoje --------------------------------------------------------


def resultado(linhas: list[tuple[object, ...]]) -> MagicMock:
    return MagicMock(__iter__=lambda _: iter(linhas))


async def test_quem_lembrar_hoje_tem_evento_amanha_nas_duas_fontes() -> None:
    curada = FileEntry(id=1, girl_id=3, curated_item_id=12, status=FileStatus.SIGNED_UP)
    da_acao = FileEntry(id=2, girl_id=3, action_id=7, status=FileStatus.SIGNED_UP)
    sessao_falsa = AsyncMock()
    sessao_falsa.execute.side_effect = [
        resultado([(curada, menina(), alana(), 12, "Hackathon ficticio")]),
        resultado([(da_acao, menina(), alana(), 7, "Oficina ficticia")]),
    ]

    devidos = await reminders_due(sessao_falsa, HOJE)

    assert [(d.item_id, d.title, d.starts_on) for d in devidos] == [
        ("curadoria-12", "Hackathon ficticio", dia(1)),
        ("acao-7", "Oficina ficticia", dia(1)),
    ]
    # A conta vem junto, para o envio passar por can_send_email (RN-30).
    assert all(d.user.id == 1 for d in devidos)
    consulta = sql_do_postgres(sessao_falsa.execute.await_args_list[0].args[0])
    # Inscrita, com o lembrete ligado, que ainda não saiu, e evento amanhã.
    assert "file_entries.status = %(status_1)s" in consulta
    assert "file_entries.reminder IS true" in consulta
    # O lembrete ainda não saiu para essa data do evento.
    assert "file_entries.reminder_sent_for IS DISTINCT FROM" in consulta
    assert "curated_items.starts_on = %(starts_on_1)s" in consulta
    # Um evento desativado pela curadoria (cancelado) não é lembrado.
    assert "curated_items.active IS true" in consulta
    # Nem um item vencido ou que deixou de ser evento.
    assert "curated_items.kind = %(kind_1)s" in consulta
    assert "curated_items.expires_on IS NULL OR curated_items.expires_on >=" in consulta
    # Duas rodadas ao mesmo tempo não mandam o mesmo lembrete duas vezes, e
    # uma linha travada não é pulada (seria um lembrete perdido).
    assert "FOR UPDATE OF file_entries" in consulta
    assert "SKIP LOCKED" not in consulta
    parametros = sessao_falsa.execute.await_args_list[0].args[0].compile().params
    assert parametros["starts_on_1"] == dia(1)


async def test_marcar_que_o_lembrete_saiu_guarda_a_data_do_evento() -> None:
    entry = FileEntry(id=1, girl_id=3, curated_item_id=12, status=FileStatus.SIGNED_UP)
    devido = DueReminder(entry, menina(), alana(), "curadoria-12", "Hackathon", dia(1))

    mark_reminder_sent(devido)

    # Se o evento mudar de dia, a data nova é outra e sai outro lembrete.
    assert entry.reminder_sent_for == dia(1)


# --- O texto do e-mail --------------------------------------------------------


def test_email_tem_o_evento_a_data_e_o_link_de_volta() -> None:
    entry = FileEntry(id=1, girl_id=3, curated_item_id=12, status=FileStatus.SIGNED_UP)
    devido = DueReminder(
        entry,
        menina(),
        alana(),
        "curadoria-12",
        "Hackathon ficticio",
        date(2026, 12, 1),
    )

    assunto, texto = reminder_email(
        devido, "https://nise.exemplo.com/file/evento/curadoria-12"
    )

    assert assunto == "Amanhã tem Hackathon ficticio!"
    assert "Oi, Alana!" in texto
    assert "amanhã, 1º de dezembro, tem Hackathon ficticio" in texto
    assert "https://nise.exemplo.com/file/evento/curadoria-12" in texto
    # Só o primeiro nome, e nada de e-mail nem outros dados dela.
    assert "Souza" not in texto
    assert "alana@exemplo.com" not in texto


def test_titulo_com_quebra_de_linha_fica_numa_linha_so_no_assunto() -> None:
    entry = FileEntry(id=1, girl_id=3, curated_item_id=12, status=FileStatus.SIGNED_UP)
    devido = DueReminder(
        entry, menina(), alana(), "curadoria-12", "Hack\nBcc: x", dia(1)
    )

    assunto, _ = reminder_email(devido, "https://exemplo.com")

    assert "\n" not in assunto
