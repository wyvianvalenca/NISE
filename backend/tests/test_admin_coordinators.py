"""AD02 Coordenadoras · a lista do admin (#447, RF-S2.24, RNF-G.03, RN-41).

Rodam com `db_session` (Postgres de teste). Dados fictícios. Cada teste diz o
critério de aceite que cobre. Como o convite (#453) é uma story posterior, os
convites daqui são linhas de `CoordinatorInvite` gravadas direto.
"""

from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.service import ADMIN_HOME, home_path
from app.auth.utils import create_access_token
from app.main import app
from app.modules.admin.schemas import CoordinatorFilter, CoordinatorStatus
from app.modules.admin.service import list_coordinators
from app.modules.groups.models import CoordinatorInvite, Group, GroupCoordinator
from app.users.models import Role, User
from tests.helpers import chamar_rota

URL = "/api/admin/coordinators"
AGORA = datetime(2026, 11, 20, 12, 0, tzinfo=UTC)


async def usuaria(
    sessao: AsyncSession, nome: str, role: Role, desativada: bool = False
) -> User:
    user = User(
        email=f"{nome.split()[0].lower()}@exemplo.com",
        name=nome,
        role=role,
        deactivated_at=AGORA - timedelta(days=18) if desativada else None,
    )
    sessao.add(user)
    await sessao.flush()
    return user


async def grupo(sessao: AsyncSession, nome: str) -> Group:
    novo = Group(name=nome)
    sessao.add(novo)
    await sessao.flush()
    return novo


async def cenario(sessao: AsyncSession) -> None:
    """Uma coordenadora ativa, uma desativada e dois convites (um vencido)."""
    rendeiras = await grupo(sessao, "Rendeiras do Código")
    marias = await grupo(sessao, "Marias da Ciência")
    ativa = await usuaria(sessao, "Ana Ficticia", Role.COORDINATOR)
    desativada = await usuaria(sessao, "Bia Ficticia", Role.COORDINATOR, True)
    sessao.add_all(
        [
            GroupCoordinator(group_id=rendeiras.id, user_id=ativa.id),
            GroupCoordinator(group_id=marias.id, user_id=desativada.id),
            CoordinatorInvite(
                name="Carla Ficticia",
                email="carla@exemplo.com",
                token_hash="hash-carla",
                group_id=rendeiras.id,
                expires_at=AGORA + timedelta(days=3),
            ),
            CoordinatorInvite(
                name="Dani Ficticia",
                email="dani@exemplo.com",
                token_hash="hash-dani",
                group_id=marias.id,
                expires_at=AGORA - timedelta(days=2),
            ),
        ]
    )
    await sessao.flush()


# Critério: a lista mostra nome, grupo, situação e uma data, nas quatro
# situações.
async def test_lista_mostra_as_quatro_situacoes(db_session: AsyncSession) -> None:
    await cenario(db_session)

    lista = await list_coordinators(db_session, now=AGORA)

    por_nome = {linha.name: linha for linha in lista.items}
    assert [linha.name for linha in lista.items] == [
        "Ana Ficticia",
        "Bia Ficticia",
        "Carla Ficticia",
        "Dani Ficticia",
    ]
    assert por_nome["Ana Ficticia"].status is CoordinatorStatus.ACTIVE
    assert por_nome["Ana Ficticia"].group_name == "Rendeiras do Código"
    assert por_nome["Bia Ficticia"].status is CoordinatorStatus.DEACTIVATED
    assert por_nome["Bia Ficticia"].date == AGORA - timedelta(days=18)
    assert por_nome["Carla Ficticia"].status is CoordinatorStatus.INVITE_SENT
    assert por_nome["Carla Ficticia"].date == AGORA + timedelta(days=3)
    assert por_nome["Dani Ficticia"].status is CoordinatorStatus.INVITE_EXPIRED
    assert por_nome["Dani Ficticia"].date == AGORA - timedelta(days=2)


# Critério: os filtros têm contagem, e "Convites" traz enviados e expirados.
async def test_filtros_e_contagens(db_session: AsyncSession) -> None:
    await cenario(db_session)

    convites = await list_coordinators(db_session, CoordinatorFilter.INVITES, now=AGORA)
    ativas = await list_coordinators(db_session, CoordinatorFilter.ACTIVE, now=AGORA)
    desativadas = await list_coordinators(
        db_session, CoordinatorFilter.DEACTIVATED, now=AGORA
    )

    assert [linha.name for linha in convites.items] == [
        "Carla Ficticia",
        "Dani Ficticia",
    ]
    assert [linha.name for linha in ativas.items] == ["Ana Ficticia"]
    assert [linha.name for linha in desativadas.items] == ["Bia Ficticia"]
    # A contagem é da lista toda, igual em qualquer filtro.
    assert convites.counts.model_dump() == {
        "all": 4,
        "active": 1,
        "invites": 2,
        "deactivated": 1,
    }
    assert ativas.counts == convites.counts


