"""Resultados · "Elas se veem na computação no futuro?" (C5, #369, RF-F5.33).

Rodam no Postgres de teste (`db_session`). Dados fictícios. Cada teste diz o
critério de aceite da #369 que cobre.
"""

from typing import Any

from httpx2 import Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.utils import create_access_token
from app.main import app
from app.modules.actions.models import ActionType
from app.modules.followup.models import FollowupAnswer, FollowupRound, FutureSelf
from app.modules.girls.models import Girl
from app.users.models import Role, User
from tests.helpers import chamar_rota
from tests.test_results_after_action import Cenario, dias_atras

URL = "/api/coordinator/results/future-self"
R3, R6, R12, R18 = (
    FollowupRound.THREE_MONTHS,
    FollowupRound.SIX_MONTHS,
    FollowupRound.TWELVE_MONTHS,
    FollowupRound.EIGHTEEN_MONTHS,
)


async def pedir(
    sessao: AsyncSession, usuaria: User | None, filtros: str = ""
) -> Response:
    token = create_access_token(usuaria.id) if usuaria else None
    return await chamar_rota(app, "GET", f"{URL}{filtros}", sessao, token)


def linhas(response: Response) -> dict[str, dict[str, Any]]:
    assert response.status_code == 200, response.text
    return {linha["group"]: linha for linha in response.json()["lines"]}


def ponto(linha: dict[str, Any], marco: str) -> tuple[int, int]:
    """(responderam, "Com certeza") do marco."""
    achados = [p for p in linha["points"] if p["milestone"] == marco]
    assert len(achados) == 1
    return achados[0]["responses"], achados[0]["sure"]


async def responde(
    cenario: Cenario,
    menina: Girl,
    rodada: FollowupRound,
    resposta: FutureSelf | None,
) -> None:
    cenario.sessao.add(
        FollowupAnswer(girl_id=menina.id, round=rodada, future_self=resposta)
    )
    await cenario.sessao.flush()


async def com_conta(cenario: Cenario) -> Girl:
    """Uma menina com conta (usuária ligada), sem nenhuma ação."""
    n = cenario._proximo()
    usuaria = User(
        email=f"conta{n}@exemplo.com", name=f"Conta Ficticia {n}", role=Role.GIRL
    )
    cenario.sessao.add(usuaria)
    await cenario.sessao.flush()
    menina = await cenario.menina()
    menina.user_id = usuaria.id
    await cenario.sessao.flush()
    return menina


# --- Quem vê (RN-01, RNF-F5.01) ---------------------------------------------


async def test_sem_login_responde_401(db_session: AsyncSession) -> None:
    assert (await pedir(db_session, None)).status_code == 401


async def test_menina_recebe_403(db_session: AsyncSession) -> None:
    cenario = Cenario(db_session)
    menina = await cenario.coordenadora(None, Role.GIRL)

    assert (await pedir(db_session, menina)).status_code == 403


# --- Quatro linhas e cinco marcos --------------------------------------------


async def test_quatro_linhas_e_cinco_marcos_sem_ninguem(
    db_session: AsyncSession,
) -> None:
    # Critério: quatro linhas, cinco marcos (Cadastro, 3, 6, 12 e 18 meses),
    # cada um com quantas responderam, mesmo zero (RN-50).
    cenario = Cenario(db_session)
    katia = await cenario.coordenadora(await cenario.grupo("Rendeiras do Código"))

    por_grupo = linhas(await pedir(db_session, katia))

    assert set(por_grupo) == {"two_or_more", "one", "no_show", "never"}
    for linha in por_grupo.values():
        assert [p["milestone"] for p in linha["points"]] == [
            "signup",
            "three_months",
            "six_months",
            "twelve_months",
            "eighteen_months",
        ]
        assert all(p["responses"] == 0 and p["sure"] == 0 for p in linha["points"])


# --- O valor de cada marco ----------------------------------------------------


