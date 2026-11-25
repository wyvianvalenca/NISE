"""#392 · Mudar meus interesses e o momento de estudo (A05 em modo edição).

A rota é a mesma do cadastro (PUT /api/profile/interests), então aqui ficam os
critérios da troca: o que muda no perfil, o que as próximas sugestões fazem e
o que fica no filé. Sem cookie (401), coordenadora (403) e sem aceite dos
termos já têm teste em test_girls_interests_routes.py. Que o perfil das regras
use só temas, etapa e idade (C8) está em
test_suggestions_service.py::test_perfil_usa_so_temas_etapa_e_idade.
Dados fictícios.
"""

import logging

import pytest
from sqlalchemy.exc import SQLAlchemyError

from app.auth.utils import create_access_token
from app.main import app
from app.modules.girl_file.models import FileStatus
from app.modules.girls.models import Girl, GirlTopic, StudyStage, Topic
from tests.helpers import chamar_rota
from tests.test_girls_interests_routes import (
    alana,
    gravar,
    sessao_da_gravacao,
)
from tests.test_suggestions_service import escolha, ids, item, perfil


def menina_de(
    temas: list[Topic], etapa: StudyStage, me_mostra_de_tudo: bool = False
) -> Girl:
    return Girl(
        id=3,
        email="alana@exemplo.com",
        name="Alana Ficticia",
        user_id=1,
        topics=[GirlTopic(topic=tema) for tema in temas],
        all_topics=me_mostra_de_tudo,
        study_stage=etapa,
    )


def temas_de(registro: Girl) -> list[Topic]:
    return [linha.topic for linha in registro.topics]


# C1/C3: trocar temas e etapa


async def test_c3_trocar_de_robotica_e_fundamental_para_dados_ia_e_medio() -> None:
    registro = menina_de([Topic.ROBOTICA], StudyStage.FUNDAMENTAL)
    sessao_falsa = sessao_da_gravacao(alana(), registro)

    response = await gravar(
        sessao_falsa,
        {"topics": ["dados", "ia"], "everything": False, "stage": "medio"},
    )

    assert response.status_code == 204
    assert temas_de(registro) == [Topic.DADOS, Topic.IA]
    assert registro.study_stage is StudyStage.MEDIO
    assert registro.all_topics is False
    sessao_falsa.commit.assert_awaited_once()


async def test_c3_sair_de_ver_de_tudo_para_temas() -> None:
    registro = menina_de([], StudyStage.MEDIO, me_mostra_de_tudo=True)

    response = await gravar(
        sessao_da_gravacao(alana(), registro),
        {"topics": ["jogos"], "everything": False, "stage": "medio"},
    )

    assert response.status_code == 204
    assert temas_de(registro) == [Topic.JOGOS]
    assert registro.all_topics is False


# C2: todos os temas, todas as etapas e "me mostra de tudo"


@pytest.mark.parametrize("tema", list(Topic), ids=lambda tema: tema.value)
async def test_c2_cada_tema_e_aceito(tema: Topic) -> None:
    registro = menina_de([Topic.DADOS], StudyStage.MEDIO)

    response = await gravar(
        sessao_da_gravacao(alana(), registro),
        {"topics": [tema.value], "everything": False, "stage": "medio"},
    )

    assert response.status_code == 204
    assert temas_de(registro) == [tema]


@pytest.mark.parametrize("etapa", list(StudyStage), ids=lambda etapa: etapa.value)
async def test_c2_cada_etapa_e_aceita(etapa: StudyStage) -> None:
    registro = menina_de([Topic.DADOS], StudyStage.MEDIO)

    response = await gravar(
        sessao_da_gravacao(alana(), registro),
        {"topics": ["dados"], "everything": False, "stage": etapa.value},
    )

    assert response.status_code == 204
    assert registro.study_stage is etapa


def test_c2_a_tela_tem_8_temas_e_5_etapas() -> None:
    # A lista da A05 tem de ser a que o teste acima percorre.
    assert len(Topic) == 8
    assert len(StudyStage) == 5


