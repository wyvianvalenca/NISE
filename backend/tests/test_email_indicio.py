"""O e-mail que avisa do indício (#275, RF-F31.11, RNF-F4.01).

Como os outros testes do back, estes não conectam no Postgres nem num servidor
SMTP: a sessão é falsa e o envio é um mock. Nomes e endereços são fictícios.
"""

import logging
import smtplib
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, MagicMock

import httpx2
import pytest
from sqlalchemy import UniqueConstraint

from app.config import settings
from app.core.email import (
    EmailNotConfiguredError,
    SmtpConnection,
    build_message,
    send_email,
)
from app.db.base import Base
from app.db.engine import engine
from app.main import app
from app.modules.admissions import cron, match_email
from app.modules.admissions.copeve import TARGET_COURSES
from app.modules.admissions.match_email import (
    BODY,
    SUBJECT,
    TIME_BUDGET_SECONDS,
    SendResult,
    match_email_body,
    send_match_emails,
)
from app.modules.admissions.models import (
    CourseLevel,
    ListMatch,
    MatchEmail,
    OfficialList,
)
from app.modules.admissions.service import create_match
from app.users.models import Role, User

AGORA = datetime(2026, 11, 18, 12, 0, tzinfo=UTC)
LISTA = OfficialList(
    id=7, institution="UFAL", selection_process="Sisu 2027", call="1ª chamada"
)
CURSO = "Ciência da Computação"
NOME = "Alana Fictícia de Teste"
ENDERECO = "alana.ficticia@example.com"


def _usuaria(aceitou: bool, id: int = 1) -> User:
    return User(
        id=id, email=ENDERECO, name=NOME, role=Role.GIRL, opportunity_emails=aceitou
    )


def _indicio(**campos: object) -> ListMatch:
    valores: dict[str, object] = {
        "id": 11,
        "girl_id": 3,
        "official_list_id": 7,
        "course": CURSO,
        "level": CourseLevel.GRADUACAO,
        "expires_at": AGORA + timedelta(days=20),
        "answered_at": None,
    }
    valores.update(campos)
    return ListMatch(**valores)


# --- Fila: quando o indício é criado -------------------------------------------


def _sessao_criacao(usuaria: User | None) -> AsyncMock:
    sessao_falsa = AsyncMock()
    # 1º scalar: a checagem "já existe?"; 2º: a conta da menina.
    sessao_falsa.scalar.side_effect = [False, usuaria]
    sessao_falsa.add = MagicMock()
    return sessao_falsa


async def test_quem_aceitou_entra_na_fila_ao_criar_o_indicio() -> None:
    sessao_falsa = _sessao_criacao(_usuaria(aceitou=True))

    indicio = await create_match(
        sessao_falsa, 3, LISTA, CURSO, CourseLevel.GRADUACAO, AGORA
    )

    adicionados = [c.args[0] for c in sessao_falsa.add.call_args_list]
    assert adicionados[0] is indicio
    [email] = [obj for obj in adicionados if isinstance(obj, MatchEmail)]
    assert email.list_match is indicio
    assert email.sent_at is None


async def test_quem_nao_aceitou_nao_entra_na_fila_e_o_indicio_fica() -> None:
    sessao_falsa = _sessao_criacao(_usuaria(aceitou=False))

    indicio = await create_match(
        sessao_falsa, 3, LISTA, CURSO, CourseLevel.GRADUACAO, AGORA
    )

    # O indício é criado do mesmo jeito: ela vê o item na agenda (#266).
    assert indicio is not None
    sessao_falsa.add.assert_called_once_with(indicio)


async def test_a_conta_e_achada_pela_menina_do_indicio() -> None:
    sessao_falsa = _sessao_criacao(None)

    await create_match(sessao_falsa, 3, LISTA, CURSO, CourseLevel.GRADUACAO, AGORA)

    statement = sessao_falsa.scalar.call_args_list[1].args[0]
    sql = str(statement.compile(compile_kwargs={"literal_binds": True}))
    assert "FROM users JOIN girls ON girls.user_id = users.id" in sql
    assert "girls.id = 3" in sql


