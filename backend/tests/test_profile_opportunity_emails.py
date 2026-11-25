"""O interruptor de oportunidades no perfil (A10, #393). Dados fictícios.

Já cobertos, e por isso não repetidos aqui:
- tests/test_consents_routes.py: o PUT grava e preenche `opportunity_emails_changed_at`
  (test_preferencia_de_oportunidades_e_gravada), repetir a escolha não grava
  (test_repetir_a_mesma_escolha_responde_204_sem_gravar), corpo inválido -> 422
  sem gravar (test_escolha_invalida_e_recusada_sem_gravar), sem cookie -> 401,
  coordenadora -> 403, sem aceite -> 403 terms_not_accepted e "só a da sessão"
  (test_preferencia_muda_so_a_da_menina_da_sessao).
- tests/test_consents_service.py: questionários, datas e recuperação de senha
  chegam sem preferência (test_emails_obrigatorios_chegam_sem_preferencia).
"""

import pytest

from app.auth.utils import create_access_token
from app.main import app
from app.modules.consents.service import EmailKind, can_send_email
from app.users.models import User
from tests.helpers import chamar_rota
from tests.test_consents_routes import alana, sessao_da_preferencia
from tests.test_profile_details import registro, sessao_do_perfil


async def salvar(usuaria: User, enabled: bool) -> None:
    response = await chamar_rota(
        app,
        "PUT",
        "/api/preferences/opportunity-emails",
        sessao_da_preferencia(usuaria),
        token=create_access_token(1),
        corpo={"enabled": enabled},
    )
    assert response.status_code == 204


async def opportunity_emails_do_perfil(usuaria: User) -> object:
    response = await chamar_rota(
        app,
        "GET",
        "/api/profile/details",
        sessao_do_perfil(usuaria, registro()),
        token=create_access_token(1),
    )
    assert response.status_code == 200
    return response.json()["opportunityEmails"]


async def test_perfil_mostra_o_que_ela_salvou_por_ultimo() -> None:
    # C1, C3: o perfil lê do servidor; depois de desligar e de ligar de novo,
    # devolve sempre o último valor salvo.
    usuaria = alana()
    usuaria.opportunity_emails = True

    await salvar(usuaria, False)
    assert await opportunity_emails_do_perfil(usuaria) is False

    await salvar(usuaria, True)
    assert await opportunity_emails_do_perfil(usuaria) is True


async def test_desligar_e_ligar_muda_o_envio_de_oportunidades() -> None:
    # C2: o envio de oportunidades segue o interruptor, nos dois sentidos.
    usuaria = alana()
    usuaria.opportunity_emails = True
    assert can_send_email(usuaria, EmailKind.OPPORTUNITIES) is True

    await salvar(usuaria, False)
    assert usuaria.opportunity_emails is False
    assert usuaria.opportunity_emails_changed_at is not None
    assert can_send_email(usuaria, EmailKind.OPPORTUNITIES) is False

    await salvar(usuaria, True)
    assert usuaria.opportunity_emails is True
    assert can_send_email(usuaria, EmailKind.OPPORTUNITIES) is True


@pytest.mark.parametrize(
    "kind",
    [EmailKind.QUESTIONNAIRE, EmailKind.IMPORTANT_DATES, EmailKind.PASSWORD_RESET],
)
async def test_desligar_oportunidades_nao_desliga_os_e_mails_obrigatorios(
    kind: EmailKind,
) -> None:
    # C4: com o interruptor desligado pela rota, os obrigatórios seguem chegando.
    usuaria = alana()
    usuaria.opportunity_emails = True

    await salvar(usuaria, False)

    assert can_send_email(usuaria, kind) is True


@pytest.mark.parametrize(
    "caminho", ["questionnaires", "important-dates", "important_dates", "reminders"]
)
@pytest.mark.parametrize("metodo", ["PUT", "POST", "PATCH", "DELETE"])
async def test_nao_existe_rota_para_desligar_os_e_mails_obrigatorios(
    caminho: str, metodo: str
) -> None:
    # C4: nem por requisição direta.
    usuaria = alana()
    sessao_falsa = sessao_da_preferencia(usuaria)

    response = await chamar_rota(
        app,
        metodo,
        f"/api/preferences/{caminho}",
        sessao_falsa,
        token=create_access_token(1),
        corpo={"enabled": False},
    )

    assert response.status_code in (404, 405)
    sessao_falsa.commit.assert_not_awaited()


async def test_o_corpo_nao_escolhe_outro_e_mail_para_desligar() -> None:
    # C4: campo extra no corpo (ex.: o tipo do e-mail) é ignorado; só o de
    # oportunidades muda e o resto continua chegando.
    usuaria = alana()
    usuaria.opportunity_emails = True

    response = await chamar_rota(
        app,
        "PUT",
        "/api/preferences/opportunity-emails",
        sessao_da_preferencia(usuaria),
        token=create_access_token(1),
        corpo={"enabled": False, "kind": "questionnaire"},
    )

    assert response.status_code == 204
    assert can_send_email(usuaria, EmailKind.OPPORTUNITIES) is False
    assert can_send_email(usuaria, EmailKind.QUESTIONNAIRE) is True


async def test_mudar_o_interruptor_nao_mexe_em_e_mails_ja_enviados() -> None:
    # C6: o PUT só confere o aceite dos termos (1 consulta) e grava a conta;
    # não consulta, cria nem apaga mais nada (nem e-mails já enviados).
    usuaria = alana()
    usuaria.opportunity_emails = True
    sessao_falsa = sessao_da_preferencia(usuaria)

    response = await chamar_rota(
        app,
        "PUT",
        "/api/preferences/opportunity-emails",
        sessao_falsa,
        token=create_access_token(1),
        corpo={"enabled": False},
    )

    assert response.status_code == 204
    assert sessao_falsa.scalar.await_count == 1
    sessao_falsa.execute.assert_not_called()
    sessao_falsa.add.assert_not_called()
    sessao_falsa.delete.assert_not_called()
    sessao_falsa.commit.assert_awaited_once()