async def test_c2_me_mostra_de_tudo_sozinho_e_aceito_e_zera_os_temas() -> None:
    registro = menina_de([Topic.DADOS, Topic.IA], StudyStage.MEDIO)

    response = await gravar(
        sessao_da_gravacao(alana(), registro),
        {"topics": [], "everything": True, "stage": "medio"},
    )

    assert response.status_code == 204
    assert registro.topics == []
    assert registro.all_topics is True


# C4: as próximas sugestões seguem o novo perfil (RF-F10.10)


def test_c4_da_etapa_fundamental_para_medio_a_proxima_rodada_segue_a_nova() -> None:
    so_do_fundamental = item(1, [Topic.PROGRAMACAO], stages=[StudyStage.FUNDAMENTAL])
    so_do_medio = item(2, [Topic.PROGRAMACAO], stages=[StudyStage.MEDIO])
    catalogo = [so_do_fundamental, so_do_medio]

    antes = perfil(Topic.PROGRAMACAO, stage=StudyStage.FUNDAMENTAL)
    depois = perfil(Topic.PROGRAMACAO, stage=StudyStage.MEDIO)

    assert ids(catalogo, antes, []) == ["curadoria-1"]
    assert ids(catalogo, depois, []) == ["curadoria-2"]


def test_c4_a_troca_de_tema_muda_o_que_e_sugerido() -> None:
    de_robotica = item(1, [Topic.ROBOTICA])
    de_dados = item(2, [Topic.DADOS])
    catalogo = [de_robotica, de_dados]

    assert ids(catalogo, perfil(Topic.ROBOTICA), []) == ["curadoria-1"]
    assert ids(catalogo, perfil(Topic.DADOS), []) == ["curadoria-2"]


@pytest.mark.parametrize("status", list(FileStatus), ids=lambda s: s.value)
def test_c4_o_que_ela_ja_decidiu_nao_volta_depois_da_troca_de_tema(
    status: FileStatus,
) -> None:
    decidido = item(1, [Topic.DADOS])
    catalogo = [decidido, item(2, [Topic.DADOS])]
    novo_perfil = perfil(Topic.DADOS)

    resultado = ids(catalogo, novo_perfil, [escolha(decidido, status)])

    # "Não deu" só esconde o item enquanto ele não foi adiado (#190): o catálogo
    # só tem itens futuros, então ele volta. Os outros status ficam fora.
    if status is FileStatus.DID_NOT_GO:
        assert resultado == ["curadoria-1", "curadoria-2"]
    else:
        assert resultado == ["curadoria-2"]


async def test_c4_a_troca_nao_apaga_nada_do_file() -> None:
    # Itens no filé de um tema abandonado ficam: só param os novos. Salvar só
    # lê a menina e troca os temas dela; não apaga linha de file_entries.
    registro = menina_de([Topic.ROBOTICA], StudyStage.FUNDAMENTAL)
    sessao_falsa = sessao_da_gravacao(alana(), registro)

    response = await gravar(
        sessao_falsa,
        {"topics": ["dados"], "everything": False, "stage": "medio"},
    )

    assert response.status_code == 204
    sessao_falsa.delete.assert_not_called()
    sessao_falsa.execute.assert_not_called()
    consultas = [
        str(chamada.args[0]).upper() for chamada in sessao_falsa.scalar.call_args_list
    ]
    assert len(consultas) == 2
    assert all(consulta.lstrip().startswith("SELECT") for consulta in consultas)
    assert not any("FILE_ENTRIES" in consulta for consulta in consultas)


# C6: sem tema e sem "me mostra de tudo" não salva


async def test_c6_sem_tema_e_sem_ver_de_tudo_o_servidor_recusa() -> None:
    registro = menina_de([Topic.DADOS], StudyStage.MEDIO)
    sessao_falsa = sessao_da_gravacao(alana(), registro)

    response = await gravar(
        sessao_falsa, {"topics": [], "everything": False, "stage": "medio"}
    )

    assert response.status_code == 422
    assert temas_de(registro) == [Topic.DADOS]
    sessao_falsa.commit.assert_not_called()