async def test_mesma_chamada_de_novo_nao_cria_outro_e_mail() -> None:
    # A busca rodando de novo: o indício já existe e nada entra na fila.
    sessao_falsa = AsyncMock()
    sessao_falsa.scalar.return_value = True
    sessao_falsa.add = MagicMock()

    indicio = await create_match(
        sessao_falsa, 3, LISTA, CURSO, CourseLevel.GRADUACAO, AGORA
    )

    assert indicio is None
    sessao_falsa.add.assert_not_called()


def test_restricao_unica_garante_um_e_mail_por_indicio() -> None:
    tabela = Base.metadata.tables["match_emails"]

    unicas = {
        tuple(coluna.name for coluna in restricao.columns)
        for restricao in tabela.constraints
        if isinstance(restricao, UniqueConstraint)
    }

    assert ("list_match_id",) in unicas
    # Nada de endereço, nome ou texto guardado.
    assert set(tabela.columns.keys()) == {
        "id",
        "created_at",
        "list_match_id",
        "sent_at",
        "dropped_at",
    }
    [chave] = tabela.foreign_keys
    assert chave.ondelete == "CASCADE"


# --- Envio ---------------------------------------------------------------------


class _Conexao:
    """Imita app.core.email.SmtpConnection: guarda o que foi enviado."""

    def __init__(self, erros: list[Exception | None] | None = None) -> None:
        self.send = MagicMock(side_effect=erros)
        self.close = MagicMock()


def _conectar(conexao: _Conexao) -> MagicMock:
    return MagicMock(return_value=conexao)


def _sessao_envio(
    fila: list[tuple[MatchEmail | None, ListMatch | None, User | None]],
) -> AsyncMock:
    """Uma sessão em que cada e-mail da fila traz o indício e a conta relidos."""
    sessao_falsa = AsyncMock()
    sessao_falsa.scalars.return_value = MagicMock(
        all=MagicMock(return_value=[i for i, _ in enumerate(fila, start=1)])
    )
    escalares: list[object] = []
    indicios: list[object] = []
    for email, indicio, usuaria in fila:
        escalares.append(email)
        if email is None:
            continue
        indicios.append(indicio)
        if indicio is not None:
            escalares.append(usuaria)
    sessao_falsa.scalar.side_effect = escalares
    sessao_falsa.get.side_effect = indicios
    return sessao_falsa


def _dois_na_fila() -> tuple[MatchEmail, MatchEmail, AsyncMock]:
    primeiro = MatchEmail(id=1, list_match_id=11)
    segundo = MatchEmail(id=2, list_match_id=12)
    sessao_falsa = _sessao_envio(
        [
            (primeiro, _indicio(), _usuaria(aceitou=True)),
            (segundo, _indicio(id=12, girl_id=4), _usuaria(aceitou=True, id=2)),
        ]
    )
    return primeiro, segundo, sessao_falsa


async def test_envia_um_e_mail_e_marca_como_enviado() -> None:
    email = MatchEmail(id=1, list_match_id=11)
    sessao_falsa = _sessao_envio([(email, _indicio(), _usuaria(aceitou=True))])
    conexao = _Conexao()

    resultado = await send_match_emails(sessao_falsa, _conectar(conexao), AGORA)

    assert resultado == SendResult(sent=1, dropped=0, stopped=False)
    conexao.send.assert_called_once_with(ENDERECO, SUBJECT, match_email_body())
    assert email.sent_at == AGORA
    conexao.close.assert_called_once()


async def test_marca_como_enviado_antes_de_enviar() -> None:
    # Revisão do #287: se a hospedagem cortar a rotina depois do envio, a
    # próxima não reenvia. No máximo uma vez (RNF-F4.01).
    email = MatchEmail(id=1, list_match_id=11)
    sessao_falsa = _sessao_envio([(email, _indicio(), _usuaria(aceitou=True))])
    no_envio: list[object] = []
    conexao = _Conexao()
    conexao.send.side_effect = lambda *_: no_envio.append(
        (email.sent_at, sessao_falsa.commit.await_count)
    )

    await send_match_emails(sessao_falsa, _conectar(conexao), AGORA)

    assert no_envio == [(AGORA, 1)]


