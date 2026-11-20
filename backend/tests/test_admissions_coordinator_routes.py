"""K06 Ingressantes · "Quem ingressou" para a coordenadora (C8, #315).

Como os outros testes do back, estes não conectam no Postgres: a sessão é
falsa, e o que se confere é quem entra, o que a rota responde e o SQL que a
consulta manda. A consulta também foi conferida contra um Postgres de verdade
com dados fictícios, como descrito no PR. Cada teste diz o critério de aceite
que cobre.
"""

from datetime import UTC, date, datetime
from unittest.mock import AsyncMock, MagicMock

from sqlalchemy.dialects import postgresql

from app.auth.utils import create_access_token
from app.main import app
from app.modules.admissions.models import AdmissionOrigin, CourseLevel, Enrollment
from app.modules.admissions.service import list_group_enrollments
from app.modules.admissions.utils import short_name
from app.users.models import Role, User
from tests.helpers import chamar_rota

URL = "/api/coordinator/enrollments"
REGISTRADO = datetime(2026, 3, 14, 15, 0, tzinfo=UTC)


def katia(role: Role = Role.COORDINATOR) -> User:
    return User(id=1, email="katia@exemplo.com", name="Katia Ficticia", role=role)


def ingresso(
    id: int,
    course: str = "Ciência da Computação",
    institution: str = "UFAL",
    origin: AdmissionOrigin = AdmissionOrigin.SELF_DECLARED,
) -> Enrollment:
    return Enrollment(
        id=id,
        girl_id=id,
        level=CourseLevel.GRADUACAO,
        course=course,
        institution=institution,
        enrolled_on=date(2026, 2, 1),
        origin=origin,
        created_at=REGISTRADO,
    )


def sessao(
    usuaria: User | None,
    grupos: list[int],
    linhas: list[tuple[Enrollment, str]] | None = None,
    total: int = 0,
) -> AsyncMock:
    # get: a usuária da sessão. scalars(...).all(): os grupos dela.
    # scalar: o total da lista. execute(...).tuples().all(): a página.
    sessao_falsa = AsyncMock()
    sessao_falsa.get.return_value = usuaria
    sessao_falsa.scalars.return_value = MagicMock(all=MagicMock(return_value=grupos))
    sessao_falsa.scalar.return_value = total
    resultado = MagicMock()
    resultado.tuples.return_value.all.return_value = linhas or []
    sessao_falsa.execute.return_value = resultado
    return sessao_falsa


def sql_da_pagina(sessao_falsa: AsyncMock) -> str:
    statement = sessao_falsa.execute.call_args.args[0]
    return str(
        statement.compile(
            dialect=postgresql.dialect(),  # type: ignore[no-untyped-call]
            compile_kwargs={"literal_binds": True},
        )
    )


# --- Quem entra (RNF-G.03) ----------------------------------------------------


async def test_sem_login_responde_401() -> None:
    response = await chamar_rota(app, "GET", URL, sessao(None, []))

    assert response.status_code == 401


async def test_menina_recebe_403_e_a_lista_nem_e_consultada() -> None:
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
    # Nada na requisição diz de qual grupo é a lista, e escolher por ela
    # mostraria meninas do grupo errado.
    response = await chamar_rota(
        app, "GET", URL, sessao(katia(), [5, 6]), create_access_token(1)
    )

    assert response.status_code == 409


async def test_o_grupo_vem_da_sessao_e_nao_da_requisicao() -> None:
    # Critério: outro grupo não consegue a lista, nem chamando a rota direto.
    sessao_falsa = sessao(katia(), [5])

    await chamar_rota(
        app, "GET", f"{URL}?group_id=6", sessao_falsa, create_access_token(1)
    )

    sql = sql_da_pagina(sessao_falsa)
    assert "actions.group_id = 5" in sql
    assert "group_id = 6" not in sql


# --- O que a lista mostra -----------------------------------------------------