async def test_grupos_por_numero_de_acoes_e_quem_nao_compareceu(
    db_session: AsyncSession,
) -> None:
    # Critério: foi a 2 ou mais ações, foi a 1 ação e não compareceram, com
    # "Com certeza" sobre quem respondeu naquela rodada.
    cenario = Cenario(db_session)
    grupo = await cenario.grupo("Rendeiras do Código")
    katia = await cenario.coordenadora(grupo)
    a1 = await cenario.acao(grupo, dias_atras(60))
    a2 = await cenario.acao(grupo, dias_atras(30))
    duas, duas_b, uma, faltou = [await cenario.menina() for _ in range(4)]
    for menina in (duas, duas_b):
        await cenario.inscrita(menina, a1, True)
        await cenario.inscrita(menina, a2, True)
    await cenario.inscrita(uma, a1, True)
    await cenario.inscrita(uma, a2, False)
    await cenario.inscrita(faltou, a1, False)
    await responde(cenario, duas, R3, FutureSelf.SURE)
    await responde(cenario, duas_b, R3, FutureSelf.MAYBE)
    await responde(cenario, uma, R3, FutureSelf.SURE)
    await responde(cenario, faltou, R3, FutureSelf.PROBABLY_NOT)
    await responde(cenario, duas, R6, FutureSelf.SURE)

    por_grupo = linhas(await pedir(db_session, katia))

    assert por_grupo["two_or_more"]["girls"] == 2
    assert ponto(por_grupo["two_or_more"], "three_months") == (2, 1)
    assert ponto(por_grupo["two_or_more"], "six_months") == (1, 1)
    assert ponto(por_grupo["one"], "three_months") == (1, 1)
    assert ponto(por_grupo["no_show"], "three_months") == (1, 0)
    assert ponto(por_grupo["no_show"], "six_months") == (0, 0)


async def test_quem_pulou_a_pergunta_nao_entra_no_n(db_session: AsyncSession) -> None:
    # Critério: o n é de quem respondeu a pergunta, não de quem abriu a rodada.
    cenario = Cenario(db_session)
    grupo = await cenario.grupo("Rendeiras do Código")
    katia = await cenario.coordenadora(grupo)
    acao = await cenario.acao(grupo, dias_atras(30))
    ana, bia = await cenario.menina(), await cenario.menina()
    await cenario.inscrita(ana, acao, True)
    await cenario.inscrita(bia, acao, True)
    await responde(cenario, ana, R12, FutureSelf.SURE)
    await responde(cenario, bia, R12, None)

    por_grupo = linhas(await pedir(db_session, katia))

    assert por_grupo["one"]["girls"] == 2
    assert ponto(por_grupo["one"], "twelve_months") == (1, 1)


async def test_cadastro_ainda_nao_tem_respostas(db_session: AsyncSession) -> None:
    # Dependência: o cadastro não guarda a pergunta 2 (RF-F10.26 é Should), então
    # o marco "Cadastro" fica com 0 respostas em vez de inventar um valor.
    cenario = Cenario(db_session)
    grupo = await cenario.grupo("Rendeiras do Código")
    katia = await cenario.coordenadora(grupo)
    acao = await cenario.acao(grupo, dias_atras(30))
    ana = await cenario.menina()
    await cenario.inscrita(ana, acao, True)
    await responde(cenario, ana, R18, FutureSelf.SURE)

    por_grupo = linhas(await pedir(db_session, katia))

    assert ponto(por_grupo["one"], "signup") == (0, 0)
    assert ponto(por_grupo["one"], "eighteen_months") == (1, 1)


# --- Nunca participaram (RN-04) ----------------------------------------------


