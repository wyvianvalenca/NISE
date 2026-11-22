"""O envio do lembrete "Me lembra um dia antes" (#188, RF-F4.12, RNF-F4.01).

Como os testes do e-mail do indício (#275), estes não conectam no Postgres nem
num servidor SMTP. A "tabela" é uma lista de linhas na memória, com um
`reminders_due` falso que acha as linhas como a busca de verdade acha (evento
amanhã, ainda não enviado para essa data) e trava a tabela até o commit, como
o `FOR UPDATE` faz. A busca em SQL é conferida em test_events_reminder.py.
Nomes e endereços são fictícios.
"""

import asyncio
import logging
import smtplib
from dataclasses import dataclass
from datetime import date, timedelta
from unittest.mock import AsyncMock, MagicMock

import httpx2
import pytest

from app.config import settings
from app.core.email import EmailNotConfiguredError
from app.db.engine import get_session
from app.main import app
from app.modules.admissions import cron
from app.modules.events import reminder_email as sending
from app.modules.events.reminder_email import (
    SendResult,
    event_url,
    send_event_reminders,
)
from app.modules.events.service import DueReminder
from app.modules.girl_file.models import FileEntry, FileStatus
from app.modules.girls.models import Girl
from app.users.models import Role, User
from tests.helpers import sql_do_postgres

HOJE = date(2026, 12, 1)
AMANHA = HOJE + timedelta(days=1)


@dataclass
class Linha:
    """Uma inscrita com o lembrete ligado, e o evento como está agora."""

    entry: FileEntry
    girl: Girl
    user: User
    title: str
    starts_on: date


def linha(
    numero: int = 1,
    nome: str = "Alana",
    starts_on: date = AMANHA,
    reminder: bool = True,
    status: FileStatus = FileStatus.SIGNED_UP,
) -> Linha:
    user = User(
        id=numero,
        email=f"menina{numero}@example.com",
        name=f"{nome} Ficticia",
        role=Role.GIRL,
    )
    girl = Girl(id=numero, name=f"{nome} Ficticia", user_id=numero, email=user.email)
    entry = FileEntry(
        id=numero,
        girl_id=numero,
        curated_item_id=12,
        status=status,
        reminder=reminder,
    )
    return Linha(entry, girl, user, "Hackathon ficticio", starts_on)


class Tabela:
    """O filé na memória: acha os lembretes do dia e trava até o commit."""

    def __init__(self, *linhas: Linha) -> None:
        self.linhas = list(linhas)
        self.trava = asyncio.Lock()
        self.session = AsyncMock()
        self.session.commit.side_effect = self._commit
        self.session.execute.side_effect = self._execute

    def _commit(self) -> None:
        if self.trava.locked():
            self.trava.release()

    def _execute(self, comando: object) -> None:
        # O UPDATE que desfaz a marca: aplica na linha certa.
        params = comando.compile().params  # type: ignore[attr-defined]
        for item in self.linhas:
            if item.entry.id == params["id_1"]:
                item.entry.reminder_sent_for = params["reminder_sent_for"]

    async def devidos(self, session: object, today: date) -> list[DueReminder]:
        await self.trava.acquire()
        amanha = today + timedelta(days=1)
        achados = [
            DueReminder(i.entry, i.girl, i.user, "curadoria-12", i.title, i.starts_on)
            for i in self.linhas
            if i.entry.status is FileStatus.SIGNED_UP
            and i.entry.reminder
            and i.starts_on == amanha
            and i.entry.reminder_sent_for != amanha
        ]
        # Dá a vez às outras rodadas: sem a trava, todas achariam a mesma linha.
        await asyncio.sleep(0)
        return achados


class Conexao:
    """Imita app.core.email.SmtpConnection: guarda o que foi enviado."""

    def __init__(self, erros: list[Exception | None] | None = None) -> None:
        self.send = MagicMock(side_effect=erros)
        self.close = MagicMock()


def preparar(
    monkeypatch: pytest.MonkeyPatch, *linhas: Linha
) -> tuple[Tabela, MagicMock, Conexao]:
    tabela = Tabela(*linhas)
    monkeypatch.setattr(sending, "reminders_due", tabela.devidos)
    return tabela, *_conexao_falsa(None)


def _conexao_falsa(erros: list[Exception | None] | None) -> tuple[MagicMock, Conexao]:
    conexao = Conexao(erros)
    return MagicMock(return_value=conexao), conexao


def enviados(conexao: Conexao) -> list[tuple[str, str, str]]:
    return [call.args for call in conexao.send.call_args_list]


# --- Quem recebe e o que recebe -----------------------------------------------