async def test_uma_conexao_so_para_o_lote() -> None:
    _, _, sessao_falsa = _dois_na_fila()
    conexao = _Conexao()
    conectar = _conectar(conexao)

    resultado = await send_match_emails(sessao_falsa, conectar, AGORA)

    assert resultado == SendResult(sent=2, dropped=0, stopped=False)
    conectar.assert_called_once()
    assert conexao.send.call_count == 2
    conexao.close.assert_called_once()


async def test_fila_vazia_nem_conecta() -> None:
    sessao_falsa = _sessao_envio([])
    conectar = MagicMock()

    resultado = await send_match_emails(sessao_falsa, conectar, AGORA)

    assert resultado == SendResult(sent=0, dropped=0, stopped=False)
    conectar.assert_not_called()


async def test_trava_cada_e_mail_pendente_antes_de_enviar() -> None:
    email = MatchEmail(id=1, list_match_id=11)
    sessao_falsa = _sessao_envio([(email, _indicio(), _usuaria(aceitou=True))])

    await send_match_emails(sessao_falsa, _conectar(_Conexao()), AGORA)

    trava = sessao_falsa.scalar.call_args_list[0].args[0]
    sql = str(
        trava.compile(dialect=engine.dialect, compile_kwargs={"literal_binds": True})
    )
    assert "match_emails.sent_at IS NULL" in sql
    assert "match_emails.dropped_at IS NULL" in sql
    assert "FOR UPDATE SKIP LOCKED" in sql
    # O indício é relido do banco, não do que estava na memória.
    assert sessao_falsa.get.call_args.kwargs == {"populate_existing": True}


async def test_rotina_rodando_duas_vezes_envia_um_so() -> None:
    email = MatchEmail(id=1, list_match_id=11)
    conexao = _Conexao()

    await send_match_emails(
        _sessao_envio([(email, _indicio(), _usuaria(aceitou=True))]),
        _conectar(conexao),
        AGORA,
    )
    # Na segunda vez, a trava já não acha o e-mail pendente (foi enviado, ou
    # outra rotina está com ele). A concorrência de verdade, com duas sessões
    # no Postgres, foi conferida à mão (veja a descrição do PR).
    segunda = await send_match_emails(
        _sessao_envio([(None, None, None)]), _conectar(conexao), AGORA
    )

    assert segunda == SendResult(sent=0, dropped=0, stopped=False)
    conexao.send.assert_called_once()


async def test_indicio_apagado_antes_do_envio_nao_envia() -> None:
    email = MatchEmail(id=1, list_match_id=11)
    sessao_falsa = _sessao_envio([(email, None, None)])
    conexao = _Conexao()

    resultado = await send_match_emails(sessao_falsa, _conectar(conexao), AGORA)

    assert resultado == SendResult(sent=0, dropped=1, stopped=False)
    conexao.send.assert_not_called()
    assert email.dropped_at == AGORA
    assert email.sent_at is None


@pytest.mark.parametrize(
    "indicio",
    [
        _indicio(answered_at=AGORA - timedelta(hours=1)),
        _indicio(expires_at=AGORA - timedelta(minutes=1)),
    ],
    ids=["respondido", "vencido"],
)
async def test_indicio_respondido_ou_vencido_nao_envia(indicio: ListMatch) -> None:
    email = MatchEmail(id=1, list_match_id=11)
    conexao = _Conexao()

    resultado = await send_match_emails(
        _sessao_envio([(email, indicio, _usuaria(aceitou=True))]),
        _conectar(conexao),
        AGORA,
    )

    assert resultado.dropped == 1
    conexao.send.assert_not_called()


async def test_preferencia_desligada_antes_do_envio_nao_envia() -> None:
    # A checagem é a única do app (can_send_email, RN-30).
    email = MatchEmail(id=1, list_match_id=11)
    conexao = _Conexao()

    resultado = await send_match_emails(
        _sessao_envio([(email, _indicio(), _usuaria(aceitou=False))]),
        _conectar(conexao),
        AGORA,
    )

    assert resultado.dropped == 1
    conexao.send.assert_not_called()


