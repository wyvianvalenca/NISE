"""Resultados · "Como o interesse evolui" e "Quem mudou de situação" (C5, #368).

Rodam no Postgres de teste (`db_session`). Dados fictícios. Cada teste diz o
critério de aceite da #368 que cobre. A pergunta no cadastro (change #303) ainda
não existe: os testes do cadastro entram pela função `signup_views`.
"""

from typing import Any

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.utils import create_access_token
from app.main import app
from app.modules.followup.models import ComputingView, FollowupAnswer, FollowupRound
from app.modules.girls.models import Girl, Topic
from app.modules.groups.models import Group
from app.modules.results import service
from app.modules.results.service import build_interest
from app.users.models import Role, User
from tests.helpers import chamar_rota
from tests.test_results_after_action import Cenario, dias_atras

URL = "/api/coordinator/results/interest"
QUERO = ComputingView.WANT_TO_FOLLOW
GOSTO = ComputingView.LIKE_BUT_UNSURE
JA_NAO = ComputingView.LESS_INTERESTED
NAO_E = ComputingView.NOT_FOR_ME
R3 = FollowupRound.THREE_MONTHS
R6 = FollowupRound.SIX_MONTHS
R12 = FollowupRound.TWELVE_MONTHS
R18 = FollowupRound.EIGHTEEN_MONTHS


async def pedir(
    sessao: AsyncSession, usuaria: User | None, filtros: str = "?period=all"
) -> Any:
    token = create_access_token(usuaria.id) if usuaria else None
    return await chamar_rota(app, "GET", f"{URL}{filtros}", sessao, token)


def corpo_de(response: Any) -> dict[str, Any]:
    assert response.status_code == 200, response.text
    corpo: dict[str, Any] = response.json()
    return corpo


async def responde(
    sessao: AsyncSession,
    menina: Girl,
    rodada: FollowupRound,
    visao: ComputingView | None,
    comentario: str | None = None,
) -> None:
    sessao.add(
        FollowupAnswer(
            girl_id=menina.id,
            round=rodada,
            computing_view=visao,
            comment=comentario,
        )
    )
    await sessao.flush()


def cadastro(
    monkeypatch: pytest.MonkeyPatch, por_menina: dict[int, ComputingView]
) -> None:
    async def falso(
        sessao: AsyncSession, meninas: set[int]
    ) -> dict[int, ComputingView]:
        return {m: v for m, v in por_menina.items() if m in meninas}

    monkeypatch.setattr(service, "signup_views", falso)


async def grupo_com(
    sessao: AsyncSession, quantas: int = 1
) -> tuple[Cenario, Group, User, list[Girl]]:
    """Um grupo com uma ação antiga e `quantas` meninas que vieram a ela."""
    cenario = Cenario(sessao)
    grupo = await cenario.grupo("Rendeiras do Código")
    katia = await cenario.coordenadora(grupo)
    acao = await cenario.acao(grupo, dias_atras(400))
    meninas = []
    for _ in range(quantas):
        menina = await cenario.menina()
        await cenario.inscrita(menina, acao, True)
        meninas.append(menina)
    return cenario, grupo, katia, meninas


# --- Quem entra ----------------------------------------------------------------


async def test_sem_login_responde_401(db_session: AsyncSession) -> None:
    assert (await pedir(db_session, None)).status_code == 401


async def test_menina_recebe_403(db_session: AsyncSession) -> None:
    cenario = Cenario(db_session)
    menina = await cenario.coordenadora(None, Role.GIRL)

    assert (await pedir(db_session, menina)).status_code == 403


