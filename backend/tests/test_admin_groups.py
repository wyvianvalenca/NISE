"""AD06 Grupos · a lista e o "+ Novo grupo" (#456, RF-S2.29, RF-S2.30, D-120).

Rodam com `db_session` (Postgres de teste). Dados fictícios. Cada teste diz o
critério de aceite que cobre.
"""

from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.utils import create_access_token
from app.main import app
from app.modules.cities.models import City
from app.modules.girls.models import Girl
from app.modules.groups.models import CoordinatorInvite, Group, GroupCoordinator
from app.users.models import Role, User
from tests.helpers import chamar_rota
from tests.inscricoes.dados import make_action

LISTA = "/api/admin/groups/overview"
CRIAR = "/api/admin/groups"
MACEIO = 2704302
ARAPIRACA = 2700300
CAMPOS = {
    "id",
    "name",
    "city",
    "coordinators",
    "invites",
    "girls",
    "actions",
    "needs_coordinator",
}


async def usuaria(
    sessao: AsyncSession, nome: str, role: Role, desativada: bool = False
) -> User:
    user = User(
        email=f"{nome.split()[0].lower()}@exemplo.com",
        name=nome,
        role=role,
        deactivated_at=datetime.now(UTC) if desativada else None,
    )
    sessao.add(user)
    await sessao.flush()
    return user


async def equipe(sessao: AsyncSession) -> str:
    membro = await usuaria(sessao, "Gabi Ficticia", Role.NISE_TEAM)
    return create_access_token(membro.id)


async def cidades(sessao: AsyncSession) -> None:
    sessao.add_all(
        [
            City(id=MACEIO, name="Maceió", state="AL", search_name="maceio, al"),
            City(
                id=ARAPIRACA, name="Arapiraca", state="AL", search_name="arapiraca, al"
            ),
        ]
    )
    await sessao.flush()


async def grupo(sessao: AsyncSession, nome: str, cidade: int = MACEIO) -> Group:
    novo = Group(name=nome, city_id=cidade)
    sessao.add(novo)
    await sessao.flush()
    return novo


async def coordenadora(
    sessao: AsyncSession, nome: str, grupo_: Group, desativada: bool = False
) -> None:
    user = await usuaria(sessao, nome, Role.COORDINATOR, desativada)
    sessao.add(GroupCoordinator(group_id=grupo_.id, user_id=user.id))
    await sessao.flush()


async def menina(sessao: AsyncSession, numero: int, origem: Group | None) -> None:
    sessao.add(
        Girl(
            email=f"menina{numero}@exemplo.com",
            name=f"Menina Ficticia {numero}",
            origin_group_id=origem.id if origem else None,
        )
    )
    await sessao.flush()


def convite(
    grupo_: Group, numero: int, dias: int = 7, **campos: object
) -> CoordinatorInvite:
    return CoordinatorInvite(
        name="Convidada Ficticia",
        email=f"convidada{numero}@exemplo.com",
        token_hash=f"hash-ficticio-{numero}",
        group_id=grupo_.id,
        expires_at=datetime.now(UTC) + timedelta(days=dias),
        **campos,
    )


async def listar(sessao: AsyncSession, token: str) -> list[dict[str, object]]:
    response = await chamar_rota(app, "GET", LISTA, sessao, token=token)
    assert response.status_code == 200
    cartoes: list[dict[str, object]] = response.json()
    return cartoes


async def criar(
    sessao: AsyncSession, token: str, nome: str, cidade: int = MACEIO
) -> tuple[int, dict[str, object]]:
    response = await chamar_rota(
        app,
        "POST",
        CRIAR,
        sessao,
        token=token,
        corpo={"name": nome, "city_id": cidade},
    )
    return response.status_code, response.json()


async def total_grupos(sessao: AsyncSession) -> int:
    return await sessao.scalar(select(func.count()).select_from(Group)) or 0