async def test_conta_apagada_antes_do_envio_nao_envia() -> None:
    email = MatchEmail(id=1, list_match_id=11)
    conexao = _Conexao()

    resultado = await send_match_emails(
        _sessao_envio([(email, _indicio(), None)]), _conectar(conexao), AGORA
    )

    assert resultado.dropped == 1
    conexao.send.assert_not_called()


async def test_dois_indicios_da_mesma_menina_mandam_um_e_mail_so() -> None:
    primeiro = MatchEmail(id=1, list_match_id=11)
    segundo = MatchEmail(id=2, list_match_id=12)
    sessao_falsa = _sessao_envio(
        [
            (primeiro, _indicio(), _usuaria(aceitou=True)),
            (segundo, _indicio(id=12), _usuaria(aceitou=True)),
        ]
    )
    conexao = _Conexao()

    resultado = await send_match_emails(sessao_falsa, _conectar(conexao), AGORA)

    assert resultado == SendResult(sent=1, dropped=1, stopped=False)
    conexao.send.assert_called_once()
    assert segundo.dropped_at == AGORA


@pytest.mark.parametrize(
    "erro",
    [
        EmailNotConfiguredError(),
        smtplib.SMTPConnectError(421, b"ocupado"),
        smtplib.SMTPNotSupportedError("STARTTLS extension not supported by server."),
        smtplib.SMTPNotSupportedError("SMTP AUTH extension not supported by server."),
        smtplib.SMTPException("No suitable authentication method found."),
        smtplib.SMTPAuthenticationError(535, b"senha errada"),
        ConnectionRefusedError("porta errada"),
        TimeoutError("sem resposta"),
    ],
    ids=[
        "sem-configuracao",
        "conexao",
        "sem-starttls",
        "sem-auth",
        "sem-metodo-de-login",
        "login",
        "porta-errada",
        "timeout",
    ],
)
async def test_erro_ao_conectar_para_sem_tocar_na_fila(erro: Exception) -> None:
    # Revisão do #287: com a porta errada ou sem STARTTLS, todo e-mail falhava
    # e era descartado para sempre. Agora isso para a rotina antes do 1º.
    primeiro, segundo, sessao_falsa = _dois_na_fila()
    conectar = MagicMock(side_effect=erro)

    resultado = await send_match_emails(sessao_falsa, conectar, AGORA)

    assert resultado == SendResult(sent=0, dropped=0, stopped=True)
    for email in (primeiro, segundo):
        assert email.sent_at is None and email.dropped_at is None
    sessao_falsa.scalar.assert_not_awaited()
    sessao_falsa.commit.assert_not_awaited()


@pytest.mark.parametrize(
    "erro",
    [
        smtplib.SMTPRecipientsRefused({ENDERECO: (450, b"mailbox busy")}),
        smtplib.SMTPRecipientsRefused({ENDERECO: (421, b"try again later")}),
        smtplib.SMTPDataError(452, b"quota de envio do Gmail"),
        smtplib.SMTPDataError(421, b"try again later"),
        smtplib.SMTPSenderRefused(550, b"remetente", "equipe@example.com"),
        smtplib.SMTPException("outro erro do servidor"),
    ],
    ids=[
        "destinatario-450",
        "destinatario-421",
        "cota-452",
        "dados-421",
        "remetente",
        "generico",
    ],
)
async def test_erro_temporario_ou_da_conta_para_e_devolve_a_fila(
    erro: Exception,
) -> None:
    primeiro, segundo, sessao_falsa = _dois_na_fila()
    conexao = _Conexao([erro, None])

    resultado = await send_match_emails(sessao_falsa, _conectar(conexao), AGORA)

    assert resultado == SendResult(sent=0, dropped=0, stopped=True)
    conexao.send.assert_called_once()
    # A marca de enviado foi desfeita: vai de novo na próxima.
    assert primeiro.sent_at is None and primeiro.dropped_at is None
    assert segundo.sent_at is None and segundo.dropped_at is None
    conexao.close.assert_called_once()