async def test_nunca_participaram_sao_as_com_conta_sem_nenhuma_acao(
    db_session: AsyncSession,
) -> None:
    # Critério: meninas com conta que nunca foram a nenhuma ação, só como total.
    # Quem não tem conta (importada) e quem tem inscrição não entram.
    cenario = Cenario(db_session)
    grupo = await cenario.grupo("Rendeiras do Código")
    outro = await cenario.grupo("Outro Grupo Fictício")
    katia = await cenario.coordenadora(grupo)
    sozinha, sozinha_b, inscrita_fora = [await com_conta(cenario) for _ in range(3)]
    await cenario.inscrita(
        inscrita_fora, await cenario.acao(outro, dias_atras(30)), False
    )
    await cenario.menina()  # importada, sem conta
    await responde(cenario, sozinha, R3, FutureSelf.SURE)
    await responde(cenario, sozinha_b, R3, FutureSelf.MAYBE)

    por_grupo = linhas(await pedir(db_session, katia))

    assert por_grupo["never"]["girls"] == 2
    assert ponto(por_grupo["never"], "three_months") == (2, 1)


async def test_resposta_so_traz_totais_nunca_uma_menina(
    db_session: AsyncSession,
) -> None:
    # Critério (RN-04): nada que identifique quem chegou sozinha.
    cenario = Cenario(db_session)
    grupo = await cenario.grupo("Rendeiras do Código")
    katia = await cenario.coordenadora(grupo)
    sozinha = await com_conta(cenario)
    await responde(cenario, sozinha, R3, FutureSelf.SURE)

    response = await pedir(db_session, katia)

    assert response.status_code == 200
    for chave in (sozinha.name, sozinha.email, str(sozinha.id)):
        assert chave not in response.text
    for linha in response.json()["lines"]:
        assert set(linha) == {"group", "girls", "points"}
        assert all(
            set(p) == {"milestone", "responses", "sure"} for p in linha["points"]
        )


# --- Só as ações do grupo que batem com os filtros ----------------------------


async def test_outro_grupo_nao_entra_nas_tres_primeiras_linhas(
    db_session: AsyncSession,
) -> None:
    # Critério: só meninas das ações do próprio grupo (RN-01).
    cenario = Cenario(db_session)
    grupo = await cenario.grupo("Rendeiras do Código")
    outro = await cenario.grupo("Outro Grupo Fictício")
    katia = await cenario.coordenadora(grupo)
    ana = await cenario.menina()
    await cenario.inscrita(ana, await cenario.acao(outro, dias_atras(30)), True)
    await responde(cenario, ana, R3, FutureSelf.SURE)

    por_grupo = linhas(await pedir(db_session, katia))

    for chave in ("two_or_more", "one", "no_show"):
        assert por_grupo[chave]["girls"] == 0


async def test_so_contam_as_acoes_do_filtro(db_session: AsyncSession) -> None:
    # Critério: os três grupos só têm meninas das ações que batem com os filtros.
    # Com o tipo "Palestra", quem foi a 2 oficinas não aparece; a que foi a 1
    # palestra cai em "foi a 1 ação" mesmo tendo ido a outras ações.
    cenario = Cenario(db_session)
    grupo = await cenario.grupo("Rendeiras do Código")
    katia = await cenario.coordenadora(grupo)
    oficina1 = await cenario.acao(grupo, dias_atras(60))
    oficina2 = await cenario.acao(grupo, dias_atras(40))
    palestra = await cenario.acao(grupo, dias_atras(20), tipo=ActionType.PALESTRA)
    so_oficinas, mista = await cenario.menina(), await cenario.menina()
    for acao in (oficina1, oficina2):
        await cenario.inscrita(so_oficinas, acao, True)
    await cenario.inscrita(mista, oficina1, True)
    await cenario.inscrita(mista, palestra, True)

    por_grupo = linhas(await pedir(db_session, katia, "?type=palestra"))

    assert por_grupo["two_or_more"]["girls"] == 0
    assert por_grupo["one"]["girls"] == 1
    por_grupo = linhas(await pedir(db_session, katia))
    assert por_grupo["two_or_more"]["girls"] == 2


async def test_filtro_invalido_responde_422(db_session: AsyncSession) -> None:
    cenario = Cenario(db_session)
    katia = await cenario.coordenadora(await cenario.grupo("Rendeiras do Código"))

    assert (await pedir(db_session, katia, "?period=1d")).status_code == 422