# C7: se salvar falha, a rota não diz que deu certo


async def test_c7_se_o_commit_falha_o_erro_sobe_e_nao_ha_204() -> None:
    sessao_falsa = sessao_da_gravacao(
        alana(), menina_de([Topic.ROBOTICA], StudyStage.MEDIO)
    )
    sessao_falsa.commit.side_effect = SQLAlchemyError("falha ficticia")

    # O ASGITransport repassa a exceção; num servidor de verdade, vira 500, e
    # a tela mostra "Não deu pra salvar. Tente de novo." (e2e).
    with pytest.raises(SQLAlchemyError):
        await gravar(
            sessao_falsa,
            {"topics": ["dados"], "everything": False, "stage": "medio"},
        )

    sessao_falsa.commit.assert_awaited_once()


# C8: nada da escolha vai para o log


async def test_c8_nenhum_tema_etapa_nome_ou_email_vai_para_o_log(
    caplog: pytest.LogCaptureFixture,
) -> None:
    registro = menina_de([Topic.ROBOTICA], StudyStage.FUNDAMENTAL)

    with caplog.at_level(logging.DEBUG):
        response = await gravar(
            sessao_da_gravacao(alana(), registro),
            {
                "topics": ["dados", "ciberseguranca"],
                "everything": False,
                "stage": "medio",
            },
        )

    assert response.status_code == 204
    texto = caplog.text.lower()
    for dado in (
        "dados",
        "ciberseguranca",
        "robotica",
        "medio",
        "fundamental",
        "alana",
        "exemplo.com",
    ):
        assert dado not in texto


# Permissão: só a própria menina muda o próprio perfil (RNF-G.03)


async def test_a_consulta_do_put_filtra_pela_usuaria_da_sessao() -> None:
    sessao_falsa = sessao_da_gravacao(
        alana(), menina_de([Topic.ROBOTICA], StudyStage.MEDIO)
    )

    await gravar(
        sessao_falsa, {"topics": ["dados"], "everything": False, "stage": "medio"}
    )

    # A sessão falsa ignora o WHERE: o filtro só se vê no SQL. A 1ª consulta é
    # a do aceite dos termos; a 2ª, a da menina.
    menina_buscada = sessao_falsa.scalar.call_args_list[1].args[0]
    sql = str(menina_buscada.compile(compile_kwargs={"literal_binds": True}))
    assert "girls.user_id = 1" in sql


async def test_a_consulta_do_put_carrega_os_temas_com_selectinload() -> None:
    # No SQLAlchemy assíncrono, ler girl.topics sem carregar antes dá erro:
    # a consulta da menina tem de trazer a opção selectinload.
    sessao_falsa = sessao_da_gravacao(
        alana(), menina_de([Topic.ROBOTICA], StudyStage.MEDIO)
    )

    await gravar(
        sessao_falsa, {"topics": ["dados"], "everything": False, "stage": "medio"}
    )

    menina_buscada = sessao_falsa.scalar.call_args_list[1].args[0]
    # Cada opção guarda o caminho (Girl.topics) e a estratégia (selectin).
    passos = [
        passo for opcao in menina_buscada._with_options for passo in opcao.context
    ]
    assert len(passos) == 1
    assert "Girl.topics" in str(passos[0].path)
    assert passos[0].strategy == (("lazy", "selectin"),)


async def test_nao_existe_rota_de_interesses_com_id_na_url() -> None:
    # Ela só muda o próprio perfil, o da sessão: não há /interests/<id>.
    sessao_falsa = sessao_da_gravacao(
        alana(), menina_de([Topic.ROBOTICA], StudyStage.MEDIO)
    )

    response = await chamar_rota(
        app,
        "PUT",
        "/api/profile/interests/3",
        sessao_falsa,
        token=create_access_token(1),
        corpo={"topics": ["dados"], "everything": False, "stage": "medio"},
    )

    assert response.status_code in (404, 405)
    sessao_falsa.commit.assert_not_called()