@pytest.mark.parametrize(
    "erro",
    [
        smtplib.SMTPRecipientsRefused({ENDERECO: (550, b"no such user")}),
        smtplib.SMTPDataError(554, b"message rejected"),
        smtplib.SMTPNotSupportedError("SMTPUTF8 not supported by server"),
        ValueError("Header values may not contain linefeed or carriage return"),
        UnicodeEncodeError("ascii", "á", 0, 1, "fora do ascii"),
        RuntimeError("qualquer outro erro do e-mail"),
    ],
    ids=[
        "destinatario-550",
        "dados-554",
        "smtputf8",
        "endereco-invalido",
        "unicode",
        "outro",
    ],
)
async def test_erro_de_um_e_mail_so_descarta_e_segue(erro: Exception) -> None:
    # Sem descartar, ele ficaria primeiro na fila e travaria todas as rodadas.
    primeiro, segundo, sessao_falsa = _dois_na_fila()
    conexao = _Conexao([erro, None])

    resultado = await send_match_emails(sessao_falsa, _conectar(conexao), AGORA)

    assert resultado == SendResult(sent=1, dropped=1, stopped=False)
    assert conexao.send.call_count == 2
    assert primeiro.dropped_at == AGORA and primeiro.sent_at is None
    assert segundo.sent_at == AGORA


@pytest.mark.parametrize(
    "erro",
    [smtplib.SMTPServerDisconnected("caiu"), OSError("rede fora")],
    ids=["desconectado", "rede"],
)
async def test_conexao_que_cai_no_envio_para_e_nao_reenvia(erro: Exception) -> None:
    # O servidor pode ter aceitado antes de cair: na dúvida, não reenvia.
    primeiro, segundo, sessao_falsa = _dois_na_fila()
    conexao = _Conexao([erro, None])

    resultado = await send_match_emails(sessao_falsa, _conectar(conexao), AGORA)

    assert resultado == SendResult(sent=0, dropped=0, stopped=True)
    conexao.send.assert_called_once()
    assert primeiro.sent_at == AGORA
    assert segundo.sent_at is None and segundo.dropped_at is None


async def test_erro_no_quit_nao_muda_o_resultado() -> None:
    email = MatchEmail(id=1, list_match_id=11)
    sessao_falsa = _sessao_envio([(email, _indicio(), _usuaria(aceitou=True))])
    conexao = _Conexao()
    conexao.close.side_effect = smtplib.SMTPResponseException(500, b"bye")

    resultado = await send_match_emails(sessao_falsa, _conectar(conexao), AGORA)

    assert resultado == SendResult(sent=1, dropped=0, stopped=False)
    assert email.sent_at == AGORA and email.dropped_at is None


async def test_para_quando_passa_do_tempo_e_deixa_o_resto() -> None:
    primeiro, segundo, sessao_falsa = _dois_na_fila()
    conexao = _Conexao()
    # Começa em 0; depois do 1º e-mail o relógio já passou do limite.
    tempos = iter([0.0, 0.0, TIME_BUDGET_SECONDS + 1])

    resultado = await send_match_emails(
        sessao_falsa, _conectar(conexao), AGORA, clock=lambda: next(tempos)
    )

    assert resultado == SendResult(sent=1, dropped=0, stopped=False)
    assert primeiro.sent_at == AGORA
    assert segundo.sent_at is None and segundo.dropped_at is None
    conexao.close.assert_called_once()


# --- Texto e logs --------------------------------------------------------------


def test_texto_nao_cita_lista_curso_nem_instituicao() -> None:
    texto = (SUBJECT + "\n" + match_email_body()).lower()

    proibidos = [
        LISTA.institution,
        LISTA.selection_process,
        LISTA.call,
        "IFAL",
        "COPEVE",
        "Sisu",
        "chamada",
        "curso",
        *TARGET_COURSES.values(),
    ]
    for palavra in proibidos:
        assert palavra.lower() not in texto, palavra
    assert "lista de aprovados" in texto


