"""K06 Ingressantes · resumo do topo (C8, #316).

Sessão falsa, como nos outros testes do back: o que se confere é quem entra, o
que a rota responde, o SQL da consulta e as contas do resumo. A consulta também
foi conferida contra um Postgres de verdade, como descrito no PR. Cada teste diz
o critério de aceite que cobre.
"""

from collections.abc import Sequence
from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock

from sqlalchemy.dialects import postgresql

from app.auth.utils import create_access_token
from app.main import app
from app.modules.admissions.models import AdmissionOrigin, CourseLevel
from app.modules.admissions.service import (
    SummaryRow,
    build_summary,
    get_enrollment_summary,
)
from app.users.models import Role, User
from tests.helpers import chamar_rota

URL = "/api/coordinator/enrollments/summary"
ULTIMA = datetime(2026, 10, 10, 15, 0, tzinfo=UTC)

SELF = AdmissionOrigin.SELF_DECLARED
LISTA = AdmissionOrigin.OFFICIAL_LIST
GRAD = CourseLevel.GRADUACAO
TEC = CourseLevel.TECNICO


def katia(role: Role = Role.COORDINATOR) -> User:
    return User(id=1, email="katia@exemplo.com", name="Katia Ficticia", role=role)


def linha(
    girl_id: int,
    nome: str = "Ana Lima",
    level: CourseLevel = GRAD,
    course: str = "Ciência da Computação",
    institution: str | None = "UFAL",
    origin: AdmissionOrigin = SELF,
    list_id: int | None = None,
) -> SummaryRow:
    return SummaryRow(girl_id, nome, level, course, institution, origin, list_id)


def sessao(
    usuaria: User | None,
    grupos: list[int],
    linhas: Sequence[tuple[object, ...]] | None = None,
    com_conta: int = 0,
    ultima: datetime | None = None,
    confirmadas: list[tuple[int, int]] | None = None,
) -> AsyncMock:
    # get: a usuária. scalars(...).all(): os grupos dela. scalar, em ordem: as
    # meninas com conta e a última busca. execute, em ordem: as linhas da lista
    # e os indícios confirmados da última busca.
    sessao_falsa = AsyncMock()
    sessao_falsa.get.return_value = usuaria
    sessao_falsa.scalars.return_value = MagicMock(all=MagicMock(return_value=grupos))
    sessao_falsa.scalar.side_effect = [com_conta, ultima]
    da_lista = MagicMock()
    da_lista.tuples.return_value.all.return_value = linhas or []
    dos_indicios = MagicMock()
    dos_indicios.tuples.return_value.all.return_value = confirmadas or []
    sessao_falsa.execute.side_effect = [da_lista, dos_indicios]
    return sessao_falsa


def sql(chamada: object) -> str:
    return str(
        chamada.compile(  # type: ignore[attr-defined]
            dialect=postgresql.dialect(),  # type: ignore[no-untyped-call]
            compile_kwargs={"literal_binds": True},
        )
    )


# --- Permissão (RNF-G.03) -----------------------------------------------------


async def test_sem_login_responde_401() -> None:
    response = await chamar_rota(app, "GET", URL, sessao(None, []))

    assert response.status_code == 401


async def test_menina_recebe_403_e_nada_e_consultado() -> None:
    sessao_falsa = sessao(katia(Role.GIRL), [5])

    response = await chamar_rota(app, "GET", URL, sessao_falsa, create_access_token(1))

    assert response.status_code == 403
    sessao_falsa.execute.assert_not_awaited()


async def test_coordenadora_sem_grupo_recebe_403() -> None:
    response = await chamar_rota(
        app, "GET", URL, sessao(katia(), []), create_access_token(1)
    )

    assert response.status_code == 403


async def test_coordenadora_de_dois_grupos_recebe_409() -> None:
    response = await chamar_rota(
        app, "GET", URL, sessao(katia(), [5, 6]), create_access_token(1)
    )

    assert response.status_code == 409


async def test_o_grupo_vem_da_sessao_e_nao_da_requisicao() -> None:
    sessao_falsa = sessao(katia(), [5])

    await chamar_rota(
        app, "GET", f"{URL}?group_id=6", sessao_falsa, create_access_token(1)
    )

    consulta = sql(sessao_falsa.execute.call_args_list[0].args[0])
    assert "actions.group_id = 5" in consulta
    assert "group_id = 6" not in consulta


# --- Os números (RF-F5.21) ----------------------------------------------------


def test_graduacao_e_tecnico_dividem_os_ingressos_por_nivel() -> None:
    # Critério: G e T dividem as entradas por nível, e N é a soma das meninas.
    linhas = [
        linha(1, level=GRAD),
        linha(2, level=GRAD),
        linha(3, level=TEC, institution="IFAL"),
    ]

    resumo = build_summary(linhas, 10, None, set())

    assert (resumo.total, resumo.graduacao.count, resumo.tecnico.count) == (3, 2, 1)


