"""Se a menina já viu "Por que filé?" (RF-F10.02, #84). Dados fictícios."""

from unittest.mock import AsyncMock

from fastapi.testclient import TestClient
from httpx2 import Response

from app.auth.utils import create_access_token
from app.main import app
from app.modules.girls.models import Girl, GirlTopic, StudyStage, Topic
from app.modules.girls.service import get_girl_of_user, mark_file_intro_seen
from app.users.models import Role, User
from tests.helpers import chamar_rota, sessao_com


def usuaria(id: int = 1, role: Role = Role.GIRL) -> User:
    return User(
        id=id,
        email=f"menina{id}@exemplo.com",
        name="Menina Ficticia",
        role=role,
        opportunity_emails=False,
    )


def registro(
    user_id: int = 1,
    ja_viu: bool = False,
    temas: tuple[Topic, ...] = (),
    de_tudo: bool = False,
    etapa: StudyStage | None = None,
) -> Girl:
    return Girl(
        id=user_id + 10,
        email=f"menina{user_id}@exemplo.com",
        name="Menina Ficticia",
        user_id=user_id,
        file_intro_seen=ja_viu,
        all_topics=de_tudo,
        study_stage=etapa,
        topics=[GirlTopic(topic=tema) for tema in temas],
    )


def sessao_do_perfil(
    conta: User, achado: Girl | None, aceite: int | None = 10
) -> AsyncMock:
    # session.get(User, id) acha a usuária da sessão. session.scalar responde,
    # em ordem: o aceite dos termos (o id dele, ou None) e o registro da menina.
    sessao_falsa = sessao_com(conta)
    sessao_falsa.scalar.side_effect = [aceite, achado]
    return sessao_falsa


def sql_da_busca(sessao_falsa: AsyncMock) -> str:
    # A última consulta é a do registro da menina.
    consulta = sessao_falsa.scalar.call_args.args[0]
    return str(consulta.compile(compile_kwargs={"literal_binds": True}))


async def ler_perfil(sessao_falsa: AsyncMock, user_id: int = 1) -> Response:
    return await chamar_rota(
        app,
        "GET",
        "/api/profile",
        sessao_falsa,
        token=create_access_token(user_id),
    )


async def marcar(sessao_falsa: AsyncMock, user_id: int = 1) -> Response:
    return await chamar_rota(
        app,
        "PUT",
        "/api/profile/file-intro-seen",
        sessao_falsa,
        token=create_access_token(user_id),
    )


# --- Serviço -----------------------------------------------------------------


async def test_marcar_guarda_que_ela_viu() -> None:
    menina = registro()
    sessao_falsa = AsyncMock()
    sessao_falsa.scalar.return_value = menina

    marcou = await mark_file_intro_seen(sessao_falsa, 1)

    assert marcou is True
    assert menina.file_intro_seen is True
    sessao_falsa.commit.assert_awaited_once()


async def test_marcar_de_novo_nao_muda_nada() -> None:
    menina = registro(ja_viu=True)
    sessao_falsa = AsyncMock()
    sessao_falsa.scalar.return_value = menina

    marcou = await mark_file_intro_seen(sessao_falsa, 1)

    assert marcou is True
    assert menina.file_intro_seen is True
    sessao_falsa.commit.assert_not_called()


async def test_conta_sem_registro_de_menina_nao_marca() -> None:
    sessao_falsa = AsyncMock()
    sessao_falsa.scalar.return_value = None

    marcou = await mark_file_intro_seen(sessao_falsa, 1)

    assert marcou is False
    sessao_falsa.commit.assert_not_called()


async def test_busca_so_o_registro_da_conta_dada() -> None:
    sessao_falsa = AsyncMock()
    sessao_falsa.scalar.return_value = registro(user_id=2)

    await get_girl_of_user(sessao_falsa, 2)

    assert "girls.user_id = 2" in sql_da_busca(sessao_falsa)


# --- GET /api/profile --------------------------------------------------------


async def test_quem_nao_viu_e_avisada_que_nao_viu() -> None:
    response = await ler_perfil(sessao_do_perfil(usuaria(), registro()))

    assert response.status_code == 200
    assert response.json()["fileIntroSeen"] is False


async def test_quem_ja_viu_e_avisada_que_viu() -> None:
    response = await ler_perfil(sessao_do_perfil(usuaria(), registro(ja_viu=True)))

    assert response.status_code == 200
    assert response.json()["fileIntroSeen"] is True


async def test_perfil_traz_temas_na_ordem_da_lista_e_a_etapa() -> None:
    menina = registro(temas=(Topic.DESIGN, Topic.PROGRAMACAO), etapa=StudyStage.MEDIO)

    response = await ler_perfil(sessao_do_perfil(usuaria(), menina))

    corpo = response.json()
    assert corpo["topics"] == ["programacao", "design"]
    assert corpo["everything"] is False
    assert corpo["stage"] == StudyStage.MEDIO.value


async def test_perfil_de_quem_quer_de_tudo_vem_sem_temas() -> None:
    menina = registro(de_tudo=True, etapa=StudyStage.MEDIO)

    response = await ler_perfil(sessao_do_perfil(usuaria(), menina))

    corpo = response.json()
    assert corpo["topics"] == []
    assert corpo["everything"] is True


async def test_perfil_de_quem_nao_respondeu_a_a05_vem_sem_etapa() -> None:
    response = await ler_perfil(sessao_do_perfil(usuaria(), registro()))

    corpo = response.json()
    assert corpo["topics"] == []
    assert corpo["everything"] is False
    assert corpo["stage"] is None