def test_texto_leva_a_agenda_do_app(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "app_url", "https://nise.example.com/")

    assert "https://nise.example.com/agenda\n" in match_email_body()
    assert "{agenda_url}" in BODY


async def test_logs_do_envio_nao_tem_nome_nem_endereco(
    caplog: pytest.LogCaptureFixture,
) -> None:
    falha = smtplib.SMTPRecipientsRefused({ENDERECO: (550, NOME.encode())})
    endereco_invalido = ValueError(f"linha quebrada em {ENDERECO}")
    with caplog.at_level(logging.DEBUG):
        await send_match_emails(
            _sessao_envio(
                [(MatchEmail(id=1, list_match_id=11), _indicio(), _usuaria(True))]
            ),
            _conectar(_Conexao()),
            AGORA,
        )
        for erro in (falha, endereco_invalido):
            await send_match_emails(
                _sessao_envio(
                    [(MatchEmail(id=2, list_match_id=12), _indicio(), _usuaria(True))]
                ),
                _conectar(_Conexao([erro])),
                AGORA,
            )
        await send_match_emails(
            _sessao_envio(
                [(MatchEmail(id=3, list_match_id=13), _indicio(), _usuaria(True))]
            ),
            MagicMock(side_effect=smtplib.SMTPAuthenticationError(535, ENDERECO)),
            AGORA,
        )

    assert "1 enviados" in caplog.text
    assert "SMTPRecipientsRefused" in caplog.text
    assert "ValueError" in caplog.text
    assert "SMTPAuthenticationError" in caplog.text
    for dado in (NOME, ENDERECO, "alana"):
        assert dado.lower() not in caplog.text.lower()


# --- Envio por SMTP (app/core/email.py) ----------------------------------------


def test_sem_conta_configurada_o_envio_fica_desligado(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "smtp_user", "")
    monkeypatch.setattr(settings, "smtp_password", "")
    smtp = MagicMock()
    monkeypatch.setattr("smtplib.SMTP", smtp)

    with pytest.raises(EmailNotConfiguredError):
        send_email(ENDERECO, "Assunto", "Corpo")
    smtp.assert_not_called()


def test_envia_pelo_gmail_com_starttls_e_senha_de_app(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "smtp_host", "smtp.gmail.com")
    monkeypatch.setattr(settings, "smtp_port", 587)
    monkeypatch.setattr(settings, "smtp_user", "equipe.ficticia@example.com")
    monkeypatch.setattr(settings, "smtp_password", "senha-de-app-ficticia")
    monkeypatch.setattr(settings, "email_from", "")
    smtp = MagicMock()
    monkeypatch.setattr("smtplib.SMTP", smtp)

    send_email(ENDERECO, "Assunto", "Corpo")

    smtp.assert_called_once_with("smtp.gmail.com", 587, timeout=30)
    conexao = smtp.return_value
    conexao.starttls.assert_called_once()
    conexao.login.assert_called_once_with(
        "equipe.ficticia@example.com", "senha-de-app-ficticia"
    )
    mensagem = conexao.send_message.call_args.args[0]
    assert mensagem["To"] == ENDERECO
    assert mensagem["From"] == "equipe.ficticia@example.com"
    assert mensagem.get_content().strip() == "Corpo"


def _smtp_configurado(monkeypatch: pytest.MonkeyPatch) -> MagicMock:
    monkeypatch.setattr(settings, "smtp_user", "equipe.ficticia@example.com")
    monkeypatch.setattr(settings, "smtp_password", "senha-de-app-ficticia")
    smtp = MagicMock()
    monkeypatch.setattr("smtplib.SMTP", smtp)
    return smtp


