"""Excluir minha conta e meus dados (RF-F7.09, #394).

Sem banco: a sessão é falsa e ignora o WHERE, então o filtro de dono é
conferido no SQL compilado. Os números dos painéis e "nada identificável
sobra" ficam em test_account_deletion_db.py, com o Postgres de verdade.
"""

import logging
import re
from datetime import UTC, date, datetime
from unittest.mock import AsyncMock

import pytest
from sqlalchemy import DateTime
from sqlalchemy.dialects import postgresql
from sqlalchemy.sql import ClauseElement

from app.auth.permissions import SESSION_COOKIE, SIGNED_IN_HINT_COOKIE
from app.auth.utils import create_access_token
from app.db.base import Base
from app.main import app
from app.modules.admissions.search import _girls_by_name
from app.modules.admissions.utils import short_name
from app.modules.girls.deletion import DeletionResult, delete_account
from app.modules.girls.models import ANONYMIZED_NAME
from app.users.models import Role, User
from tests.helpers import chamar_rota, sessao_com, sql_do_postgres

NOME = "Alana Ficticia"
EMAIL = "alana@exemplo.com"
WHATSAPP = "82 99999-0000"
NASCIMENTO = "2008-03-17"


def alana(user_id: int = 1) -> User:
    return User(
        id=user_id,
        email=EMAIL,
        name=NOME,
        password_hash="hash-ficticio",
        role=Role.GIRL,
        opportunity_emails=True,
        opportunity_emails_changed_at=datetime(2026, 11, 1, tzinfo=UTC),
    )


def alana_excluida() -> User:
    conta = alana()
    conta.deleted_at = datetime(2026, 11, 24, 12, 0, tzinfo=UTC)
    return conta


def sessao_da_exclusao(usuaria: User | None, girl_id: int | None = 7) -> AsyncMock:
    # Na ordem em que o serviço pergunta: a usuária (travada) e o id da menina.
    # Não há pergunta sobre os termos: a exclusão não depende do aceite.
    # Uma segunda chamada recebe a usuária de novo.
    sessao_falsa = AsyncMock()
    sessao_falsa.scalar.side_effect = [usuaria, girl_id, usuaria]
    return sessao_falsa


def sql_com_valores(consulta: ClauseElement) -> str:
    dialeto = postgresql.dialect()  # type: ignore[no-untyped-call]
    compilada = consulta.compile(
        dialect=dialeto, compile_kwargs={"literal_binds": True}
    )
    return " ".join(str(compilada).split())


def escritas(sessao_falsa: AsyncMock) -> list[str]:
    return [sql_com_valores(c.args[0]) for c in sessao_falsa.execute.call_args_list]


async def excluir(
    sessao_falsa: AsyncMock, user_id: int = 1
) -> "tuple[int, dict[str, str]]":
    response = await chamar_rota(
        app,
        "DELETE",
        "/api/profile",
        sessao_falsa,
        token=create_access_token(user_id),
    )
    cookies = {
        linha.split("=", 1)[0]: linha
        for linha in response.headers.get_list("set-cookie")
    }
    assert response.content == b""
    return response.status_code, cookies


# C5: a data do pedido fica em users.deleted_at, nula por padrão.
def test_users_tem_deleted_at_com_fuso_e_nulo_por_padrao() -> None:
    coluna = User.__table__.c.deleted_at

    assert isinstance(coluna.type, DateTime)
    assert coluna.type.timezone is True
    assert coluna.nullable is True
    assert User(email="a@b.com", name="x").deleted_at is None


# C3: o cookie antigo de uma conta excluída dá 401 em qualquer rota.
async def test_me_de_conta_excluida_responde_401() -> None:
    response = await chamar_rota(
        app,
        "GET",
        "/api/auth/me",
        sessao_com(alana_excluida()),
        token=create_access_token(1),
    )

    assert response.status_code == 401
    assert response.json() == {"detail": "Não autenticada"}


