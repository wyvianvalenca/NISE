"""A tela de perfil (A10, #391): GET /api/profile/details. Dados fictícios."""

import logging
from unittest.mock import AsyncMock

import pytest
from httpx2 import Response

from app.auth.utils import create_access_token
from app.main import app
from app.modules.girls.models import Girl, GirlTopic, StudyStage, Topic
from app.users.models import Role, User
from tests.helpers import chamar_rota, sessao_com

CAMPOS = {
    "name",
    "email",
    "city",
    "hasPassword",
    "google",
    "topics",
    "allTopics",
    "studyStage",
    "origin",
    "opportunityEmails",
}


def alana(
    id: int = 1,
    role: Role = Role.GIRL,
    senha: bool = True,
    avisos: bool = True,
) -> User:
    return User(
        id=id,
        email="alana@exemplo.com",
        name="Alana Ficticia",
        role=role,
        password_hash="hash-ficticio" if senha else None,
        opportunity_emails=avisos,
    )


def registro(
    temas: list[Topic] | None = None,
    tudo: bool = False,
    etapa: StudyStage | None = StudyStage.MEDIO,
    cidade: int | None = 2704302,
) -> Girl:
    menina = Girl(
        id=11,
        email="alana@exemplo.com",
        name="Alana Ficticia",
        user_id=1,
        city_ibge_code=cidade,
        study_stage=etapa,
        all_topics=tudo,
    )
    menina.topics = [GirlTopic(topic=tema) for tema in temas or []]
    return menina


def sessao_do_perfil(
    conta: User,
    achado: Girl | None,
    cidade: str | None = "Maceió, AL",
    grupo: str | None = None,
    google: int | None = None,
    aceite: int | None = 10,
) -> AsyncMock:
    # session.scalar responde em ordem: o aceite dos termos, a menina, a cidade
    # (só se ela tem cidade), o grupo de origem e a conta Google.
    sessao_falsa = sessao_com(conta)
    respostas: list[object] = [aceite, achado]
    if achado is not None:
        if achado.city_ibge_code is not None:
            respostas.append(cidade)
        respostas += [grupo, google]
    sessao_falsa.scalar.side_effect = respostas
    return sessao_falsa


def sql_da_consulta(sessao_falsa: AsyncMock, posicao: int) -> str:
    consulta = sessao_falsa.scalar.call_args_list[posicao].args[0]
    return str(consulta.compile(compile_kwargs={"literal_binds": True}))


async def ler(sessao_falsa: AsyncMock, user_id: int = 1) -> Response:
    return await chamar_rota(
        app,
        "GET",
        "/api/profile/details",
        sessao_falsa,
        token=create_access_token(user_id),
    )


# --- C2, C3, P6: conta e jeito de entrar --------------------------------------


async def test_conta_com_senha_e_sem_google_traz_todos_os_campos() -> None:
    # C2
    sessao_falsa = sessao_do_perfil(
        alana(), registro(temas=[Topic.PROGRAMACAO], etapa=StudyStage.MEDIO)
    )

    response = await ler(sessao_falsa)

    assert response.status_code == 200
    assert response.json() == {
        "name": "Alana Ficticia",
        "email": "alana@exemplo.com",
        "city": "Maceió, AL",
        "hasPassword": True,
        "google": False,
        "topics": [{"code": "programacao", "label": "Programação"}],
        "allTopics": False,
        "studyStage": {"code": "medio", "label": "Ensino médio"},
        "origin": {"kind": "self"},
        "opportunityEmails": True,
    }


async def test_conta_google_sem_senha() -> None:
    # C3 (RF-S2.10)
    response = await ler(sessao_do_perfil(alana(senha=False), registro(), google=5))

    assert response.status_code == 200
    assert response.json()["hasPassword"] is False
    assert response.json()["google"] is True


async def test_conta_mista_informa_senha_e_google() -> None:
    # P6: a rota só informa; a tela mostra os dois.
    response = await ler(sessao_do_perfil(alana(), registro(), google=5))

    assert response.json()["hasPassword"] is True
    assert response.json()["google"] is True


async def test_sem_cidade_devolve_city_nula_e_nao_busca_cidade() -> None:
    sessao_falsa = sessao_do_perfil(alana(), registro(cidade=None))

    response = await ler(sessao_falsa)

    assert response.json()["city"] is None
    # Termos, menina, grupo e Google: nenhuma consulta de cidade.
    assert sessao_falsa.scalar.await_count == 4


async def test_a_cidade_sai_como_nome_virgula_uf_no_sql() -> None:
    # C2: a sessão falsa devolve o texto pronto, então o formato "Maceió, AL"
    # é conferido na consulta que o banco receberia.
    sessao_falsa = sessao_do_perfil(alana(), registro())

    await ler(sessao_falsa)

    cidade = sql_da_consulta(sessao_falsa, 2)
    assert "cities.name || ', ' || cities.state" in cidade


# --- C4: interesses -----------------------------------------------------------


async def test_temas_saem_na_ordem_da_lista_com_nomes() -> None:
    # C4: gravados fora de ordem, saem na ordem de TOPIC_LABELS.
    gravados = [Topic.DESIGN, Topic.PROGRAMACAO]
    response = await ler(sessao_do_perfil(alana(), registro(temas=gravados)))

    assert response.json()["topics"] == [
        {"code": "programacao", "label": "Programação"},
        {"code": "design", "label": "Design e criação"},
    ]


