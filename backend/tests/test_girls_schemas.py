import pytest
from pydantic import ValidationError

from app.modules.girls.models import StudyStage, Topic
from app.modules.girls.schemas import InterestsIn

# Como a A05 manda. Dados fictícios.
UM_TEMA = {"topics": ["robotica"], "everything": False, "stage": "medio"}


def test_um_tema_e_a_etapa() -> None:
    dados = InterestsIn.model_validate(UM_TEMA)

    assert dados.topics == [Topic.ROBOTICA]
    assert dados.everything is False
    assert dados.stage is StudyStage.MEDIO


def test_varios_temas_na_ordem_escolhida() -> None:
    dados = InterestsIn.model_validate(
        {**UM_TEMA, "topics": ["programacao", "ia", "jogos"]}
    )

    assert dados.topics == [Topic.PROGRAMACAO, Topic.IA, Topic.JOGOS]


def test_todos_os_temas() -> None:
    dados = InterestsIn.model_validate(
        {**UM_TEMA, "topics": [topic.value for topic in Topic]}
    )

    assert dados.topics == list(Topic)


def test_me_mostra_de_tudo_sozinho() -> None:
    dados = InterestsIn.model_validate(
        {"topics": [], "everything": True, "stage": "tecnico"}
    )

    assert dados.topics == []
    assert dados.everything is True


def test_tema_repetido_vale_uma_vez() -> None:
    dados = InterestsIn.model_validate(
        {**UM_TEMA, "topics": ["dados", "robotica", "dados"]}
    )

    assert dados.topics == [Topic.DADOS, Topic.ROBOTICA]


@pytest.mark.parametrize(
    "corpo",
    [
        # Não há "Pular por agora" (D-19): sem tema e sem "me mostra de tudo".
        {**UM_TEMA, "topics": []},
        {"everything": False, "stage": "medio"},
        # "Me mostra de tudo" junto com um tema.
        {**UM_TEMA, "everything": True},
        # Códigos fora das listas.
        {**UM_TEMA, "topics": ["culinaria"]},
        {**UM_TEMA, "topics": ["Robótica"]},
        {**UM_TEMA, "stage": "mestrado"},
        # A etapa é obrigatória.
        {"topics": ["robotica"], "everything": False},
        {**UM_TEMA, "stage": None},
        # Tipos errados.
        {**UM_TEMA, "everything": "false"},
        {**UM_TEMA, "topics": "robotica"},
        {"topics": ["robotica"], "stage": "medio"},
        # Mais itens do que existem temas.
        {**UM_TEMA, "topics": ["robotica"] * (len(Topic) + 1)},
    ],
)
def test_escolha_invalida_e_recusada(corpo: dict[str, object]) -> None:
    with pytest.raises(ValidationError):
        InterestsIn.model_validate(corpo)