async def test_perfil_de_conta_excluida_responde_401() -> None:
    response = await chamar_rota(
        app,
        "GET",
        "/api/profile/details",
        sessao_com(alana_excluida()),
        token=create_access_token(1),
    )

    assert response.status_code == 401
    assert response.json() == {"detail": "Não autenticada"}


# C3: a usuária vira um registro sem nada que a identifique.
async def test_excluir_anonimiza_a_usuaria_e_grava_o_pedido() -> None:
    usuaria = alana()
    sessao_falsa = sessao_da_exclusao(usuaria)

    status, _ = await excluir(sessao_falsa)

    assert status == 204
    assert usuaria.name == "Registro anonimizado"
    assert usuaria.email == "conta-1@anonimizado.invalid"
    assert usuaria.password_hash is None
    assert usuaria.opportunity_emails is False
    assert usuaria.opportunity_emails_changed_at is None
    assert usuaria.deleted_at is not None
    assert usuaria.deleted_at.tzinfo is not None
    assert usuaria.role == Role.GIRL
    sessao_falsa.commit.assert_awaited_once()


# C3, C4: filtro de dono e valor de cada comando, no SQL que o banco receberia.
async def test_excluir_roda_os_17_comandos_nesta_ordem_com_o_id_da_menina() -> None:
    sessao_falsa = sessao_da_exclusao(alana())

    await excluir(sessao_falsa)

    sql = escritas(sessao_falsa)
    assert len(sql) == 17
    assert sql[0] == "DELETE FROM girl_topics WHERE girl_topics.girl_id = 7"
    assert sql[1] == (
        "DELETE FROM file_entries WHERE file_entries.girl_id = 7 AND "
        "(file_entries.status NOT IN ('NEXT', 'IN_PROGRESS', 'CONCLUDED', "
        "'SIGNED_UP'))"
    )
    assert sql[2] == "DELETE FROM invites WHERE invites.girl_id = 7"
    assert sql[3] == "DELETE FROM list_matches WHERE list_matches.girl_id = 7"
    assert sql[4] == "DELETE FROM dismissed_matches WHERE dismissed_matches.girl_id = 7"
    assert sql[5] == "DELETE FROM approvals WHERE approvals.girl_id = 7"
    assert re.fullmatch(
        r"DELETE FROM participations WHERE participations.girl_id = 7 AND "
        r"participations.action_id IN \(SELECT actions.id FROM actions "
        r"WHERE actions.starts_on > '\d{4}-\d{2}-\d{2}'\)",
        sql[6],
    )
    assert sql[7] == (
        "UPDATE participations SET name=NULL, whatsapp=NULL, study_stage=NULL, "
        "school_year=NULL WHERE participations.girl_id = 7"
    )
    assert sql[8] == "UPDATE answers SET comment=NULL WHERE answers.girl_id = 7"
    assert sql[9] == (
        "UPDATE followup_answers SET comment=NULL WHERE followup_answers.girl_id = 7"
    )
    assert sql[10] == (
        "UPDATE file_entries SET rating=NULL, similar_choice=NULL, reminder=false, "
        "reminder_sent_for=NULL, updated_at=now() WHERE file_entries.girl_id = 7"
    )
    assert sql[11] == (
        "UPDATE enrollments SET institution=NULL, official_list_id=NULL "
        "WHERE enrollments.girl_id = 7"
    )
    assert sql[12] == (
        "UPDATE enrollments SET course='Outro curso' WHERE enrollments.girl_id = 7 "
        "AND enrollments.origin = 'SELF_DECLARED' AND (enrollments.course NOT IN "
        "('Sistemas de Informação', 'Ciência da Computação', "
        "'Engenharia de Computação', 'Redes de computadores', 'Outro curso'))"
    )
    assert re.fullmatch(
        r"UPDATE attendance_emails SET dropped_at='[^']+' WHERE "
        r"attendance_emails.girl_id = 7 AND attendance_emails.sent_at IS NULL "
        r"AND attendance_emails.dropped_at IS NULL",
        sql[13],
    )
    assert sql[14] == (
        "UPDATE girls SET email='registro-7@anonimizado.invalid', "
        "name='Registro anonimizado', birth_date=NULL, city_ibge_code=NULL, "
        "study_stage=NULL, all_topics=false, file_intro_seen=false, "
        "last_band=NULL, updated_at=now() WHERE girls.id = 7"
    )
    assert sql[15] == "DELETE FROM oauth_accounts WHERE oauth_accounts.user_id = 1"
    assert sql[16] == (
        "DELETE FROM password_reset_tokens WHERE password_reset_tokens.user_id = 1"
    )