def test_cada_instituicao_aparece_uma_vez_em_ordem_alfabetica() -> None:
    # Critério: cada número lista todas as instituições das meninas contadas,
    # cada uma uma vez. Vazias ficam de fora.
    linhas = [
        linha(1, institution="UNEAL"),
        linha(2, institution="UFAL"),
        linha(3, institution="UNEAL"),
        linha(4, institution="  "),
        linha(5, institution="ifal", level=TEC),
        linha(6, institution="IFAL · Maceió", level=TEC),
    ]

    resumo = build_summary(linhas, 10, None, set())

    assert resumo.graduacao.institutions == ["UFAL", "UNEAL"]
    assert resumo.tecnico.institutions == ["ifal", "IFAL · Maceió"]


def test_ingresso_sem_instituicao_conta_mas_nao_entra_na_lista_de_instituicoes() -> (
    None
):
    # "Onde?" é opcional (RF-F6.02): a instituição pode ser None.
    linhas = [linha(1, institution=None), linha(2, institution="UFAL")]

    resumo = build_summary(linhas, 10, None, set())

    assert resumo.graduacao.count == 2
    assert resumo.graduacao.institutions == ["UFAL"]


def test_nome_vazio_nao_quebra_o_resumo() -> None:
    linhas = [linha(1, nome="  ", origin=LISTA, list_id=7, institution=None)]

    resumo = build_summary(linhas, 1, ULTIMA, {(1, 7)})

    assert resumo.recent is not None
    assert resumo.recent.girls[0].first_name == ""
    assert resumo.recent.girls[0].institution is None


def test_nivel_sem_meninas_vem_zerado_e_sem_instituicoes() -> None:
    resumo = build_summary([linha(1)], 4, None, set())

    assert resumo.tecnico.count == 0
    assert resumo.tecnico.institutions == []


def test_porcentagem_e_inteira_e_arredonda_5_de_18_para_28() -> None:
    # Critério: 5 de 18 mostra 28%.
    linhas = [linha(i) for i in range(1, 6)]

    assert build_summary(linhas, 18, None, set()).percent == 28
    assert build_summary(linhas[:1], 3, None, set()).percent == 33
    assert build_summary(linhas[:2], 3, None, set()).percent == 67
    assert build_summary(linhas, 5, None, set()).percent == 100


def test_nenhuma_menina_com_conta_na_acao_da_zero_sem_dividir_por_zero() -> None:
    resumo = build_summary([], 0, None, set())

    assert (resumo.total, resumo.percent) == (0, 0)
    assert resumo.recent is None


def test_os_numeros_aparecem_com_menos_de_5_meninas() -> None:
    # Critério: RN-06 ("dados insuficientes") não vale aqui (D-75).
    resumo = build_summary([linha(1), linha(2)], 2, None, set())

    assert (resumo.total, resumo.percent, resumo.graduacao.count) == (2, 100, 2)


# --- A consulta ---------------------------------------------------------------


async def test_o_resumo_parte_das_mesmas_meninas_da_lista() -> None:
    # Critério: N é o mesmo número da lista "Quem ingressou" (#315): o ingresso
    # mais recente de cada menina com conta, vinda de grupo e com presença neste
    # grupo; só ingresso, nunca aprovação nem indício sem resposta (RN-22).
    sessao_falsa = sessao(None, [])

    await get_enrollment_summary(sessao_falsa, group_id=5)

    lista = sql(sessao_falsa.execute.call_args_list[0].args[0])
    assert "DISTINCT ON (enrollments.girl_id)" in lista
    assert "girls.user_id IS NOT NULL" in lista
    assert "girls.origin_group_id IS NOT NULL" in lista
    assert "participations.attended_at IS NOT NULL" in lista
    assert "actions.group_id = 5" in lista
    assert "FROM enrollments" in lista
    for tabela in ("approvals", "list_matches", "dismissed_matches"):
        assert tabela not in lista


async def test_a_porcentagem_conta_as_meninas_com_conta_que_foram_a_acoes() -> None:
    # Critério: P é sobre as meninas que foram a ações do grupo e criaram conta,
    # sem depender do funil (D-78).
    sessao_falsa = sessao(None, [])

    await get_enrollment_summary(sessao_falsa, group_id=5)

    consulta = sql(sessao_falsa.scalar.call_args_list[0].args[0])
    assert "count(*)" in consulta
    assert "girls.user_id IS NOT NULL" in consulta
    assert "actions.group_id = 5" in consulta
    assert "funnel" not in consulta


# --- Mais recentes (RF-F5.22, Could) ------------------------------------------


def achada(
    girl_id: int,
    nome: str,
    course: str = "Sistemas de Informação",
    institution: str = "UNEAL",
    level: CourseLevel = GRAD,
    list_id: int = 7,
) -> SummaryRow:
    return linha(
        girl_id, nome, level, course, institution, origin=LISTA, list_id=list_id
    )


