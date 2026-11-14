from datetime import UTC, date, datetime

from app.modules.girls.utils import AgeCheck, age_on, check_age, today_in_maceio

# Data fixa, para os testes não dependerem do relógio da máquina.
HOJE = date(2026, 11, 14)


def test_quem_faz_13_anos_hoje_passa() -> None:
    assert age_on(date(2013, 11, 14), HOJE) == 13
    assert check_age(date(2013, 11, 14), HOJE) is AgeCheck.OK


def test_12_anos_e_364_dias_e_barrada() -> None:
    # Faz 13 amanhã.
    assert age_on(date(2013, 11, 15), HOJE) == 12
    assert check_age(date(2013, 11, 15), HOJE) is AgeCheck.UNDER_13


def test_quem_ja_fez_13_ha_tempo_passa() -> None:
    assert check_age(date(2009, 3, 2), HOJE) is AgeCheck.OK


def test_aniversario_mais_tarde_no_ano_ainda_nao_conta() -> None:
    # 14 anos completos, 15 só em dezembro.
    assert age_on(date(2011, 12, 1), HOJE) == 14


def test_data_no_futuro_e_data_invalida_e_nao_menor_de_idade() -> None:
    assert age_on(date(2090, 1, 1), HOJE) is None
    assert check_age(date(2090, 1, 1), HOJE) is AgeCheck.INVALID_BIRTH_DATE
    assert check_age(date(2026, 11, 15), HOJE) is AgeCheck.INVALID_BIRTH_DATE


def test_nascida_hoje_e_barrada_pela_idade() -> None:
    assert age_on(HOJE, HOJE) == 0
    assert check_age(HOJE, HOJE) is AgeCheck.UNDER_13


def test_nascida_em_29_de_fevereiro_faz_aniversario_em_1_de_marco() -> None:
    nascimento = date(2012, 2, 29)

    # 2025 não é bissexto: em 28/02 ela ainda tem 12, em 01/03 já tem 13.
    assert check_age(nascimento, date(2025, 2, 28)) is AgeCheck.UNDER_13
    assert check_age(nascimento, date(2025, 3, 1)) is AgeCheck.OK


def test_hoje_em_maceio_usa_utc_menos_3() -> None:
    # 02:59 em UTC ainda é o dia anterior em Maceió; 03:00 já é o mesmo dia.
    assert today_in_maceio(datetime(2026, 11, 15, 2, 59, tzinfo=UTC)) == HOJE
    assert today_in_maceio(datetime(2026, 11, 15, 3, 0, tzinfo=UTC)) == date(
        2026, 11, 15
    )


def test_a_virada_do_dia_em_maceio_muda_o_resultado() -> None:
    # Às 23h de 14/11 em Maceió já é 15/11 em UTC; quem faz 13 em 15/11 ainda
    # não passa, porque vale o dia de Maceió.
    agora = datetime(2026, 11, 15, 2, 0, tzinfo=UTC)

    assert check_age(date(2013, 11, 15), today_in_maceio(agora)) is AgeCheck.UNDER_13