# C15: só as ações que ainda não começaram (começa depois de hoje) perdem a inscrição.
async def test_excluir_apaga_so_inscricao_em_acao_que_comeca_depois_de_hoje() -> None:
    sessao_falsa = sessao_da_exclusao(alana())

    await delete_account(sessao_falsa, 1, date(2026, 11, 24))

    apaga = sql_com_valores(sessao_falsa.execute.call_args_list[6].args[0])
    assert "actions.starts_on > '2026-11-24'" in apaga


# C15: a rota passa a data de hoje em Maceió ao serviço (e não outra data).
async def test_a_rota_usa_a_data_de_hoje_em_maceio_na_inscricao_futura(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        "app.modules.girls.routes.today_in_maceio", lambda: date(2026, 11, 24)
    )
    sessao_falsa = sessao_da_exclusao(alana())

    status, _ = await excluir(sessao_falsa)

    assert status == 204
    apaga = sql_com_valores(sessao_falsa.execute.call_args_list[6].args[0])
    assert "actions.starts_on > '2026-11-24'" in apaga


# C3, C4: o id da menina vem da sessão; com a usuária 2 (menina 8) tudo muda junto.
async def test_excluir_da_usuaria_2_usa_a_menina_8_e_o_usuario_2() -> None:
    sessao_falsa = sessao_da_exclusao(alana(2), girl_id=8)

    await excluir(sessao_falsa, user_id=2)

    sql = escritas(sessao_falsa)
    assert len(sql) == 17
    assert not any("= 7" in s or "-7@" in s for s in sql)
    assert sql[0] == "DELETE FROM girl_topics WHERE girl_topics.girl_id = 8"
    assert "registro-8@anonimizado.invalid" in sql[14]
    assert sql[14].endswith("WHERE girls.id = 8")
    assert sql[15].endswith("oauth_accounts.user_id = 2")
    assert sql[16].endswith("password_reset_tokens.user_id = 2")


async def test_excluir_acha_a_menina_pelo_user_id_da_sessao() -> None:
    sessao_falsa = sessao_da_exclusao(alana(), girl_id=7)

    await excluir(sessao_falsa)

    consultas = [sql_com_valores(c.args[0]) for c in sessao_falsa.scalar.call_args_list]
    assert consultas[1] == "SELECT girls.id FROM girls WHERE girls.user_id = 1"


# C3: nada some do que alimenta painel nem o aceite dos termos.
async def test_excluir_nao_apaga_girls_users_respostas_nem_aceites() -> None:
    sessao_falsa = sessao_da_exclusao(alana())

    await excluir(sessao_falsa)

    sql = " | ".join(escritas(sessao_falsa))
    for proibido in (
        "DELETE FROM girls",
        "DELETE FROM users",
        "DELETE FROM answers",
        "DELETE FROM followup_answers",
        "DELETE FROM enrollments",
        "DELETE FROM attendance_emails",
        "terms_acceptances",
        "UPDATE users",
    ):
        assert proibido not in sql