async def test_so_contam_participantes_das_acoes_do_proprio_grupo(
    db_session: AsyncSession,
) -> None:
    # Critério: só contam meninas que participaram de ações do grupo dela. Quem
    # só se inscreveu e faltou, ou veio a outro grupo, não entra.
    cenario, grupo, katia, [veio] = await grupo_com(db_session, 1)
    outro = await cenario.grupo("Outro Grupo Fictício")
    acao = await cenario.acao(grupo, dias_atras(300))
    faltou = await cenario.menina()
    await cenario.inscrita(faltou, acao, False)
    de_fora = await cenario.menina()
    await cenario.inscrita(de_fora, await cenario.acao(outro, dias_atras(300)), True)
    for menina in (veio, faltou, de_fora):
        await responde(db_session, menina, R3, QUERO)

    corpo = corpo_de(await pedir(db_session, katia))

    assert corpo["rounds"]["three_months"]["answered"] == 1
    # E a coordenadora de outro grupo não vê as respostas deste.
    outra = await cenario.coordenadora(outro)
    outro_corpo = corpo_de(await pedir(db_session, outra))
    assert outro_corpo["rounds"]["three_months"]["answered"] == 1  # só a de_fora
    assert outro_corpo["rounds"]["three_months"]["counts"]["want_to_follow"] == 1


# --- Como o interesse evolui (RF-F5.04) ----------------------------------------


async def test_barras_por_marco_com_as_quatro_opcoes_e_quantas_responderam(
    db_session: AsyncSession,
) -> None:
    # Critérios: uma barra por marco (Cadastro e 3/6/12/18 meses), as quatro
    # opções em cada uma, também as com zero, e quantas responderam. Quem não
    # respondeu a um marco não conta nele.
    _, _, katia, meninas = await grupo_com(db_session, 4)
    for menina, visao in zip(meninas, (QUERO, QUERO, NAO_E, JA_NAO), strict=True):
        await responde(db_session, menina, R3, visao)
    await responde(db_session, meninas[0], R6, GOSTO)
    await responde(db_session, meninas[1], R18, QUERO)

    corpo = corpo_de(await pedir(db_session, katia))

    tres = corpo["rounds"]["three_months"]
    assert tres["answered"] == 4
    assert tres["counts"] == {
        "want_to_follow": 2,
        "like_but_unsure": 0,
        "less_interested": 1,
        "not_for_me": 1,
    }
    assert list(tres["counts"]) == [
        "want_to_follow",
        "like_but_unsure",
        "less_interested",
        "not_for_me",
    ]
    assert corpo["rounds"]["six_months"]["answered"] == 1
    assert corpo["rounds"]["twelve_months"]["answered"] == 0
    assert corpo["rounds"]["eighteen_months"]["answered"] == 1
    assert list(corpo["rounds"]) == [
        "three_months",
        "six_months",
        "twelve_months",
        "eighteen_months",
    ]
    assert sum(tres["counts"].values()) == tres["answered"]