# Critério: a busca acha pelo nome da coordenadora ou pelo do grupo (sem
# depender de acento ou maiúscula); sem resultado a lista vem vazia.
async def test_busca_por_nome_ou_grupo(db_session: AsyncSession) -> None:
    await cenario(db_session)

    por_nome = await list_coordinators(db_session, search="carla", now=AGORA)
    por_grupo = await list_coordinators(db_session, search="CODIGO", now=AGORA)
    nada = await list_coordinators(db_session, search="inexistente", now=AGORA)

    assert [linha.name for linha in por_nome.items] == ["Carla Ficticia"]
    assert [linha.name for linha in por_grupo.items] == [
        "Ana Ficticia",
        "Carla Ficticia",
    ]
    assert nada.items == []
    assert nada.counts.all == 4


async def test_convite_aceito_ou_cancelado_nao_aparece(
    db_session: AsyncSession,
) -> None:
    rendeiras = await grupo(db_session, "Rendeiras do Código")
    for nome, campo in (
        ("Eva Ficticia", "accepted_at"),
        ("Fabi Ficticia", "cancelled_at"),
    ):
        db_session.add(
            CoordinatorInvite(
                name=nome,
                email=f"{nome.split()[0].lower()}@exemplo.com",
                token_hash=f"hash-{nome.split()[0].lower()}",
                group_id=rendeiras.id,
                expires_at=AGORA + timedelta(days=1),
                **{campo: AGORA},
            )
        )
    await db_session.flush()

    lista = await list_coordinators(db_session, now=AGORA)

    assert lista.items == []


# Critério: a página não mostra dados de meninas nem e-mails (RN-41): a
# resposta só tem os campos da linha.
async def test_resposta_so_traz_campos_da_linha(db_session: AsyncSession) -> None:
    await cenario(db_session)
    equipe = await usuaria(db_session, "Gabi Ficticia", Role.NISE_TEAM)
    await usuaria(db_session, "Helena Ficticia", Role.GIRL)

    response = await chamar_rota(
        app, "GET", URL, db_session, token=create_access_token(equipe.id)
    )

    assert response.status_code == 200
    corpo = response.json()
    assert set(corpo["items"][0]) == {"id", "name", "group_name", "status", "date"}
    assert "Helena" not in response.text
    assert "@" not in response.text
    assert corpo["counts"]["all"] == 4


async def test_rota_aceita_filtro_e_busca(db_session: AsyncSession) -> None:
    await cenario(db_session)
    equipe = await usuaria(db_session, "Gabi Ficticia", Role.NISE_TEAM)

    response = await chamar_rota(
        app,
        "GET",
        f"{URL}?filter=invites&q=marias",
        db_session,
        token=create_access_token(equipe.id),
    )

    assert response.status_code == 200
    assert [i["name"] for i in response.json()["items"]] == ["Dani Ficticia"]


# Critério (RNF-G.03): coordenadora e menina, por requisição direta, são
# negadas; sem sessão, também.
@pytest.mark.parametrize("papel", [Role.COORDINATOR, Role.GIRL])
async def test_coordenadora_e_menina_sao_negadas(
    db_session: AsyncSession, papel: Role
) -> None:
    user = await usuaria(db_session, "Ivone Ficticia", papel)

    response = await chamar_rota(
        app, "GET", URL, db_session, token=create_access_token(user.id)
    )

    assert response.status_code == 403


async def test_sem_sessao_nao_entra(db_session: AsyncSession) -> None:
    response = await chamar_rota(app, "GET", URL, db_session)

    assert response.status_code == 401


# Critério: quem é da equipe e entra cai em "Coordenadoras".
async def test_equipe_cai_em_coordenadoras(db_session: AsyncSession) -> None:
    equipe = await usuaria(db_session, "Gabi Ficticia", Role.NISE_TEAM)

    assert await home_path(db_session, equipe) == ADMIN_HOME == "/admin/coordenadoras"