# C3: a sessão acaba neste navegador.
async def test_excluir_expira_os_cookies_da_sessao() -> None:
    _, cookies = await excluir(sessao_da_exclusao(alana()))

    for nome in (SESSION_COOKIE, SIGNED_IN_HINT_COOKIE):
        assert "Max-Age=0" in cookies[nome]
        assert "Path=/" in cookies[nome]
    assert "HttpOnly" in cookies[SESSION_COOKIE]


# C7: a segunda chamada também é 204 e não grava nada.
async def test_excluir_duas_vezes_anonimiza_uma_so() -> None:
    usuaria = alana()
    sessao_falsa = sessao_da_exclusao(usuaria)

    primeira, cookies1 = await excluir(sessao_falsa)
    escritas_da_primeira = len(sessao_falsa.execute.call_args_list)
    pedido = usuaria.deleted_at
    segunda, cookies2 = await excluir(sessao_falsa)

    assert (primeira, segunda) == (204, 204)
    assert "Max-Age=0" in cookies1[SESSION_COOKIE]
    assert "Max-Age=0" in cookies2[SESSION_COOKIE]
    assert escritas_da_primeira == 17
    assert len(sessao_falsa.execute.call_args_list) == 17
    sessao_falsa.commit.assert_awaited_once()
    assert usuaria.deleted_at == pedido


# C7: a consulta da usuária trava a linha.
async def test_excluir_trava_a_linha_da_usuaria() -> None:
    sessao_falsa = sessao_da_exclusao(alana())

    await excluir(sessao_falsa)

    primeira = sessao_falsa.scalar.call_args_list[0].args[0]
    sql = sql_do_postgres(primeira)
    assert "FOR UPDATE" in sql
    assert "WHERE users.id = %(id_1)s" in sql
    assert sql_com_valores(primeira).endswith("WHERE users.id = 1 FOR UPDATE")


# C8: só quem está logada, só menina, só com o aceite.
async def test_excluir_sem_cookie_responde_401() -> None:
    sessao_falsa = sessao_da_exclusao(alana())

    response = await chamar_rota(app, "DELETE", "/api/profile", sessao_falsa)

    assert response.status_code == 401
    assert response.json() == {"detail": "Não autenticada"}
    sessao_falsa.execute.assert_not_awaited()
    sessao_falsa.commit.assert_not_awaited()


async def test_excluir_com_token_invalido_responde_401() -> None:
    sessao_falsa = sessao_da_exclusao(alana())

    response = await chamar_rota(
        app, "DELETE", "/api/profile", sessao_falsa, token="token-qualquer"
    )

    assert response.status_code == 401
    sessao_falsa.execute.assert_not_awaited()
    sessao_falsa.commit.assert_not_awaited()


async def test_excluir_de_usuaria_que_nao_existe_mais_responde_401() -> None:
    sessao_falsa = sessao_da_exclusao(None)

    response = await chamar_rota(
        app, "DELETE", "/api/profile", sessao_falsa, token=create_access_token(1)
    )

    assert response.status_code == 401
    assert response.json() == {"detail": "Não autenticada"}
    sessao_falsa.execute.assert_not_awaited()
    sessao_falsa.commit.assert_not_awaited()


async def test_coordenadora_nao_exclui_responde_403_e_nada_e_gravado() -> None:
    coordenadora = alana()
    coordenadora.role = Role.COORDINATOR
    sessao_falsa = sessao_da_exclusao(coordenadora)

    response = await chamar_rota(
        app, "DELETE", "/api/profile", sessao_falsa, token=create_access_token(1)
    )

    assert response.status_code == 403
    assert response.json() == {"detail": "Sem permissão"}
    sessao_falsa.execute.assert_not_awaited()
    sessao_falsa.commit.assert_not_awaited()
    assert coordenadora.deleted_at is None
    assert coordenadora.email == EMAIL


