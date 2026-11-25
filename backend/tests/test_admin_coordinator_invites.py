"""AD03/AD04/CV00 Convidar coordenadora (#453, RF-S2.20, RF-S2.31, RN-35, D-120).

Rodam com `db_session` (Postgres de teste). Dados fictícios. O envio de e-mail é
trocado por um falso: nenhum e-mail sai. Cada teste diz o critério que cobre.
"""

import logging
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.utils import create_access_token
from app.main import app
from app.modules.admin.service import list_coordinators
from app.modules.cities.models import City
from app.modules.groups import coordinator_email
from app.modules.groups.coordinator_email import first_name
from app.modules.groups.coordinator_invites import hash_invite_token
from app.modules.groups.models import CoordinatorInvite, Group, GroupCoordinator
from app.users.models import Role, User
from tests.helpers import chamar_rota

URL = "/api/admin/coordinators/invites"
MACEIO = 2704302
ARAPIRACA = 2700300


class EmailFalso:
    """Guarda os e-mails que sairiam; `falha` simula o Gmail recusando."""

    def __init__(self) -> None:
        self.enviados: list[tuple[str, str, str]] = []
        self.falha: Exception | None = None

    def __call__(self, to: str, subject: str, body: str) -> None:
        if self.falha is not None:
            raise self.falha
        self.enviados.append((to, subject, body))


@pytest.fixture
def email(monkeypatch: pytest.MonkeyPatch) -> EmailFalso:
    falso = EmailFalso()
    monkeypatch.setattr(coordinator_email, "send_email", falso)
    return falso


async def usuaria(sessao: AsyncSession, nome: str, role: Role) -> User:
    user = User(email=f"{nome.split()[0].lower()}@exemplo.com", name=nome, role=role)
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


def corpo_grupo_novo(
    nome: str = "Carla Ficticia",
    endereco: str = "carla@exemplo.org",
    grupo: str = "Rendeiras do Código",
    cidade: int = MACEIO,
) -> dict[str, object]:
    return {
        "name": nome,
        "email": endereco,
        "new_group": {"name": grupo, "city_id": cidade},
    }


async def convidar(
    sessao: AsyncSession, token: str, corpo: dict[str, object]
) -> "tuple[int, dict[str, object]]":
    response = await chamar_rota(app, "POST", URL, sessao, token=token, corpo=corpo)
    return response.status_code, response.json()


async def total(
    sessao: AsyncSession, modelo: type[Group] | type[CoordinatorInvite]
) -> int:
    return await sessao.scalar(select(func.count()).select_from(modelo)) or 0


# Critério: "Grupo novo": o grupo existe depois que o convite é enviado, o
# painel diz o primeiro nome, o e-mail e a data até quando vale (7 dias), e a
# convidada aparece em "Coordenadoras" como "Convite enviado" com o grupo.
async def test_grupo_novo_cria_grupo_e_convite(
    db_session: AsyncSession, email: EmailFalso
) -> None:
    await cidades(db_session)
    token = await equipe(db_session)

    antes = datetime.now(UTC)
    codigo, corpo = await convidar(db_session, token, corpo_grupo_novo())

    assert codigo == 201
    assert corpo["first_name"] == "Carla"
    assert corpo["email"] == "carla@exemplo.org"
    assert corpo["group_name"] == "Rendeiras do Código"
    assert corpo["email_sent"] is True
    vence = datetime.fromisoformat(str(corpo["expires_at"]))
    assert timedelta(days=7) <= vence - antes <= timedelta(days=7, minutes=1)

    grupo = await db_session.scalar(
        select(Group).where(Group.name == "Rendeiras do Código")
    )
    assert grupo is not None and grupo.city_id == MACEIO

    lista = await list_coordinators(db_session)
    linha = next(i for i in lista.items if i.name == "Carla Ficticia")
    assert linha.group_name == "Rendeiras do Código"
    assert linha.status.value == "invite_sent"
    assert linha.date == vence


# Critério: "Grupo que já existe": o grupo mantém suas coordenadoras e ganha
# mais um convite; nenhum grupo novo nasce (RF-S2.06).
async def test_grupo_existente_ganha_mais_um_convite(
    db_session: AsyncSession, email: EmailFalso
) -> None:
    await cidades(db_session)
    token = await equipe(db_session)
    grupo = Group(name="Marias da Ciência", city_id=ARAPIRACA)
    db_session.add(grupo)
    ativa = await usuaria(db_session, "Ana Ficticia", Role.COORDINATOR)
    await db_session.flush()
    db_session.add(GroupCoordinator(group_id=grupo.id, user_id=ativa.id))
    await db_session.flush()

    codigo, corpo = await convidar(
        db_session,
        token,
        {"name": "Dani Ficticia", "email": "dani@exemplo.org", "group_id": grupo.id},
    )

    assert codigo == 201
    assert corpo["group_name"] == "Marias da Ciência"
    assert await total(db_session, Group) == 1
    lista = await list_coordinators(db_session)
    assert {(i.name, i.status.value) for i in lista.items} == {
        ("Ana Ficticia", "active"),
        ("Dani Ficticia", "invite_sent"),
    }
    assert len(email.enviados) == 1