def test_conexao_faz_starttls_e_login_uma_vez_para_varios_e_mails(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    smtp = _smtp_configurado(monkeypatch)
    servidor = smtp.return_value

    with SmtpConnection() as conexao:
        conexao.send(ENDERECO, "Assunto", "Corpo")
        conexao.send("outra.ficticia@example.com", "Assunto", "Corpo")

    smtp.assert_called_once()
    servidor.starttls.assert_called_once()
    servidor.login.assert_called_once()
    assert servidor.send_message.call_count == 2
    servidor.quit.assert_called_once()
    servidor.close.assert_called_once()


def test_login_que_falha_fecha_a_conexao(monkeypatch: pytest.MonkeyPatch) -> None:
    smtp = _smtp_configurado(monkeypatch)
    servidor = smtp.return_value
    servidor.login.side_effect = smtplib.SMTPAuthenticationError(535, b"senha")

    with pytest.raises(smtplib.SMTPAuthenticationError):
        SmtpConnection()

    servidor.close.assert_called_once()
    servidor.send_message.assert_not_called()


def test_erro_no_quit_nao_e_erro_do_envio(monkeypatch: pytest.MonkeyPatch) -> None:
    smtp = _smtp_configurado(monkeypatch)
    smtp.return_value.quit.side_effect = smtplib.SMTPResponseException(500, b"x")

    send_email(ENDERECO, "Assunto", "Corpo")

    smtp.return_value.send_message.assert_called_once()
    smtp.return_value.close.assert_called_once()


@pytest.mark.parametrize(
    "endereco",
    ["alana.ficticia@example.com\r\nBcc: todo.mundo@example.com", "a@b.test\nX: y"],
)
def test_endereco_com_quebra_de_linha_e_recusado_antes_do_envio(
    endereco: str,
) -> None:
    with pytest.raises(ValueError):
        build_message(endereco, "Assunto", "Corpo")


# --- Rota agendada -------------------------------------------------------------


async def _cron(cabecalho: str | None) -> httpx2.Response:
    from app.db.engine import get_session

    async def sessao() -> object:
        yield AsyncMock()

    app.dependency_overrides[get_session] = sessao
    try:
        async with httpx2.AsyncClient(
            transport=httpx2.ASGITransport(app=app), base_url="http://teste"
        ) as client:
            headers = {"Authorization": cabecalho} if cabecalho else {}
            return await client.get("/api/cron/match-emails", headers=headers)
    finally:
        app.dependency_overrides.clear()


@pytest.fixture
def segredo(monkeypatch: pytest.MonkeyPatch) -> str:
    monkeypatch.setattr(settings, "cron_secret", "segredo-de-teste")
    monkeypatch.setattr(settings, "list_search_enabled", True)
    return "segredo-de-teste"


@pytest.mark.parametrize("cabecalho", [None, "Bearer errado"])
async def test_so_o_agendador_dispara_o_envio(
    segredo: str, cabecalho: str | None, monkeypatch: pytest.MonkeyPatch
) -> None:
    enviar = AsyncMock()
    monkeypatch.setattr(cron, "send_match_emails", enviar)

    resposta = await _cron(cabecalho)

    assert resposta.status_code == 401
    enviar.assert_not_awaited()


async def test_rota_responde_so_contagens(
    segredo: str, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(
        cron,
        "send_match_emails",
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
        "send_match_emails",
        AsyncMock(return_value=SendResult(sent=0, dropped=0, stopped=True)),
    )

    resposta = await _cron(f"Bearer {segredo}")

    assert resposta.status_code == 502


async def test_com_a_busca_desligada_nada_sai_da_fila(
    segredo: str, monkeypatch: pytest.MonkeyPatch
) -> None:
    # RN-20: desligar a busca também segura o que já estava na fila.
    monkeypatch.setattr(settings, "list_search_enabled", False)
    enviar = AsyncMock()
    monkeypatch.setattr(cron, "send_match_emails", enviar)

    resposta = await _cron(f"Bearer {segredo}")

    assert resposta.status_code == 409
    enviar.assert_not_awaited()


def test_nenhuma_rota_publica_devolve_o_e_mail() -> None:
    # A rota da fila fica fora do OpenAPI e só responde contagens; nenhuma
    # outra rota fala do e-mail do indício (RNF-F31.02).
    caminhos = app.openapi()["paths"]

    # Outras rotas falam de e-mail (cadastro, preferência), mas nenhuma do indício.
    assert not [c for c in caminhos if "email" in c.replace("-", "") and "match" in c]
    assert match_email.SUBJECT not in str(app.openapi())
