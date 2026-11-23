from unittest.mock import AsyncMock

from app.modules.girls.models import Girl, GirlTopic, StudyStage, Topic
from app.modules.girls.schemas import InterestsIn
from app.modules.girls.service import save_interests

# Dados fictícios.


def menina(
    temas: list[Topic] | None = None,
    me_mostra_de_tudo: bool = False,
    etapa: StudyStage | None = None,
) -> Girl:
    return Girl(
        id=3,
        email="alana@exemplo.com",
        name="Alana Ficticia",
        user_id=1,
        topics=[GirlTopic(topic=tema) for tema in temas or []],
        all_topics=me_mostra_de_tudo,
        study_stage=etapa,
    )


def sessao_com_menina(registro: Girl | None) -> AsyncMock:
    # session.scalar devolve o registro da menina com os temas já carregados.
    sessao_falsa = AsyncMock()
    sessao_falsa.scalar.return_value = registro
    return sessao_falsa


def escolha(
    temas: list[str], me_mostra_de_tudo: bool = False, etapa: str = "medio"
) -> InterestsIn:
    # Como a A05 manda: códigos em texto.
    return InterestsIn.model_validate(
        {"topics": temas, "everything": me_mostra_de_tudo, "stage": etapa}
    )


def temas_de(registro: Girl) -> list[Topic]:
    return [item.topic for item in registro.topics]


async def test_primeira_escolha_grava_temas_e_etapa() -> None:
    registro = menina()
    sessao_falsa = sessao_com_menina(registro)

    gravou = await save_interests(sessao_falsa, 1, escolha(["robotica"]))

    assert gravou is True
    assert temas_de(registro) == [Topic.ROBOTICA]
    assert registro.all_topics is False
    assert registro.study_stage is StudyStage.MEDIO
    sessao_falsa.commit.assert_awaited_once()


async def test_varios_temas_viram_uma_linha_cada() -> None:
    registro = menina()

    await save_interests(
        sessao_com_menina(registro), 1, escolha(["programacao", "ia", "jogos"])
    )

    assert temas_de(registro) == [Topic.PROGRAMACAO, Topic.IA, Topic.JOGOS]


async def test_trocar_temas_mantem_a_linha_do_que_continua() -> None:
    # Dados continua, Robótica sai e Jogos entra. A linha de Dados é a mesma,
    # para não gravar o mesmo tema duas vezes (UniqueConstraint).
    registro = menina([Topic.ROBOTICA, Topic.DADOS], etapa=StudyStage.MEDIO)
    linha_de_dados = registro.topics[1]

    await save_interests(
        sessao_com_menina(registro), 1, escolha(["dados", "jogos"], etapa="tecnico")
    )

    assert temas_de(registro) == [Topic.DADOS, Topic.JOGOS]
    assert registro.topics[0] is linha_de_dados
    assert registro.study_stage is StudyStage.TECNICO


async def test_me_mostra_de_tudo_apaga_os_temas() -> None:
    registro = menina([Topic.ROBOTICA, Topic.DADOS])

    await save_interests(
        sessao_com_menina(registro), 1, escolha([], me_mostra_de_tudo=True)
    )

    assert registro.topics == []
    assert registro.all_topics is True


async def test_escolher_tema_depois_desliga_o_me_mostra_de_tudo() -> None:
    registro = menina(me_mostra_de_tudo=True)

    await save_interests(sessao_com_menina(registro), 1, escolha(["design"]))

    assert temas_de(registro) == [Topic.DESIGN]
    assert registro.all_topics is False


async def test_conta_sem_registro_de_menina_nao_grava() -> None:
    sessao_falsa = sessao_com_menina(None)

    gravou = await save_interests(sessao_falsa, 1, escolha(["robotica"]))

    assert gravou is False
    sessao_falsa.commit.assert_not_called()


async def test_procura_o_registro_da_menina_da_sessao() -> None:
    sessao_falsa = sessao_com_menina(menina())

    await save_interests(sessao_falsa, 1, escolha(["robotica"]))

    consulta = sessao_falsa.scalar.call_args.args[0]
    sql = str(consulta.compile(compile_kwargs={"literal_binds": True}))
    assert "girls.user_id = 1" in sql