async def test_cada_linha_tem_menina_curso_instituicao_registro_e_origem() -> None:
    linhas = [
        (
            ingresso(
                3, "Sistemas de Informação", "UNEAL", AdmissionOrigin.OFFICIAL_LIST
            ),
            "Júlia Mendes",
        ),
        (ingresso(2, "Técnico em Informática", "IFAL · Maceió"), "Bia Souza Santos"),
    ]

    response = await chamar_rota(
        app, "GET", URL, sessao(katia(), [5], linhas, total=2), create_access_token(1)
    )

    assert response.status_code == 200
    assert response.json() == {
        "items": [
            {
                "id": 3,
                "girlName": "Júlia M.",
                "course": "Sistemas de Informação",
                "institution": "UNEAL",
                "registeredAt": "2026-03-14T15:00:00Z",
                "origin": "official_list",
            },
            {
                "id": 2,
                "girlName": "Bia S.",
                "course": "Técnico em Informática",
                "institution": "IFAL · Maceió",
                "registeredAt": "2026-03-14T15:00:00Z",
                "origin": "self_declared",
            },
        ],
        "total": 2,
        "page": 1,
        "pageSize": 15,
    }


async def test_instituicao_vazia_vai_como_null() -> None:
    # "Onde?" da A10b é opcional; a tela mostra "—".
    linhas = [(ingresso(1, institution="  "), "Ana Lima")]

    response = await chamar_rota(
        app, "GET", URL, sessao(katia(), [5], linhas, total=1), create_access_token(1)
    )

    assert response.json()["items"][0]["institution"] is None


async def test_lista_vazia_responde_sem_itens() -> None:
    response = await chamar_rota(
        app, "GET", URL, sessao(katia(), [5]), create_access_token(1)
    )

    assert response.json() == {"items": [], "total": 0, "page": 1, "pageSize": 15}


async def test_pagina_zero_e_recusada() -> None:
    response = await chamar_rota(
        app, "GET", f"{URL}?page=0", sessao(katia(), [5]), create_access_token(1)
    )

    assert response.status_code == 422


def test_nome_curto_e_primeiro_nome_e_inicial_do_ultimo() -> None:
    assert short_name("Ana Lima") == "Ana L."
    assert short_name("Bia Souza santos") == "Bia S."
    assert short_name("  Carol  ") == "Carol"
    assert short_name("") == ""


# --- A consulta ---------------------------------------------------------------


async def test_quinze_por_pagina_das_mais_recentes_para_as_mais_antigas() -> None:
    # D-77: ordem do registro, mais recentes primeiro, 15 por página.
    sessao_falsa = sessao(None, [])

    await list_group_enrollments(sessao_falsa, group_id=5, page=2)

    sql = sql_da_pagina(sessao_falsa)
    assert "ORDER BY anon_1.created_at DESC, anon_1.id DESC" in sql
    assert "LIMIT 15 OFFSET 15" in sql


async def test_uma_linha_por_menina_com_o_ingresso_mais_recente() -> None:
    # Quando ela corrige a declaração (RF-F6.05), a linha mostra o curso novo.
    sessao_falsa = sessao(None, [])

    await list_group_enrollments(sessao_falsa, group_id=5, page=1)

    sql = sql_da_pagina(sessao_falsa)
    assert "DISTINCT ON (enrollments.girl_id)" in sql
    assert (
        "ORDER BY enrollments.girl_id, enrollments.created_at DESC, "
        "enrollments.id DESC" in sql
    )


async def test_so_meninas_com_conta_vindas_de_grupo_e_com_presenca_no_grupo() -> None:
    # RN-01 e RN-04: com conta, pelo convite de um grupo e presente numa ação
    # deste grupo. Quem foi a ações de dois grupos aparece nos dois (D-61).
    sessao_falsa = sessao(None, [])

    await list_group_enrollments(sessao_falsa, group_id=5, page=1)

    sql = sql_da_pagina(sessao_falsa)
    assert "girls.user_id IS NOT NULL" in sql
    assert "girls.origin_group_id IS NOT NULL" in sql
    assert "participations.attended_at IS NOT NULL" in sql
    assert "actions.group_id = 5" in sql


async def test_aprovacao_e_indicio_nao_entram_na_lista() -> None:
    # Só ingresso: aprovação (RN-22) e indício sem resposta (RN-21) ficam fora,
    # e "Não sou eu" apaga o indício.
    sessao_falsa = sessao(None, [])

    await list_group_enrollments(sessao_falsa, group_id=5, page=1)

    sql = sql_da_pagina(sessao_falsa)
    assert "FROM enrollments" in sql
    for tabela in ("approvals", "list_matches", "dismissed_matches"):
        assert tabela not in sql