async def test_me_mostra_de_tudo_vem_sem_temas() -> None:
    # C4
    response = await ler(sessao_do_perfil(alana(), registro(tudo=True)))

    assert response.json()["allTopics"] is True
    assert response.json()["topics"] == []


async def test_sem_etapa_devolve_study_stage_nulo() -> None:
    # C4
    response = await ler(sessao_do_perfil(alana(), registro(etapa=None)))

    assert response.json()["studyStage"] is None


# --- C5, C6, C7: grupo --------------------------------------------------------


async def test_com_grupo_a_origem_traz_o_nome_do_grupo() -> None:
    # C5, C7
    response = await ler(
        sessao_do_perfil(alana(), registro(), grupo="Rendeiras do Código")
    )

    assert response.json()["origin"] == {
        "kind": "group",
        "groupName": "Rendeiras do Código",
    }


async def test_sem_grupo_a_origem_e_ela_mesma() -> None:
    # C6, C7
    response = await ler(sessao_do_perfil(alana(), registro(), grupo=None))

    assert response.json()["origin"] == {"kind": "self"}


# --- C9: e-mails de oportunidade ----------------------------------------------


@pytest.mark.parametrize("ligado", [True, False])
async def test_opportunity_emails_reflete_a_conta(ligado: bool) -> None:
    # C9
    response = await ler(sessao_do_perfil(alana(avisos=ligado), registro()))

    assert response.json()["opportunityEmails"] is ligado


# --- C13: permissões ----------------------------------------------------------


async def test_sem_sessao_responde_401() -> None:
    response = await chamar_rota(
        app, "GET", "/api/profile/details", sessao_do_perfil(alana(), registro())
    )

    assert response.status_code == 401


async def test_coordenadora_responde_403() -> None:
    response = await ler(sessao_do_perfil(alana(role=Role.COORDINATOR), registro()))

    assert response.status_code == 403


async def test_sem_aceite_dos_termos_responde_403() -> None:
    response = await ler(sessao_do_perfil(alana(), registro(), aceite=None))

    assert response.status_code == 403
    assert response.json() == {"error": "terms_not_accepted"}


async def test_conta_que_nao_existe_mais_responde_401() -> None:
    response = await ler(sessao_com(None))

    assert response.status_code == 401


async def test_conta_sem_registro_de_menina_responde_404() -> None:
    response = await ler(sessao_do_perfil(alana(), None))

    assert response.status_code == 404
    assert response.json() == {"error": "profile_not_found"}


async def test_as_buscas_sao_da_usuaria_da_sessao() -> None:
    # C13: a sessão falsa ignora o WHERE, então o SQL é conferido aqui. A
    # menina 2 manda ids de outra pessoa pela URL: a rota ignora.
    sessao_falsa = sessao_do_perfil(
        alana(id=2), registro(), grupo="Rendeiras do Código", google=5
    )

    response = await chamar_rota(
        app,
        "GET",
        "/api/profile/details?user_id=1&girl_id=11",
        sessao_falsa,
        token=create_access_token(2),
    )

    assert response.status_code == 200
    menina = sql_da_consulta(sessao_falsa, 1)
    assert "girls.user_id = 2" in menina
    assert "girls.user_id = 1" not in menina
    cidade = sql_da_consulta(sessao_falsa, 2)
    assert "cities.id = 2704302" in cidade
    grupo = sql_da_consulta(sessao_falsa, 3)
    assert "girls.user_id = 2" in grupo
    google = sql_da_consulta(sessao_falsa, 4)
    assert "oauth_accounts.user_id = 2" in google
    assert "oauth_accounts.provider = 'GOOGLE'" in google


async def test_a_busca_da_menina_carrega_os_temas_com_selectinload() -> None:
    sessao_falsa = sessao_do_perfil(alana(), registro())

    await ler(sessao_falsa)

    consulta = sessao_falsa.scalar.call_args_list[1].args[0]
    # Cada opção guarda o caminho (Girl.topics) e a estratégia (selectin).
    passos = [passo for opcao in consulta._with_options for passo in opcao.context]
    assert len(passos) == 1
    assert "Girl.topics" in str(passos[0].path)
    assert passos[0].strategy == (("lazy", "selectin"),)


# --- Privacidade --------------------------------------------------------------


async def test_resposta_so_tem_os_campos_da_tela(
    caplog: pytest.LogCaptureFixture,
) -> None:
    caplog.set_level(logging.DEBUG)
    sessao_falsa = sessao_do_perfil(
        alana(), registro(), grupo="Rendeiras do Código", google=5
    )

    response = await ler(sessao_falsa)

    assert set(response.json()) == CAMPOS
    assert set(response.json()["origin"]) == {"kind", "groupName"}
    assert "hash-ficticio" not in response.text
    # Nada de nome nem e-mail nos logs.
    assert "alana@exemplo.com" not in caplog.text
    assert "Alana" not in caplog.text


# --- OpenAPI (a regressão de GET /api/profile está em test_girls_file_intro.py)


async def test_openapi_traz_a_rota_com_o_esquema_em_camel_case() -> None:
    response = await chamar_rota(app, "GET", "/openapi.json", AsyncMock())

    esquema = response.json()
    assert "/api/profile/details" in esquema["paths"]
    props = esquema["components"]["schemas"]["ProfileDetailsOut"]["properties"]
    assert set(props) == CAMPOS