# Critério: cada grupo traz nome, cidade e as quatro contagens (coordenadoras,
# convites esperando, meninas e ações).
async def test_cartao_traz_nome_cidade_e_contagens(db_session: AsyncSession) -> None:
    await cidades(db_session)
    token = await equipe(db_session)
    g = await grupo(db_session, "Marias da Ciência")
    await coordenadora(db_session, "Ana Ficticia", g)
    await coordenadora(db_session, "Bia Ficticia", g)
    db_session.add(convite(g, 1))
    await menina(db_session, 1, g)
    await make_action(db_session, g)
    await make_action(db_session, g)

    [cartao] = await listar(db_session, token)

    assert cartao["name"] == "Marias da Ciência"
    assert cartao["city"] == "Maceió, AL"
    assert (
        cartao["coordinators"],
        cartao["invites"],
        cartao["girls"],
        cartao["actions"],
    ) == (2, 1, 1, 2)
    assert cartao["needs_coordinator"] is False


# Critério: as meninas de um grupo são as que têm o grupo como origem (RN-32);
# quem chegou sozinha não conta em nenhum. Só contagem: nada de menina na
# resposta (RN-41).
async def test_meninas_sao_as_de_origem_e_so_contagem(
    db_session: AsyncSession,
) -> None:
    await cidades(db_session)
    token = await equipe(db_session)
    g = await grupo(db_session, "Marias da Ciência")
    outro = await grupo(db_session, "Outro Grupo", ARAPIRACA)
    await menina(db_session, 1, g)
    await menina(db_session, 2, g)
    await menina(db_session, 3, outro)
    await menina(db_session, 4, None)

    cartoes = await listar(db_session, token)

    assert {c["name"]: c["girls"] for c in cartoes} == {
        "Marias da Ciência": 2,
        "Outro Grupo": 1,
    }
    assert all(set(c) == CAMPOS for c in cartoes)


# Critério: quem precisa de coordenadora vem primeiro, depois os outros, cada
# bloco por nome (D-120).
async def test_ordem_precisa_primeiro_depois_por_nome(
    db_session: AsyncSession,
) -> None:
    await cidades(db_session)
    token = await equipe(db_session)
    ok_b = await grupo(db_session, "Beta")
    ok_a = await grupo(db_session, "Alfa")
    await grupo(db_session, "Zeta")
    await grupo(db_session, "Gama")
    await coordenadora(db_session, "Ana Ficticia", ok_b)
    await coordenadora(db_session, "Bia Ficticia", ok_a)

    nomes = [c["name"] for c in await listar(db_session, token)]

    assert nomes == ["Gama", "Zeta", "Alfa", "Beta"]


# Critério: sem coordenadora ativa o grupo precisa de coordenadora (a
# desativada não conta); convite esperando mantém a etiqueta e aparece como 1
# convite; vencido, aceito ou cancelado não conta como esperando; "0 ações".
async def test_sem_coordenadora_ativa_precisa_mesmo_com_convite(
    db_session: AsyncSession,
) -> None:
    await cidades(db_session)
    token = await equipe(db_session)
    g = await grupo(db_session, "Grupo Um")
    await coordenadora(db_session, "Ana Ficticia", g, desativada=True)
    db_session.add(convite(g, 1))
    db_session.add(convite(g, 2, dias=-1))
    db_session.add(convite(g, 3, cancelled_at=datetime.now(UTC)))
    db_session.add(convite(g, 4, accepted_at=datetime.now(UTC)))
    await db_session.flush()

    [cartao] = await listar(db_session, token)

    assert cartao["needs_coordinator"] is True
    assert cartao["coordinators"] == 0
    assert cartao["invites"] == 1
    assert cartao["actions"] == 0