def test_mais_recentes_sao_as_que_a_ultima_busca_achou_e_confirmaram() -> None:
    linhas = [
        achada(1, "Júlia Mendes"),
        achada(2, "Lara Teixeira", "Técnico em Redes", "IFAL", TEC),
    ]

    resumo = build_summary(linhas, 9, ULTIMA, {(1, 7), (2, 7)})

    assert resumo.recent is not None
    assert resumo.recent.searched_at == ULTIMA
    assert [(g.first_name, g.course, g.institution) for g in resumo.recent.girls] == [
        ("Júlia", "Sistemas de Informação", "UNEAL"),
        ("Lara", "Técnico em Redes", "IFAL"),
    ]


def test_quem_declarou_o_curso_sozinha_nunca_entra_em_mais_recentes() -> None:
    # Mesmo com um indício da última busca no nome dela, a linha é declarada.
    linhas = [linha(1, "Bia Souza", origin=SELF, list_id=7), achada(2, "Carol Pires")]

    resumo = build_summary(linhas, 5, ULTIMA, {(1, 7), (2, 7)})

    assert resumo.recent is not None
    assert [g.first_name for g in resumo.recent.girls] == ["Carol"]


def test_quem_foi_achada_numa_busca_antiga_ou_nao_confirmou_fica_de_fora() -> None:
    # A achada em outra chamada (outra busca) e a que não respondeu não estão
    # no conjunto de confirmadas da última busca.
    linhas = [achada(1, "Ana Lima", list_id=3), achada(2, "Bia Souza")]

    resumo = build_summary(linhas, 5, ULTIMA, {(1, 7)})

    assert resumo.recent is None


def test_sem_nenhuma_achada_ou_sem_busca_a_frase_some() -> None:
    # Critério: sem nenhuma na última busca, ou sem busca, não há "Mais recentes".
    linhas = [achada(1, "Ana Lima")]

    assert build_summary(linhas, 5, ULTIMA, set()).recent is None
    assert build_summary(linhas, 5, None, set()).recent is None


async def test_so_conta_o_indicio_da_ultima_busca_que_ela_confirmou() -> None:
    # A rodada e os indícios dela são gravados na mesma transação, então têm o
    # mesmo created_at; "Sou eu" deixa answered_at preenchido (RN-21).
    sessao_falsa = sessao(None, [], ultima=ULTIMA)

    await get_enrollment_summary(sessao_falsa, group_id=5)

    consulta = sql(sessao_falsa.execute.call_args_list[1].args[0])
    assert "list_matches.created_at = '2026-10-10 15:00:00+00:00'" in consulta
    assert "list_matches.answered_at IS NOT NULL" in consulta


async def test_sem_busca_nem_pergunta_pelos_indicios() -> None:
    sessao_falsa = sessao(None, [], ultima=None)

    await get_enrollment_summary(sessao_falsa, group_id=5)

    assert sessao_falsa.execute.await_count == 1


async def test_a_rota_responde_os_numeros_e_mais_recentes_em_camel_case() -> None:
    # (menina, nome, nível, curso, instituição, origem, chamada)
    linhas = [
        (1, "Júlia Mendes", GRAD, "Sistemas de Informação", "UNEAL", LISTA, 7),
        (2, "Lara Teixeira", TEC, "Técnico em Redes", "IFAL", LISTA, 7),
        (3, "Carol Pires", GRAD, "Ciência da Computação", "UFAL", SELF, None),
    ]
    sessao_falsa = sessao(
        katia(), [5], linhas, com_conta=18, ultima=ULTIMA, confirmadas=[(1, 7), (2, 7)]
    )

    response = await chamar_rota(app, "GET", URL, sessao_falsa, create_access_token(1))

    assert response.status_code == 200
    assert response.json() == {
        "total": 3,
        "percent": 17,
        "graduacao": {"count": 2, "institutions": ["UFAL", "UNEAL"]},
        "tecnico": {"count": 1, "institutions": ["IFAL"]},
        "recent": {
            "searchedAt": "2026-10-10T15:00:00Z",
            "girls": [
                {
                    "firstName": "Júlia",
                    "course": "Sistemas de Informação",
                    "institution": "UNEAL",
                },
                {
                    "firstName": "Lara",
                    "course": "Técnico em Redes",
                    "institution": "IFAL",
                },
            ],
        },
    }


async def test_a_rota_sem_ingressantes_responde_zeros_e_sem_mais_recentes() -> None:
    response = await chamar_rota(
        app, "GET", URL, sessao(katia(), [5]), create_access_token(1)
    )

    assert response.json() == {
        "total": 0,
        "percent": 0,
        "graduacao": {"count": 0, "institutions": []},
        "tecnico": {"count": 0, "institutions": []},
        "recent": None,
    }
