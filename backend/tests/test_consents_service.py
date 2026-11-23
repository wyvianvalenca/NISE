from datetime import UTC, datetime

import pytest
from sqlalchemy.exc import IntegrityError

from app.modules.consents.models import TermsAcceptance
from app.modules.consents.service import (
    CURRENT_TERMS_VERSION,
    EmailKind,
    can_send_email,
    has_accepted_current_terms,
    record_terms_acceptance,
    set_opportunity_emails,
)
from app.users.models import Role, User
from tests.helpers import sessao_para_busca


def alana(opportunity_emails: bool = False) -> User:
    return User(
        id=1,
        email="alana@exemplo.com",
        name="Alana Ficticia",
        role=Role.GIRL,
        opportunity_emails=opportunity_emails,
    )


async def test_ainda_sem_aceite() -> None:
    sessao_falsa = sessao_para_busca(None)

    assert not await has_accepted_current_terms(sessao_falsa, 1)


async def test_aceite_e_procurado_pela_versao_atual() -> None:
    sessao_falsa = sessao_para_busca(None)
    sessao_falsa.scalar.return_value = 10

    assert await has_accepted_current_terms(sessao_falsa, 1)

    consulta = sessao_falsa.scalar.await_args.args[0]
    sql = str(consulta.compile(compile_kwargs={"literal_binds": True}))
    assert f"'{CURRENT_TERMS_VERSION}'" in sql


async def test_aceite_grava_a_versao() -> None:
    # RF-F7.05: a data e a hora vêm do created_at, gravado pelo banco.
    sessao_falsa = sessao_para_busca(None)

    assert await record_terms_acceptance(sessao_falsa, 1, CURRENT_TERMS_VERSION)

    (aceite,) = sessao_falsa.add.call_args.args
    assert isinstance(aceite, TermsAcceptance)
    assert aceite.user_id == 1
    assert aceite.terms_version == CURRENT_TERMS_VERSION
    sessao_falsa.commit.assert_awaited_once()


async def test_aceite_de_versao_antiga_e_recusado() -> None:
    # Ela leu um texto que já mudou: precisa ler a versão nova.
    sessao_falsa = sessao_para_busca(None)

    assert not await record_terms_acceptance(sessao_falsa, 1, "versao-antiga")

    sessao_falsa.add.assert_not_called()
    sessao_falsa.commit.assert_not_awaited()


async def test_aceitar_de_novo_nao_cria_outro_registro() -> None:
    # RNF-F7.01: nada é editado; e repetir o aceite não grava nada novo.
    sessao_falsa = sessao_para_busca(None)
    sessao_falsa.scalar.return_value = 10

    assert await record_terms_acceptance(sessao_falsa, 1, CURRENT_TERMS_VERSION)

    sessao_falsa.add.assert_not_called()
    sessao_falsa.commit.assert_not_awaited()


async def test_aceite_na_corrida_conta_como_aceito() -> None:
    # Dois pedidos passam juntos pela checagem; a unicidade do banco barra o
    # segundo, e o aceite do primeiro vale para os dois.
    sessao_falsa = sessao_para_busca(None)
    sessao_falsa.commit.side_effect = IntegrityError("insert", {}, Exception())

    assert await record_terms_acceptance(sessao_falsa, 1, CURRENT_TERMS_VERSION)

    sessao_falsa.rollback.assert_awaited_once()


@pytest.mark.parametrize("enabled", [True, False])
async def test_preferencia_de_oportunidades_muda(enabled: bool) -> None:
    # RF-F7.08: ela liga ou desliga pelo perfil, a qualquer momento.
    sessao_falsa = sessao_para_busca(None)
    usuaria = alana(opportunity_emails=not enabled)
    antes = datetime.now(UTC)

    await set_opportunity_emails(sessao_falsa, usuaria, enabled)

    assert usuaria.opportunity_emails is enabled
    assert usuaria.opportunity_emails_changed_at is not None
    assert usuaria.opportunity_emails_changed_at >= antes
    sessao_falsa.commit.assert_awaited_once()


async def test_repetir_a_preferencia_nao_muda_a_data() -> None:
    sessao_falsa = sessao_para_busca(None)
    usuaria = alana(opportunity_emails=True)
    escolhida_em = datetime(2026, 11, 1, tzinfo=UTC)
    usuaria.opportunity_emails_changed_at = escolhida_em

    await set_opportunity_emails(sessao_falsa, usuaria, True)

    assert usuaria.opportunity_emails_changed_at == escolhida_em
    sessao_falsa.commit.assert_not_awaited()


@pytest.mark.parametrize(
    "kind",
    [EmailKind.QUESTIONNAIRE, EmailKind.IMPORTANT_DATES, EmailKind.PASSWORD_RESET],
)
def test_emails_obrigatorios_chegam_sem_preferencia(kind: EmailKind) -> None:
    # D-15, D-16: questionários, datas importantes e recuperação de senha
    # chegam para toda menina com conta, sem opção de recusar.
    assert can_send_email(alana(opportunity_emails=False), kind)


@pytest.mark.parametrize("enabled", [True, False])
def test_oportunidades_seguem_a_preferencia(enabled: bool) -> None:
    # RN-30: oportunidades só chegam para quem aceitou.
    usuaria = alana(opportunity_emails=enabled)

    assert can_send_email(usuaria, EmailKind.OPPORTUNITIES) is enabled