async def test_perfil_diz_se_os_emails_de_oportunidade_estao_ligados() -> None:
    ligada = usuaria()
    ligada.opportunity_emails = True
    desligada = usuaria()
    desligada.opportunity_emails = False

    com = await ler_perfil(sessao_do_perfil(ligada, registro()))
    sem = await ler_perfil(sessao_do_perfil(desligada, registro()))

    assert com.json()["opportunityEmails"] is True
    assert sem.json()["opportunityEmails"] is False


async def test_perfil_nao_traz_dados_pessoais() -> None:
    response = await ler_perfil(sessao_do_perfil(usuaria(), registro()))

    assert set(response.json()) == {
        "fileIntroSeen",
        "topics",
        "everything",
        "stage",
        "opportunityEmails",
    }


async def test_perfil_de_conta_sem_registro_de_menina_responde_404() -> None:
    response = await ler_perfil(sessao_do_perfil(usuaria(), None))

    assert response.status_code == 404
    assert response.json() == {"error": "profile_not_found"}


async def test_perfil_sem_sessao_responde_401() -> None:
    response = await chamar_rota(
        app, "GET", "/api/profile", sessao_do_perfil(usuaria(), registro())
    )

    assert response.status_code == 401


async def test_perfil_e_so_para_menina() -> None:
    response = await ler_perfil(
        sessao_do_perfil(usuaria(role=Role.COORDINATOR), registro())
    )

    assert response.status_code == 403


async def test_perfil_exige_o_aceite_dos_termos() -> None:
    response = await ler_perfil(sessao_do_perfil(usuaria(), registro(), aceite=None))

    assert response.status_code == 403
    assert response.json() == {"error": "terms_not_accepted"}


# --- PUT /api/profile/file-intro-seen ----------------------------------------


async def test_depois_de_marcar_ela_e_avisada_que_viu() -> None:
    menina = registro()

    marcado = await marcar(sessao_do_perfil(usuaria(), menina))
    lido = await ler_perfil(sessao_do_perfil(usuaria(), menina))

    assert marcado.status_code == 204
    assert lido.json()["fileIntroSeen"] is True


async def test_marcar_duas_vezes_responde_igual_e_nao_grava_de_novo() -> None:
    menina = registro()
    primeira = sessao_do_perfil(usuaria(), menina)
    segunda = sessao_do_perfil(usuaria(), menina)

    resposta_1 = await marcar(primeira)
    resposta_2 = await marcar(segunda)

    assert resposta_1.status_code == resposta_2.status_code == 204
    assert menina.file_intro_seen is True
    primeira.commit.assert_awaited_once()
    segunda.commit.assert_not_called()


async def test_uma_menina_nao_marca_o_perfil_de_outra() -> None:
    # A menina 2 está logada e tenta apontar para o perfil da menina 1, pela
    # URL e pelo corpo. A rota ignora os dois e marca só o da sessão.
    menina_1 = registro(user_id=1)
    menina_2 = registro(user_id=2)
    sessao_falsa = sessao_do_perfil(usuaria(id=2), menina_2)

    response = await chamar_rota(
        app,
        "PUT",
        "/api/profile/file-intro-seen?user_id=1&girl_id=11",
        sessao_falsa,
        token=create_access_token(2),
        corpo={"userId": 1, "girlId": 11},
    )

    assert response.status_code == 204
    assert "girls.user_id = 2" in sql_da_busca(sessao_falsa)
    assert menina_2.file_intro_seen is True
    assert menina_1.file_intro_seen is False


async def test_marcar_em_conta_sem_registro_de_menina_responde_404() -> None:
    sessao_falsa = sessao_do_perfil(usuaria(), None)

    response = await marcar(sessao_falsa)

    assert response.status_code == 404
    assert response.json() == {"error": "profile_not_found"}
    sessao_falsa.commit.assert_not_called()


async def test_marcar_sem_sessao_responde_401() -> None:
    sessao_falsa = sessao_do_perfil(usuaria(), registro())

    response = await chamar_rota(
        app, "PUT", "/api/profile/file-intro-seen", sessao_falsa
    )

    assert response.status_code == 401
    sessao_falsa.commit.assert_not_called()


async def test_marcar_e_so_para_menina() -> None:
    menina = registro()
    sessao_falsa = sessao_do_perfil(usuaria(role=Role.COORDINATOR), menina)

    response = await marcar(sessao_falsa)

    assert response.status_code == 403
    assert menina.file_intro_seen is False
    sessao_falsa.commit.assert_not_called()


async def test_marcar_exige_o_aceite_dos_termos() -> None:
    menina = registro()
    sessao_falsa = sessao_do_perfil(usuaria(), menina, aceite=None)

    response = await marcar(sessao_falsa)

    assert response.status_code == 403
    assert response.json() == {"error": "terms_not_accepted"}
    assert menina.file_intro_seen is False


# --- OpenAPI -----------------------------------------------------------------


def test_openapi_mostra_as_rotas_do_perfil(client: TestClient) -> None:
    openapi = client.get("/openapi.json").json()

    assert "get" in openapi["paths"]["/api/profile"]
    assert "put" in openapi["paths"]["/api/profile/file-intro-seen"]
    assert list(openapi["components"]["schemas"]["ProfileOut"]["properties"]) == [
        "fileIntroSeen",
        "topics",
        "everything",
        "stage",
        "opportunityEmails",
    ]


def test_registro_novo_comeca_sem_ter_visto() -> None:
    coluna = Girl.__table__.c.file_intro_seen

    assert coluna.nullable is False
    assert str(coluna.server_default.arg) == "false"