async def test_sem_aceite_dos_termos_atuais_a_exclusao_acontece_mesmo_assim() -> None:
    # Quem recusa a versão nova dos termos precisa poder sair (RF-F7.09).
    usuaria = alana()
    sessao_falsa = sessao_da_exclusao(usuaria)

    response = await chamar_rota(
        app, "DELETE", "/api/profile", sessao_falsa, token=create_access_token(1)
    )

    assert response.status_code == 204
    sessao_falsa.commit.assert_awaited_once()
    assert usuaria.deleted_at is not None
    assert sessao_falsa.scalar.await_count == 2


async def test_nao_ha_rota_com_id_na_url() -> None:
    sessao_falsa = sessao_da_exclusao(alana())

    response = await chamar_rota(
        app, "DELETE", "/api/profile/2", sessao_falsa, token=create_access_token(1)
    )

    assert response.status_code == 404
    sessao_falsa.execute.assert_not_awaited()
    sessao_falsa.commit.assert_not_awaited()


# Serviço: cada resultado devolvido.
async def test_servico_devolve_cada_resultado() -> None:
    hoje = date(2026, 11, 24)
    coordenadora = alana()
    coordenadora.role = Role.COORDINATOR

    assert await delete_account(sessao_da_exclusao(None), 1, hoje) == (
        DeletionResult.NO_ACCOUNT
    )
    assert await delete_account(sessao_da_exclusao(alana_excluida()), 1, hoje) == (
        DeletionResult.ALREADY_DELETED
    )
    assert await delete_account(sessao_da_exclusao(coordenadora), 1, hoje) == (
        DeletionResult.NOT_A_GIRL
    )
    assert await delete_account(sessao_da_exclusao(alana()), 1, hoje) == (
        DeletionResult.DELETED
    )


# Conta de menina sem registro de menina: só a usuária é anonimizada.
async def test_sem_registro_de_menina_so_a_usuaria_e_anonimizada() -> None:
    usuaria = alana()
    sessao_falsa = sessao_da_exclusao(usuaria, girl_id=None)

    resultado = await delete_account(sessao_falsa, 1, date(2026, 11, 24))

    assert resultado == DeletionResult.DELETED
    assert escritas(sessao_falsa) == [
        "DELETE FROM oauth_accounts WHERE oauth_accounts.user_id = 1",
        "DELETE FROM password_reset_tokens WHERE password_reset_tokens.user_id = 1",
    ]
    assert usuaria.deleted_at is not None
    sessao_falsa.commit.assert_awaited_once()


# C9: nenhum log traz o que identifica ela; a exclusão não loga nada.
async def test_excluir_nao_loga_nada_que_identifique(
    caplog: pytest.LogCaptureFixture,
) -> None:
    sessao_falsa = sessao_da_exclusao(alana())

    with caplog.at_level(logging.DEBUG):
        await excluir(sessao_falsa)

    for dado in (NOME, "Ficticia", EMAIL, "alana", WHATSAPP, NASCIMENTO):
        assert dado not in caplog.text
    assert not [r for r in caplog.records if r.name.startswith("app")]


# C3/C14: a classificação de TODAS as tabelas. Tabela ou coluna nova que não
# esteja aqui falha, para ninguém esquecer de decidir o que a exclusão faz com
# o dado dela. `fica` = colunas que ficam como estão; `esvazia` = coluna: valor.
MANTER = "manter"
ESVAZIAR = "esvaziar"
APAGAR = "apagar"