async def test_evento_amanha_envia_o_lembrete_com_nome_data_e_link(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    tabela, conectar, conexao = preparar(monkeypatch, linha())

    resultado = await send_event_reminders(tabela.session, HOJE, conectar)

    assert resultado == SendResult(sent=1, dropped=0, stopped=False)
    [(endereco, assunto, texto)] = enviados(conexao)
    assert endereco == "menina1@example.com"
    assert assunto == "Amanhã tem Hackathon ficticio!"
    assert "Oi, Alana!" in texto
    assert "amanhã, 2 de dezembro, tem Hackathon ficticio" in texto
    assert "http://localhost:3000/file/evento/curadoria-12" in texto
    conexao.close.assert_called_once()


async def test_o_link_usa_a_url_do_app(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "app_url", "https://nise.exemplo.com/")

    assert event_url("acao-7") == "https://nise.exemplo.com/file/evento/acao-7"


async def test_evento_que_nao_e_amanha_nao_envia_nem_conecta(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    hoje = linha(1, starts_on=HOJE)
    em_dois_dias = linha(2, starts_on=HOJE + timedelta(days=2))
    tabela, conectar, conexao = preparar(monkeypatch, hoje, em_dois_dias)

    resultado = await send_event_reminders(tabela.session, HOJE, conectar)

    assert resultado == SendResult(sent=0, dropped=0, stopped=False)
    conectar.assert_not_called()
    conexao.send.assert_not_called()


async def test_cada_menina_recebe_so_o_lembrete_do_proprio_evento(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    alana = linha(1, "Alana")
    bia = linha(2, "Bia")
    bia.title = "Oficina da Bia"
    sem_lembrete = linha(3, "Carla", reminder=False)
    nao_inscrita = linha(4, "Dani", status=FileStatus.NEXT)
    tabela, conectar, conexao = preparar(
        monkeypatch, alana, bia, sem_lembrete, nao_inscrita
    )

    resultado = await send_event_reminders(tabela.session, HOJE, conectar)

    assert resultado.sent == 2
    por_endereco = {a: (s, t) for a, s, t in enviados(conexao)}
    assert set(por_endereco) == {"menina1@example.com", "menina2@example.com"}
    assert "Oi, Alana!" in por_endereco["menina1@example.com"][1]
    assert "Bia" not in por_endereco["menina1@example.com"][1]
    assert por_endereco["menina2@example.com"][0] == "Amanhã tem Oficina da Bia!"
    # Quem desligou o lembrete ou saiu da inscrição não tem marca nem e-mail.
    assert sem_lembrete.entry.reminder_sent_for is None
    assert nao_inscrita.entry.reminder_sent_for is None


async def test_sem_a_escolha_na_linha_o_lembrete_nao_sai(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # A busca já filtra, mas o envio passa por can_send_email (RN-30) com a
    # escolha da linha: se ela desligou entre a busca e o envio, nada sai.
    desligada = linha()
    tabela, conectar, conexao = preparar(monkeypatch, desligada)

    async def devidos(session: object, today: date) -> list[DueReminder]:
        achados = await Tabela.devidos(tabela, session, today)
        desligada.entry.reminder = False
        return achados

    monkeypatch.setattr(sending, "reminders_due", devidos)

    resultado = await send_event_reminders(tabela.session, HOJE, conectar)

    assert resultado == SendResult(sent=0, dropped=0, stopped=False)
    conexao.send.assert_not_called()
    assert desligada.entry.reminder_sent_for is None


# --- Data mudada pelo grupo ---------------------------------------------------


async def test_evento_que_mudou_de_dia_manda_outro_lembrete_com_a_data_nova(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    item = linha(starts_on=AMANHA)
    tabela, conectar, conexao = preparar(monkeypatch, item)

    await send_event_reminders(tabela.session, HOJE, conectar)
    assert item.entry.reminder_sent_for == AMANHA

    # O grupo muda o evento para 3 dias depois: a marca de antes não vale.
    item.starts_on = AMANHA + timedelta(days=3)
    dia_da_vespera = HOJE + timedelta(days=3)
    segundo = await send_event_reminders(tabela.session, dia_da_vespera, conectar)

    assert segundo.sent == 1
    assert len(enviados(conexao)) == 2
    # O texto usa a data do evento no momento do envio, não a de antes.
    assert "amanhã, 5 de dezembro, tem" in enviados(conexao)[1][2]
    assert item.entry.reminder_sent_for == AMANHA + timedelta(days=3)


async def test_na_vespera_da_data_antiga_nao_sai_nada(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    item = linha(starts_on=HOJE + timedelta(days=4))
    tabela, conectar, conexao = preparar(monkeypatch, item)

    # Ela ligou o lembrete quando o evento era amanhã, mas ele mudou de dia.
    item.entry.reminder_sent_for = AMANHA
    resultado = await send_event_reminders(tabela.session, HOJE, conectar)

    assert resultado.sent == 0
    conexao.send.assert_not_called()


# --- Uma vez só, mesmo rodando várias vezes ------------------------------------


async def test_marca_e_grava_antes_de_enviar(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    item = linha()
    tabela, conectar, conexao = preparar(monkeypatch, item)
    visto: list[tuple[date | None, int]] = []

    def enviar(*_: object) -> None:
        # Quando o e-mail sai, a marca já foi gravada (RNF-F4.01).
        visto.append((item.entry.reminder_sent_for, tabela.session.commit.await_count))

    conexao.send.side_effect = enviar

    await send_event_reminders(tabela.session, HOJE, conectar)

    assert visto == [(AMANHA, 1)]


async def test_rodar_tres_vezes_envia_um_e_mail_so(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    tabela, conectar, conexao = preparar(monkeypatch, linha())

    resultados = [
        await send_event_reminders(tabela.session, HOJE, conectar) for _ in range(3)
    ]

    assert [r.sent for r in resultados] == [1, 0, 0]
    assert len(enviados(conexao)) == 1


async def test_tres_rodadas_ao_mesmo_tempo_enviam_um_e_mail_so(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    tabela, conectar, conexao = preparar(monkeypatch, linha(1), linha(2, "Bia"))

    # Uma sessão por rodada, mas a tabela (e a trava) é uma só, como o banco.
    sessoes = [AsyncMock() for _ in range(3)]
    for sessao in sessoes:
        sessao.commit.side_effect = tabela._commit
        sessao.execute.side_effect = tabela._execute
    resultados = await asyncio.gather(
        *(send_event_reminders(sessao, HOJE, conectar) for sessao in sessoes)
    )

    assert sorted(r.sent for r in resultados) == [0, 0, 2]
    assert sorted(a for a, _, _ in enviados(conexao)) == [
        "menina1@example.com",
        "menina2@example.com",
    ]


# --- Falha de envio -----------------------------------------------------------


@pytest.mark.parametrize(
    "erro",
    [
        EmailNotConfiguredError(),
        smtplib.SMTPAuthenticationError(535, b"senha errada"),
        ConnectionRefusedError(),
    ],
    ids=["sem-conta", "login", "rede"],
)
async def test_sem_conseguir_conectar_nada_sai_e_a_marca_volta(
    monkeypatch: pytest.MonkeyPatch, erro: Exception
) -> None:
    item = linha()
    tabela, _, _ = preparar(monkeypatch, item)
    conectar = MagicMock(side_effect=erro)

    resultado = await send_event_reminders(tabela.session, HOJE, conectar)

    assert resultado == SendResult(sent=0, dropped=0, stopped=True)
    # Ela não perde o lembrete: a rodada pode ser repetida no mesmo dia.
    assert item.entry.reminder_sent_for is None
    depois = await send_event_reminders(tabela.session, HOJE, _conexao_falsa(None)[0])
    assert depois.sent == 1


@pytest.mark.parametrize(
    "erro",
    [
        smtplib.SMTPDataError(452, b"quota de envio do Gmail"),
        smtplib.SMTPRecipientsRefused({"x@example.com": (450, b"busy")}),
        smtplib.SMTPException("outro erro do servidor"),
    ],
    ids=["cota", "destinatario-450", "generico"],
)
async def test_erro_do_servidor_para_e_devolve_os_que_nao_sairam(
    monkeypatch: pytest.MonkeyPatch, erro: Exception
) -> None:
    primeira, segunda = linha(1), linha(2, "Bia")
    tabela, _, _ = preparar(monkeypatch, primeira, segunda)
    conectar, conexao = _conexao_falsa([erro])

    resultado = await send_event_reminders(tabela.session, HOJE, conectar)

    assert resultado == SendResult(sent=0, dropped=0, stopped=True)
    assert len(enviados(conexao)) == 1
    assert primeira.entry.reminder_sent_for is None
    assert segunda.entry.reminder_sent_for is None
    conexao.close.assert_called_once()


@pytest.mark.parametrize(
    "erro",
    [smtplib.SMTPServerDisconnected("caiu"), TimeoutError()],
    ids=["desconectou", "timeout"],
)
async def test_conexao_que_cai_no_envio_nao_repete_o_que_pode_ter_saido(
    monkeypatch: pytest.MonkeyPatch, erro: Exception
) -> None:
    primeira, segunda = linha(1), linha(2, "Bia")
    tabela, _, _ = preparar(monkeypatch, primeira, segunda)
    conectar, _ = _conexao_falsa([erro])

    resultado = await send_event_reminders(tabela.session, HOJE, conectar)

    assert resultado == SendResult(sent=0, dropped=0, stopped=True)
    # O servidor pode ter aceitado: na dúvida, não reenvia (RNF-F4.01). Só a
    # que nem foi tentada volta.
    assert primeira.entry.reminder_sent_for == AMANHA
    assert segunda.entry.reminder_sent_for is None


async def test_endereco_recusado_de_vez_nao_trava_as_outras(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    primeira, segunda = linha(1), linha(2, "Bia")
    tabela, _, _ = preparar(monkeypatch, primeira, segunda)
    conectar, conexao = _conexao_falsa([ValueError("endereço inválido"), None])

    resultado = await send_event_reminders(tabela.session, HOJE, conectar)

    assert resultado == SendResult(sent=1, dropped=1, stopped=False)
    assert len(enviados(conexao)) == 2
    # Repetir não adiantaria: a marca fica.
    assert primeira.entry.reminder_sent_for == AMANHA


async def test_desfazer_a_marca_e_um_update_so_da_linha(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    item = linha()
    tabela, _, _ = preparar(monkeypatch, item)

    await send_event_reminders(
        tabela.session, HOJE, MagicMock(side_effect=EmailNotConfiguredError())
    )

    comando = tabela.session.execute.await_args.args[0]
    assert "UPDATE file_entries SET reminder_sent_for" in sql_do_postgres(comando)
    assert tabela.session.commit.await_count == 2


async def test_logs_do_envio_nao_tem_nome_nem_endereco(
    monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    tabela, _, _ = preparar(monkeypatch, linha())
    erro = smtplib.SMTPDataError(452, b"quota de menina1@example.com")
    conectar, _ = _conexao_falsa([erro])

    with caplog.at_level(logging.DEBUG):
        await send_event_reminders(tabela.session, HOJE, conectar)

    registro = caplog.text
    assert "SMTPDataError" in registro
    assert "menina1@example.com" not in registro
    assert "Alana" not in registro


# --- Rota agendada ------------------------------------------------------------


async def _cron(cabecalho: str | None) -> httpx2.Response:
    async def sessao() -> object:
        yield AsyncMock()

    app.dependency_overrides[get_session] = sessao
    try:
        async with httpx2.AsyncClient(
            transport=httpx2.ASGITransport(app=app), base_url="http://teste"
        ) as client:
            headers = {"Authorization": cabecalho} if cabecalho else {}
            return await client.get("/api/cron/event-reminders", headers=headers)
    finally:
        app.dependency_overrides.clear()


@pytest.fixture
def segredo(monkeypatch: pytest.MonkeyPatch) -> str:
    monkeypatch.setattr(settings, "cron_secret", "segredo-de-teste")
    return "segredo-de-teste"


@pytest.mark.parametrize("cabecalho", [None, "Bearer errado", "segredo-de-teste"])
async def test_sem_o_segredo_a_rota_recusa(
    segredo: str, cabecalho: str | None, monkeypatch: pytest.MonkeyPatch
) -> None:
    enviar = AsyncMock()
    monkeypatch.setattr(cron, "send_event_reminders", enviar)

    resposta = await _cron(cabecalho)

    assert resposta.status_code == 401
    enviar.assert_not_awaited()


async def test_sem_segredo_configurado_a_rota_recusa_tudo(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "cron_secret", "")
    enviar = AsyncMock()
    monkeypatch.setattr(cron, "send_event_reminders", enviar)

    resposta = await _cron("Bearer ")

    assert resposta.status_code == 401
    enviar.assert_not_awaited()


async def test_rota_responde_so_contagens(
    segredo: str, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(
        cron,
        "send_event_reminders",
        AsyncMock(return_value=SendResult(sent=2, dropped=1, stopped=False)),
    )

    resposta = await _cron(f"Bearer {segredo}")

    assert resposta.status_code == 200
    assert resposta.json() == {"sent": 2, "dropped": 1}


async def test_envio_que_para_responde_502(
    segredo: str, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(
        cron,
        "send_event_reminders",
        AsyncMock(return_value=SendResult(sent=0, dropped=0, stopped=True)),
    )

    resposta = await _cron(f"Bearer {segredo}")

    assert resposta.status_code == 502


def test_a_rota_agendada_fica_fora_do_openapi() -> None:
    assert "/api/cron/event-reminders" not in app.openapi()["paths"]