# Critério: o painel de "Grupo que já existe" escolhe entre os grupos que
# existem, com a cidade.
async def test_lista_de_grupos_para_escolher(db_session: AsyncSession) -> None:
    await cidades(db_session)
    token = await equipe(db_session)
    db_session.add_all(
        [
            Group(name="Marias da Ciência", city_id=ARAPIRACA),
            Group(name="Antigas", city_id=None),
        ]
    )
    await db_session.flush()

    response = await chamar_rota(
        app, "GET", "/api/admin/groups", db_session, token=token
    )

    assert response.status_code == 200
    assert [(g["name"], g["city"]) for g in response.json()] == [
        ("Antigas", None),
        ("Marias da Ciência", "Arapiraca, AL"),
    ]


# Critério: "Enviar convite" só funciona com todos os campos preenchidos e um
# e-mail válido; nada é criado nem enviado.
@pytest.mark.parametrize(
    "mudanca",
    [
        {"name": "  "},
        {"email": "sem-arroba"},
        {"email": ""},
        {"new_group": {"name": "", "city_id": MACEIO}},
        {"new_group": {"name": "Rendeiras"}},
        {"new_group": None},  # nem grupo novo, nem existente
    ],
)
async def test_campos_vazios_ou_email_invalido_sao_recusados(
    db_session: AsyncSession, email: EmailFalso, mudanca: dict[str, object]
) -> None:
    await cidades(db_session)
    token = await equipe(db_session)

    codigo, _ = await convidar(db_session, token, corpo_grupo_novo() | mudanca)

    assert codigo == 422
    assert await total(db_session, Group) == 0
    assert await total(db_session, CoordinatorInvite) == 0
    assert email.enviados == []


async def test_grupo_novo_e_existente_juntos_sao_recusados(
    db_session: AsyncSession, email: EmailFalso
) -> None:
    await cidades(db_session)
    token = await equipe(db_session)

    codigo, _ = await convidar(db_session, token, corpo_grupo_novo() | {"group_id": 1})

    assert codigo == 422


async def test_cidade_fora_da_lista_e_recusada(
    db_session: AsyncSession, email: EmailFalso
) -> None:
    token = await equipe(db_session)

    codigo, corpo = await convidar(db_session, token, corpo_grupo_novo(cidade=1))

    assert (codigo, corpo) == (422, {"error": "invalid_city"})
    assert await total(db_session, Group) == 0


async def test_grupo_existente_que_nao_existe(
    db_session: AsyncSession, email: EmailFalso
) -> None:
    token = await equipe(db_session)

    codigo, corpo = await convidar(
        db_session,
        token,
        {"name": "Dani Ficticia", "email": "dani@exemplo.org", "group_id": 999},
    )

    assert (codigo, corpo) == (404, {"error": "group_not_found"})
    assert email.enviados == []


# Critério (D-120): com "Grupo novo", se já existe grupo com o mesmo nome e a
# mesma cidade, nenhum convite é criado, nada é enviado. Outra cidade pode.
async def test_grupo_com_mesmo_nome_e_cidade_nao_cria_convite(
    db_session: AsyncSession, email: EmailFalso
) -> None:
    await cidades(db_session)
    token = await equipe(db_session)
    db_session.add(Group(name="Rendeiras do Código", city_id=MACEIO))
    await db_session.flush()

    codigo, corpo = await convidar(
        db_session, token, corpo_grupo_novo(grupo="  rendeiras do código ")
    )

    assert (codigo, corpo) == (409, {"error": "group_exists"})
    assert await total(db_session, Group) == 1
    assert await total(db_session, CoordinatorInvite) == 0
    assert email.enviados == []

    codigo, _ = await convidar(db_session, token, corpo_grupo_novo(cidade=ARAPIRACA))

    assert codigo == 201
    assert await total(db_session, Group) == 2


# Critério (RN-35): e-mail que já tem conta, de menina ou de coordenadora:
# nenhum convite, nenhum grupo, nada enviado.
@pytest.mark.parametrize("papel", [Role.GIRL, Role.COORDINATOR])
async def test_email_com_conta_nao_cria_convite_nem_grupo(
    db_session: AsyncSession, email: EmailFalso, papel: Role
) -> None:
    await cidades(db_session)
    token = await equipe(db_session)
    await usuaria(db_session, "Helena Ficticia", papel)

    codigo, corpo = await convidar(
        db_session, token, corpo_grupo_novo(endereco=" Helena@Exemplo.com ")
    )

    assert (codigo, corpo) == (409, {"error": "email_has_account"})
    assert await total(db_session, Group) == 0
    assert await total(db_session, CoordinatorInvite) == 0
    assert email.enviados == []