DESTINO: dict[str, dict[str, object]] = {
    "users": {
        "acao": ESVAZIAR,
        # deactivated_at é da coordenadora desativada pela equipe (RN-41); a
        # exclusão só vale para a menina, que nunca o tem preenchido.
        "fica": {"id", "role", "created_at", "deactivated_at"},
        "esvazia": {
            "name": "Registro anonimizado",
            "email": "conta-<id>@anonimizado.invalid",
            "password_hash": None,
            "opportunity_emails": False,
            "opportunity_emails_changed_at": None,
            "deleted_at": "agora",
        },
    },
    "oauth_accounts": {"acao": APAGAR},
    "password_reset_tokens": {"acao": APAGAR},
    "terms_acceptances": {"acao": MANTER},
    "girls": {
        "acao": ESVAZIAR,
        # user_id fica ligado (C8 conta quem tem conta); origin_group_id é de C8.
        "fica": {"id", "user_id", "origin_group_id", "created_at", "updated_at"},
        "esvazia": {
            "name": "Registro anonimizado",
            "email": "registro-<id>@anonimizado.invalid",
            "birth_date": None,
            "city_ibge_code": None,
            "study_stage": None,
            "all_topics": False,
            "file_intro_seen": False,
            "last_band": None,
        },
    },
    "girl_topics": {"acao": APAGAR},
    # As linhas fora do filé são apagadas antes; as do filé são esvaziadas.
    "file_entries": {
        "acao": ESVAZIAR,
        "fica": {
            "id",
            "girl_id",
            "curated_item_id",
            "action_id",
            "status",
            "filed_at",
            "concluded_on",
            "created_at",
            "updated_at",
        },
        "esvazia": {
            "dismiss_reason": None,
            "rating": None,
            "similar_choice": None,
            "reminder": False,
            "reminder_sent_for": None,
        },
    },
    "answers": {
        "acao": ESVAZIAR,
        "fica": {"id", "girl_id", "action_id", "stage", "score", "created_at"},
        "esvazia": {"comment": None},
    },
    "followup_answers": {
        "acao": ESVAZIAR,
        "fica": {
            "id",
            "girl_id",
            "round",
            "computing_view",
            "future_self",
            "course_status",
            "still_enrolled",
            "created_at",
        },
        "esvazia": {"comment": None},
    },
    "followup_activities": {"acao": MANTER},
    "followup_helps": {"acao": MANTER},
    # Inscrição em ação futura é apagada antes (C15); as demais são esvaziadas.
    "participations": {
        "acao": ESVAZIAR,
        "fica": {
            "id",
            "girl_id",
            "action_id",
            "attended_at",
            "saved_present",
            "created_at",
        },
        "esvazia": {
            "name": None,
            "whatsapp": None,
            "study_stage": None,
            "school_year": None,
        },
    },
    # A linha fica: o painel de presença conta os enviados (divergência 2).
    "attendance_emails": {"acao": MANTER},
    "invites": {"acao": APAGAR},
    "list_matches": {"acao": APAGAR},
    "match_emails": {"acao": APAGAR},
    "dismissed_matches": {"acao": APAGAR},
    "approvals": {"acao": APAGAR},
    "enrollments": {
        "acao": ESVAZIAR,
        "fica": {
            "id",
            "girl_id",
            "level",
            "enrolled_on",
            "origin",
            "left_on",
            "created_at",
        },
        # "course" só muda quando é um nome que ela digitou.
        "esvazia": {
            "institution": None,
            "official_list_id": None,
            "course": "Outro curso, se ela digitou",
        },
    },
    "official_lists": {"acao": MANTER},
    "list_search_runs": {"acao": MANTER},
    "group_coordinators": {"acao": MANTER},
    "groups": {"acao": MANTER},
    "actions": {"acao": MANTER},
    "action_audiences": {"acao": MANTER},
    "action_topics": {"acao": MANTER},
    "curated_items": {"acao": MANTER},
    "curated_item_topics": {"acao": MANTER},
    "curated_item_audiences": {"acao": MANTER},
    "cities": {"acao": MANTER},
    "important_dates": {"acao": MANTER},
    # Convites de coordenadora (#453, #458): a exclusão só vale para a conta da
    # menina (NOT_A_GIRL para os outros papéis), então não toca neles.
    "coordinator_invites": {"acao": MANTER},
    "replaced_invite_links": {"acao": MANTER},
    # Registro da exportação da coordenadora (F24). O CSV é anônimo, com código
    # sorteado, e o texto some em 24 horas (purge_old_files).
    "data_exports": {"acao": MANTER},
}

