"""Datas das rodadas do questionário de acompanhamento (#293, RN-02, RN-39).

Funções puras: recebem o dia em que a conta foi criada e o dia de hoje.
"""

from datetime import date

from app.modules.followup.models import FollowupRound
from app.modules.followup.utils import add_months, open_round, round_window

CONTA = date(2026, 1, 15)


def test_rodadas_saem_3_6_12_e_18_meses_depois_da_conta() -> None:
    # RN-02: contam da criação da conta.
    assert round_window(CONTA, FollowupRound.THREE_MONTHS).opens_on == date(2026, 4, 15)
    assert round_window(CONTA, FollowupRound.SIX_MONTHS).opens_on == date(2026, 7, 15)
    assert round_window(CONTA, FollowupRound.TWELVE_MONTHS).opens_on == date(
        2027, 1, 15
    )
    assert round_window(CONTA, FollowupRound.EIGHTEEN_MONTHS).opens_on == date(
        2027, 7, 15
    )


def test_rodada_fica_aberta_30_dias_contando_o_dia_em_que_sai() -> None:
    # RN-39: de 15/04 a 14/05, inclusive.
    assert round_window(CONTA, FollowupRound.THREE_MONTHS).last_day == date(2026, 5, 14)


def test_antes_da_primeira_rodada_nao_ha_questionario() -> None:
    assert open_round(CONTA, date(2026, 4, 14)) is None


def test_no_dia_em_que_sai_a_rodada_esta_aberta() -> None:
    aberta = open_round(CONTA, date(2026, 4, 15))

    assert aberta is not None
    assert aberta.round is FollowupRound.THREE_MONTHS


def test_no_ultimo_dia_ainda_esta_aberta_e_no_seguinte_fecha() -> None:
    # RN-39: depois dos 30 dias ela não pode mais responder.
    assert open_round(CONTA, date(2026, 5, 14)) is not None
    assert open_round(CONTA, date(2026, 5, 15)) is None


def test_cada_rodada_abre_na_sua_vez() -> None:
    aberta = open_round(CONTA, date(2027, 1, 20))

    assert aberta is not None
    assert aberta.round is FollowupRound.TWELVE_MONTHS


def test_depois_da_ultima_rodada_nao_ha_mais_questionario() -> None:
    assert open_round(CONTA, date(2028, 1, 1)) is None


def test_conta_antiga_nao_recebe_rodadas_que_ja_passaram() -> None:
    # Conta de dois anos quando o M5 entrou: as rodadas passadas não reabrem.
    assert open_round(date(2024, 1, 10), date(2026, 1, 10)) is None


def test_dia_que_nao_existe_no_mes_vira_o_ultimo_dia_do_mes() -> None:
    # Conta criada em 30/11: três meses depois cai em fevereiro.
    assert add_months(date(2025, 11, 30), 3) == date(2026, 2, 28)
    assert add_months(date(2027, 11, 30), 3) == date(2028, 2, 29)
    assert add_months(date(2026, 1, 31), 6) == date(2026, 7, 31)