# Pergunta 5 do card (suposição): e-mail com convite esperando recebe erro
# apontando para "Reenviar"; um convite vencido não impede um novo.
async def test_email_com_convite_esperando_recebe_erro(
    db_session: AsyncSession, email: EmailFalso
) -> None:
    await cidades(db_session)
    token = await equipe(db_session)
    await convidar(db_session, token, corpo_grupo_novo())

    codigo, corpo = await convidar(
        db_session, token, corpo_grupo_novo(grupo="Outro grupo")
    )

    assert (codigo, corpo) == (409, {"error": "invite_pending"})
    assert await total(db_session, Group) == 1
    assert len(email.enviados) == 1

    convite = await db_session.scalar(select(CoordinatorInvite))
    assert convite is not None
    convite.expires_at = datetime.now(UTC) - timedelta(days=1)
    await db_session.flush()

    codigo, _ = await convidar(db_session, token, corpo_grupo_novo(grupo="Outro grupo"))

    assert codigo == 201


# Critério (CV00, RF-S2.31): o e-mail leva "Oi, <primeiro nome>!", o nome do
# grupo, o link "Criar minha conta" e a data até quando vale.
async def test_email_do_convite(db_session: AsyncSession, email: EmailFalso) -> None:
    await cidades(db_session)
    token = await equipe(db_session)

    _, corpo = await convidar(db_session, token, corpo_grupo_novo())

    ((para, assunto, texto),) = email.enviados
    vence = datetime.fromisoformat(str(corpo["expires_at"]))
    assert para == "carla@exemplo.org"
    assert "Rendeiras do Código" in assunto
    assert texto.startswith("Oi, Carla!")
    assert "Rendeiras do Código" in texto
    assert "Criar minha conta:" in texto
    assert coordinator_email.format_date(vence) in texto


# Critério (RN-35, RNF-S2.02): o link de cada convite é diferente e aleatório;
# o banco guarda só o hash, que bate com o link do e-mail.
async def test_link_de_cada_convite_e_diferente_e_so_o_hash_fica_no_banco(
    db_session: AsyncSession, email: EmailFalso
) -> None:
    await cidades(db_session)
    token = await equipe(db_session)

    await convidar(db_session, token, corpo_grupo_novo())
    await convidar(
        db_session,
        token,
        corpo_grupo_novo(
            nome="Dani Ficticia", endereco="dani@exemplo.org", grupo="Marias"
        ),
    )

    links = [texto.split("token=")[1].split()[0] for _, _, texto in email.enviados]
    assert len(set(links)) == 2
    assert all(len(link) >= 43 for link in links)
    hashes = set((await db_session.scalars(select(CoordinatorInvite.token_hash))).all())
    assert hashes == {hash_invite_token(link) for link in links}
    assert not any(link in hashes for link in links)


# Critério: se o e-mail não puder ser enviado, o convite fica na lista (com
# "Reenviar" disponível lá) e a resposta avisa para a equipe ver o alerta.
async def test_falha_no_envio_mantem_o_convite(
    db_session: AsyncSession, email: EmailFalso
) -> None:
    await cidades(db_session)
    token = await equipe(db_session)
    email.falha = OSError("recusou carla@exemplo.org")

    codigo, corpo = await convidar(db_session, token, corpo_grupo_novo())

    assert codigo == 201
    assert corpo["email_sent"] is False
    assert corpo["first_name"] == "Carla"
    assert await total(db_session, CoordinatorInvite) == 1
    assert await total(db_session, Group) == 1


# Critério: o nome e o e-mail da coordenadora não aparecem nos logs.
async def test_logs_sem_nome_nem_email(
    db_session: AsyncSession, email: EmailFalso, caplog: pytest.LogCaptureFixture
) -> None:
    await cidades(db_session)
    token = await equipe(db_session)
    email.falha = OSError("recusou carla@exemplo.org Carla Ficticia")

    with caplog.at_level(logging.DEBUG):
        await convidar(db_session, token, corpo_grupo_novo())

    assert "OSError" in caplog.text
    assert "carla@exemplo.org" not in caplog.text
    assert "Carla" not in caplog.text


# Critério (RNF-G.03): coordenadora e menina são negadas, mesmo por requisição
# direta; sem sessão, também. Nada é criado.
@pytest.mark.parametrize("papel", [Role.COORDINATOR, Role.GIRL])
async def test_so_a_equipe_convida(
    db_session: AsyncSession, email: EmailFalso, papel: Role
) -> None:
    await cidades(db_session)
    user = await usuaria(db_session, "Ivone Ficticia", papel)
    token = create_access_token(user.id)

    codigo, _ = await convidar(db_session, token, corpo_grupo_novo())
    lista = await chamar_rota(app, "GET", "/api/admin/groups", db_session, token=token)

    assert codigo == 403
    assert lista.status_code == 403
    assert await total(db_session, Group) == 0
    assert email.enviados == []


async def test_sem_sessao_nao_convida(db_session: AsyncSession) -> None:
    response = await chamar_rota(app, "POST", URL, db_session, corpo=corpo_grupo_novo())

    assert response.status_code == 401


def test_primeiro_nome() -> None:
    assert first_name("Carla Maria Ficticia") == "Carla"