# Tabelas "manter" que têm uma dessas colunas ou FK para girls, e por quê.
IDENTIFICAVEIS = {"email", "name", "birth_date", "whatsapp", "comment", "institution"}
MANTER_COM_COLUNA_IDENTIFICAVEL = {
    ("actions", "name"),  # nome da ação, não da menina
    ("groups", "name"),  # nome do grupo
    ("cities", "name"),  # nome do município
    ("curated_items", "title"),
    ("official_lists", "institution"),  # lista pública (RF-F31.05)
    ("coordinator_invites", "name"),  # da coordenadora convidada, não da menina
    ("coordinator_invites", "email"),  # idem
}
MANTER_COM_FK_PARA_GIRLS = {
    "attendance_emails"  # divergência 2: só girl_id, action_id, kind e datas
}


def test_toda_tabela_tem_destino() -> None:
    # (a) tabela nova sem classificação falha.
    assert set(DESTINO) == set(Base.metadata.tables)


def test_toda_coluna_de_tabela_esvaziada_tem_destino() -> None:
    # (b) coluna nova numa tabela esvaziada falha.
    for nome, destino in DESTINO.items():
        if destino["acao"] != ESVAZIAR:
            continue
        colunas = {c.name for c in Base.metadata.tables[nome].columns}
        fica = destino["fica"]
        esvazia = destino["esvazia"]
        assert isinstance(fica, set)
        assert isinstance(esvazia, dict)
        assert not fica & set(esvazia), nome
        assert fica | set(esvazia) == colunas, nome


def test_toda_chave_para_girls_esta_em_tabela_classificada() -> None:
    # (c) tabela nova ligada à menina falha até ganhar destino.
    for tabela in Base.metadata.tables.values():
        for coluna in tabela.columns:
            for chave in coluna.foreign_keys:
                if chave.target_fullname == "girls.id":
                    assert tabela.name in DESTINO


def test_tabela_mantida_nao_guarda_dado_da_menina() -> None:
    # (d) o que fica como está não tem coluna que identifica nem FK para girls,
    # a não ser as exceções acima, cada uma com o motivo.
    for nome, destino in DESTINO.items():
        if destino["acao"] != MANTER:
            continue
        tabela = Base.metadata.tables[nome]
        for coluna in tabela.columns:
            if coluna.name in IDENTIFICAVEIS:
                assert (nome, coluna.name) in MANTER_COM_COLUNA_IDENTIFICAVEL
            for chave in coluna.foreign_keys:
                if chave.target_fullname == "girls.id":
                    assert nome in MANTER_COM_FK_PARA_GIRLS


# C4 (nome em C8): "Registro anonimizado" aparece inteiro; os outros continuam.
def test_nome_curto_mantem_o_rotulo_anonimizado_inteiro() -> None:
    assert ANONYMIZED_NAME == "Registro anonimizado"
    assert short_name("Registro anonimizado") == "Registro anonimizado"
    assert short_name("Ana Lima Souza") == "Ana S."
    assert short_name("Ana") == "Ana"


# C13: a busca de indícios do F31 não lê contas excluídas.
async def test_busca_por_nome_nao_le_conta_excluida() -> None:
    sessao_falsa = AsyncMock()
    sessao_falsa.execute.return_value = [(7, "Alana Ficticia")]

    por_nome = await _girls_by_name(sessao_falsa)

    assert por_nome == {"alana ficticia": [7]}
    sql = sql_com_valores(sessao_falsa.execute.call_args.args[0])
    assert sql == (
        "SELECT girls.id, girls.name FROM girls JOIN users ON users.id = "
        "girls.user_id WHERE girls.user_id IS NOT NULL AND users.deleted_at IS NULL"
    )