# Critério: "+ Novo grupo" cria o grupo com nome e cidade; ele aparece na lista
# sem coordenadora, precisando de uma; nenhum convite é criado.
async def test_novo_grupo_aparece_precisando_de_coordenadora(
    db_session: AsyncSession,
) -> None:
    await cidades(db_session)
    token = await equipe(db_session)

    codigo, corpo = await criar(db_session, token, "  Rendeiras   do Código ")

    assert codigo == 201
    assert corpo["name"] == "Rendeiras do Código"
    assert corpo["needs_coordinator"] is True
    [cartao] = await listar(db_session, token)
    assert cartao["name"] == "Rendeiras do Código"
    assert cartao["city"] == "Maceió, AL"
    assert (cartao["coordinators"], cartao["invites"]) == (0, 0)
    convites = await db_session.scalar(
        select(func.count()).select_from(CoordinatorInvite)
    )
    assert convites == 0


# Critério: o grupo só é salvo com nome e cidade preenchidos.
@pytest.mark.parametrize(
    "corpo",
    [{}, {"name": "Só nome"}, {"city_id": MACEIO}, {"name": "   ", "city_id": MACEIO}],
)
async def test_nome_e_cidade_sao_obrigatorios(
    db_session: AsyncSession, corpo: dict[str, object]
) -> None:
    await cidades(db_session)
    token = await equipe(db_session)

    response = await chamar_rota(
        app, "POST", CRIAR, db_session, token=token, corpo=corpo
    )

    assert response.status_code == 422
    assert await total_grupos(db_session) == 0


# Critério (RN-17): a cidade é sempre uma do IBGE.
async def test_cidade_fora_da_lista_do_ibge_e_recusada(
    db_session: AsyncSession,
) -> None:
    await cidades(db_session)
    token = await equipe(db_session)

    codigo, _ = await criar(db_session, token, "Grupo Fantasma", cidade=1)

    assert codigo == 422
    assert await total_grupos(db_session) == 0


# Critério (D-120): mesmo nome (sem ligar para maiúsculas) e mesma cidade:
# nada é criado e o corpo diz group_exists. Em outra cidade, o nome pode repetir.
async def test_grupo_repetido_nao_e_criado(db_session: AsyncSession) -> None:
    await cidades(db_session)
    token = await equipe(db_session)
    await grupo(db_session, "Marias da Ciência")

    codigo, corpo = await criar(db_session, token, "marias da ciência")

    assert (codigo, corpo) == (409, {"error": "group_exists"})
    assert await total_grupos(db_session) == 1

    codigo, _ = await criar(db_session, token, "Marias da Ciência", ARAPIRACA)
    assert codigo == 201


# Critério (RNF-G.03): coordenadora e menina são negadas, por requisição
# direta, na lista e na criação. Nada é criado.
@pytest.mark.parametrize("papel", [Role.COORDINATOR, Role.GIRL])
async def test_coordenadora_e_menina_sao_negadas(
    db_session: AsyncSession, papel: Role
) -> None:
    await cidades(db_session)
    user = await usuaria(db_session, "Ivone Ficticia", papel)
    token = create_access_token(user.id)

    lista = await chamar_rota(app, "GET", LISTA, db_session, token=token)
    codigo, _ = await criar(db_session, token, "Grupo Negado")

    assert lista.status_code == 403
    assert codigo == 403
    assert await total_grupos(db_session) == 0


async def test_sem_sessao_nao_entra(db_session: AsyncSession) -> None:
    lista = await chamar_rota(app, "GET", LISTA, db_session)
    criada = await chamar_rota(
        app, "POST", CRIAR, db_session, corpo={"name": "X", "city_id": MACEIO}
    )

    assert lista.status_code == 401
    assert criada.status_code == 401


# Critério: o grupo criado aqui é o mesmo tipo de grupo do painel de convite:
# aparece em "Grupo que já existe" (GET /admin/groups).
async def test_grupo_criado_aparece_no_painel_de_convite(
    db_session: AsyncSession,
) -> None:
    await cidades(db_session)
    token = await equipe(db_session)
    await criar(db_session, token, "Rendeiras do Código")

    response = await chamar_rota(app, "GET", CRIAR, db_session, token=token)

    assert [g["name"] for g in response.json()] == ["Rendeiras do Código"]