async def test_marco_cadastro_conta_quem_respondeu_no_cadastro(
    db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    _, _, katia, meninas = await grupo_com(db_session, 3)
    cadastro(monkeypatch, {meninas[0].id: QUERO, meninas[1].id: GOSTO})

    corpo = corpo_de(await pedir(db_session, katia))

    assert corpo["signup"]["answered"] == 2
    assert corpo["signup"]["counts"]["want_to_follow"] == 1
    assert corpo["signup"]["counts"]["like_but_unsure"] == 1


async def test_sem_a_pergunta_no_cadastro_o_marco_vem_com_zero(
    db_session: AsyncSession,
) -> None:
    # Pergunta em aberto 4: sem a pergunta no cadastro (#303), zero respostas
    # e ninguém na comparação, sem erro.
    _, _, katia, [menina] = await grupo_com(db_session, 1)
    await responde(db_session, menina, R3, QUERO)

    corpo = corpo_de(await pedir(db_session, katia))

    assert corpo["signup"]["answered"] == 0
    assert corpo["movement"]["withBoth"] == 0
    assert corpo["movement"]["commonChanges"] == []


async def test_resposta_vazia_a_pergunta_1_nao_conta(
    db_session: AsyncSession,
) -> None:
    # Todas as perguntas são opcionais: quem respondeu a rodada sem a pergunta 1
    # não conta na barra.
    _, _, katia, [menina] = await grupo_com(db_session, 1)
    await responde(db_session, menina, R3, None, comentario="texto fictício")

    corpo = corpo_de(await pedir(db_session, katia))

    assert corpo["rounds"]["three_months"]["answered"] == 0


async def test_filtros_de_acao_e_tag_valem_para_o_interesse(
    db_session: AsyncSession,
) -> None:
    cenario, grupo, katia, [menina] = await grupo_com(db_session, 1)
    com_tag = await cenario.acao(grupo, dias_atras(200), tags=(Topic.IA,))
    outra = await cenario.menina()
    await cenario.inscrita(outra, com_tag, True)
    await responde(db_session, menina, R3, QUERO)
    await responde(db_session, outra, R3, NAO_E)

    por_tag = corpo_de(await pedir(db_session, katia, "?period=all&topic=ia"))
    por_acao = corpo_de(
        await pedir(db_session, katia, f"?period=all&action_id={com_tag.id}")
    )
    todas = corpo_de(await pedir(db_session, katia))

    assert por_tag["rounds"]["three_months"]["counts"]["not_for_me"] == 1
    assert por_tag["rounds"]["three_months"]["answered"] == 1
    assert por_acao["rounds"]["three_months"]["answered"] == 1
    assert todas["rounds"]["three_months"]["answered"] == 2


async def test_periodo_do_filtro_muda_quem_conta(db_session: AsyncSession) -> None:
    # A ação do grupo é de 400 dias atrás: fora dos "Últimos 12 meses" (padrão)?
    # Não, 400 dias passam de 12 meses; fora do padrão, dentro de "Desde o início".
    _, _, katia, [menina] = await grupo_com(db_session, 1)
    await responde(db_session, menina, R3, QUERO)

    padrao = corpo_de(await pedir(db_session, katia, ""))
    todas = corpo_de(await pedir(db_session, katia, "?period=all"))

    assert padrao["rounds"]["three_months"]["answered"] == 0
    assert todas["rounds"]["three_months"]["answered"] == 1


async def test_sem_ninguem_responde_zero_e_nao_erro(db_session: AsyncSession) -> None:
    cenario = Cenario(db_session)
    katia = await cenario.coordenadora(await cenario.grupo("Rendeiras do Código"))

    corpo = corpo_de(await pedir(db_session, katia))

    assert corpo["signup"]["answered"] == 0
    assert corpo["movement"]["withBoth"] == 0
    assert all(m["answered"] == 0 for m in corpo["rounds"].values())


async def test_responde_so_totais_sem_menina_nem_comentario(
    db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    # Critério: nenhuma tela mostra o que uma menina respondeu (RN-11, RN-50).
    _, _, katia, [menina] = await grupo_com(db_session, 1)
    await responde(db_session, menina, R3, QUERO, comentario="segredo fictício")
    cadastro(monkeypatch, {menina.id: GOSTO})

    response = await pedir(db_session, katia)

    texto = response.text
    assert "segredo fictício" not in texto
    assert menina.email not in texto
    assert menina.name not in texto
    for chave in ("girlId", "girl_id", "email", "name", "comment"):
        assert f'"{chave}"' not in texto


# --- Quem mudou de situação (RF-F5.32) -----------------------------------------


def comparar(
    cadastro_por_menina: dict[int, ComputingView],
    respostas: dict[int, dict[FollowupRound, ComputingView]],
) -> service.Movement:
    return build_interest(cadastro_por_menina, respostas).movement


def test_subiu_manteve_e_caiu_do_melhor_ao_pior() -> None:
    # Critério: Subiu/Manteve/Caiu, na ordem Quero seguir > Gosto > Já não > Não é.
    movimento = comparar(
        {1: GOSTO, 2: JA_NAO, 3: QUERO, 4: QUERO, 5: NAO_E},
        {
            1: {R3: QUERO},  # subiu
            2: {R3: GOSTO},  # subiu
            3: {R3: QUERO},  # manteve
            4: {R3: NAO_E},  # caiu
            5: {R3: NAO_E},  # manteve
        },
    )

    assert (movimento.went_up, movimento.stayed, movimento.went_down) == (2, 2, 1)
    assert movimento.with_both == 5


def test_ultima_resposta_e_a_da_rodada_mais_recente_que_ela_respondeu() -> None:
    # Pergunta em aberto 3: uma menina até 3 meses e outra até 18 contam juntas,
    # cada uma com a sua última.
    movimento = comparar(
        {1: NAO_E, 2: NAO_E},
        {
            1: {R3: QUERO, R6: JA_NAO},  # a última é a de 6 meses: subiu um pouco
            2: {R18: GOSTO, R3: NAO_E},  # a última é a de 18 meses
        },
    )

    assert movimento.went_up == 2
    assert {(c.origin, c.destination) for c in movimento.common_changes} == {
        (NAO_E, JA_NAO),
        (NAO_E, GOSTO),
    }


def test_so_entra_quem_tem_cadastro_e_ao_menos_uma_resposta_depois() -> None:
    movimento = comparar(
        {1: QUERO, 2: QUERO, 3: QUERO},
        {
            1: {R3: QUERO},
            3: {R6: GOSTO},
            9: {R3: QUERO},
        },  # 2 sem resposta; 9 sem cadastro
    )

    assert movimento.with_both == 2


def test_mudancas_mais_comuns_da_mais_para_a_menos_comum_com_desempate() -> None:
    cadastro_por_menina = {n: GOSTO for n in range(1, 8)}
    cadastro_por_menina.update({8: JA_NAO, 9: QUERO, 10: GOSTO})
    respostas = {n: {R3: QUERO} for n in range(1, 8)}  # 7 de Gosto -> Quero
    respostas[8] = {R3: NAO_E}  # 1 de Já não -> Não é
    respostas[9] = {R3: GOSTO}  # 1 de Quero -> Gosto
    respostas[10] = {R3: GOSTO}  # manteve: não é uma mudança

    movimento = comparar(cadastro_por_menina, respostas)

    assert [(c.origin, c.destination, c.girls) for c in movimento.common_changes] == [
        (GOSTO, QUERO, 7),
        (QUERO, GOSTO, 1),  # empate: o de origem melhor primeiro
        (JA_NAO, NAO_E, 1),
    ]


def test_lista_de_mudancas_tem_no_maximo_cinco_linhas() -> None:
    opcoes = (QUERO, GOSTO, JA_NAO, NAO_E)
    pares = [(a, b) for a in opcoes for b in opcoes if a is not b]  # 12 mudanças
    movimento = comparar(
        {n: a for n, (a, _) in enumerate(pares)},
        {n: {R3: b} for n, (_, b) in enumerate(pares)},
    )

    assert len(movimento.common_changes) == service.TOP_CHANGES


async def test_rota_com_cadastro_devolve_quem_mudou(
    db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    # Critérios: card diz quantas têm as duas respostas; Subiu/Manteve/Caiu e
    # "Mudanças mais comuns" como "7 · Gosto, mas não sei → Quero seguir".
    _, _, katia, meninas = await grupo_com(db_session, 4)
    cadastro(
        monkeypatch,
        {meninas[0].id: GOSTO, meninas[1].id: GOSTO, meninas[2].id: QUERO},
    )
    await responde(db_session, meninas[0], R3, QUERO)
    await responde(db_session, meninas[1], R3, QUERO)
    await responde(db_session, meninas[2], R3, GOSTO)
    await responde(db_session, meninas[3], R3, QUERO)  # sem cadastro: fora

    corpo = corpo_de(await pedir(db_session, katia))

    movimento = corpo["movement"]
    assert movimento["withBoth"] == 3
    assert (movimento["wentUp"], movimento["stayed"], movimento["wentDown"]) == (
        2,
        0,
        1,
    )
    assert movimento["commonChanges"][0] == {
        "origin": "like_but_unsure",
        "destination": "want_to_follow",
        "girls": 2,
    }


def test_ordem_do_melhor_ao_pior() -> None:
    assert list(service.INTEREST_ORDER) == [QUERO, GOSTO, JA_NAO, NAO_E]
