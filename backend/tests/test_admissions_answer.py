"""A19 "É você na lista?": o card e a resposta da menina (#271).

Fictional data only: no real girl.
"""

from collections.abc import Iterator
from datetime import UTC, date, datetime, timedelta
from unittest.mock import AsyncMock, MagicMock

import pytest
from httpx2 import Response

from app.auth.utils import create_access_token
from app.main import app
from app.modules.admissions.exceptions import (
    MatchAlreadyAnsweredError,
    MatchNotFoundError,
)
from app.modules.admissions.models import (
    AdmissionOrigin,
    Approval,
    CourseLevel,
    DismissedMatch,
    Enrollment,
    ListMatch,
    OfficialList,
)
from app.modules.admissions.schemas import MatchAnswerIn, MatchResult
from app.modules.admissions.service import answer_match
from app.modules.girls.models import Girl
from app.users.models import Role, User
from tests.helpers import chamar_rota

AGORA = datetime(2026, 11, 18, 2, 0, tzinfo=UTC)  # 23h do dia 17 em Maceió
MARIA = User(id=1, email="maria@exemplo.test", name="Maria Fictícia", role=Role.GIRL)
GIRL = Girl(id=3, email="maria@exemplo.test", name="Maria Eduarda Fictícia", user_id=1)


def _lista() -> OfficialList:
    return OfficialList(
        id=7,
        institution="UFAL",
        selection_process="Sisu 2027",
        call="1ª chamada",
        url="https://exemplo.test/lista",
    )


def _indicio(**campos: object) -> ListMatch:
    indicio = ListMatch(
        id=11,
        girl_id=3,
        official_list_id=7,
        official_list=_lista(),
        course="Ciência da Computação",
        level=CourseLevel.GRADUACAO,
        expires_at=AGORA + timedelta(days=10),
        answered_at=None,
    )
    for nome, valor in campos.items():
        setattr(indicio, nome, valor)
    return indicio


def _sessao(indicio: ListMatch | None) -> AsyncMock:
    sessao_falsa = AsyncMock()
    sessao_falsa.scalar.return_value = indicio
    sessao_falsa.add = MagicMock()
    return sessao_falsa


def _gravado(sessao_falsa: AsyncMock) -> list[object]:
    return [chamada.args[0] for chamada in sessao_falsa.add.call_args_list]


# --- Serviço -----------------------------------------------------------------


async def test_sou_eu_e_ja_me_matriculei_grava_o_ingresso_com_data_e_origem() -> None:
    indicio = _indicio()
    sessao_falsa = _sessao(indicio)

    resultado = await answer_match(
        sessao_falsa, 3, 11, MatchAnswerIn(is_me=True, enrolled=True), AGORA
    )

    assert resultado is MatchResult.ENROLLED
    [ingresso] = _gravado(sessao_falsa)
    assert isinstance(ingresso, Enrollment)
    assert ingresso.origin is AdmissionOrigin.OFFICIAL_LIST
    assert ingresso.official_list_id == 7
    assert (ingresso.course, ingresso.institution) == ("Ciência da Computação", "UFAL")
    # O dia é o de Maceió, não o de UTC.
    assert ingresso.enrolled_on == date(2026, 11, 17)
    assert indicio.answered_at == AGORA
    sessao_falsa.commit.assert_awaited_once()


async def test_sou_eu_e_ainda_nao_grava_aprovacao_e_nao_ingresso() -> None:
    sessao_falsa = _sessao(_indicio())

    resultado = await answer_match(
        sessao_falsa, 3, 11, MatchAnswerIn(is_me=True, enrolled=False), AGORA
    )

    assert resultado is MatchResult.APPROVED
    [aprovacao] = _gravado(sessao_falsa)
    assert isinstance(aprovacao, Approval)
    assert aprovacao.origin is AdmissionOrigin.OFFICIAL_LIST
    assert not any(isinstance(item, Enrollment) for item in _gravado(sessao_falsa))


async def test_nao_sou_eu_apaga_o_indicio_e_deixa_so_a_marca() -> None:
    indicio = _indicio()
    sessao_falsa = _sessao(indicio)

    resultado = await answer_match(
        sessao_falsa, 3, 11, MatchAnswerIn(is_me=False), AGORA
    )

    assert resultado is MatchResult.DISMISSED
    [marca] = _gravado(sessao_falsa)
    assert isinstance(marca, DismissedMatch)
    sessao_falsa.delete.assert_awaited_once_with(indicio)


async def test_responder_duas_vezes_e_recusado() -> None:
    sessao_falsa = _sessao(_indicio(answered_at=AGORA - timedelta(days=1)))

    with pytest.raises(MatchAlreadyAnsweredError):
        await answer_match(
            sessao_falsa, 3, 11, MatchAnswerIn(is_me=True, enrolled=True), AGORA
        )

    sessao_falsa.add.assert_not_called()


async def test_indicio_vencido_e_recusado() -> None:
    sessao_falsa = _sessao(_indicio(expires_at=AGORA))

    with pytest.raises(MatchNotFoundError):
        await answer_match(sessao_falsa, 3, 11, MatchAnswerIn(is_me=False), AGORA)


async def test_indicio_apagado_ou_de_outra_menina_e_recusado() -> None:
    # A consulta filtra pela menina: o de outra volta como se não existisse.
    sessao_falsa = _sessao(None)

    with pytest.raises(MatchNotFoundError):
        await answer_match(sessao_falsa, 3, 11, MatchAnswerIn(is_me=False), AGORA)

    statement = sessao_falsa.scalar.call_args.args[0]
    sql = str(statement.compile(compile_kwargs={"literal_binds": True}))
    assert "list_matches.girl_id = 3" in sql
    assert "FOR UPDATE" in sql


def test_sou_eu_sem_dizer_se_matriculou_e_recusado() -> None:
    with pytest.raises(ValueError):
        MatchAnswerIn(is_me=True)


# --- Rotas -------------------------------------------------------------------


@pytest.fixture
def token_maria() -> Iterator[str]:
    yield create_access_token(MARIA.id)


ACEITE_DOS_TERMOS = 10


def _sessao_rota(
    usuaria: User,
    menina: Girl | None,
    indicio: object,
    aceite: int | None = ACEITE_DOS_TERMOS,
) -> AsyncMock:
    # get(User) para o login; scalar: 1º o aceite dos termos (o id, ou None),
    # 2º a menina da conta, 3º o indício.
    sessao_falsa = AsyncMock()
    sessao_falsa.get.return_value = usuaria
    sessao_falsa.scalar.side_effect = [aceite, menina, indicio]
    sessao_falsa.scalars.return_value = MagicMock(
        all=MagicMock(return_value=[indicio] if indicio else [])
    )
    sessao_falsa.add = MagicMock()
    return sessao_falsa


async def test_card_traz_o_nome_dela_e_a_chamada(token_maria: str) -> None:
    sessao_falsa = _sessao_rota(MARIA, GIRL, _indicio())

    response = await chamar_rota(
        app, "GET", "/api/matches", sessao_falsa, token=token_maria
    )

    assert response.status_code == 200
    [card] = response.json()
    assert card["name"] == "Maria Eduarda Fictícia"
    assert card["institution"] == "UFAL"
    assert card["selection_process"] == "Sisu 2027"
    assert card["call"] == "1ª chamada"
    assert card["course"] == "Ciência da Computação"
    assert card["list_url"] == "https://exemplo.test/lista"


async def test_resposta_pela_rota(token_maria: str) -> None:
    sessao_falsa = _sessao_rota(
        MARIA, GIRL, _indicio(expires_at=datetime(2999, 1, 1, tzinfo=UTC))
    )

    response = await chamar_rota(
        app,
        "POST",
        "/api/matches/11/answer",
        sessao_falsa,
        token=token_maria,
        corpo={"is_me": True, "enrolled": False},
    )

    assert response.status_code == 200
    assert response.json() == {"result": "approved"}


async def test_responder_de_novo_pela_rota_da_409(token_maria: str) -> None:
    indicio = _indicio(expires_at=datetime(2999, 1, 1, tzinfo=UTC), answered_at=AGORA)
    sessao_falsa = _sessao_rota(MARIA, GIRL, indicio)

    response = await chamar_rota(
        app,
        "POST",
        "/api/matches/11/answer",
        sessao_falsa,
        token=token_maria,
        corpo={"is_me": False},
    )

    assert response.status_code == 409


async def test_indicio_de_outra_menina_pela_rota_da_404(token_maria: str) -> None:
    sessao_falsa = _sessao_rota(MARIA, GIRL, None)

    response = await chamar_rota(
        app,
        "POST",
        "/api/matches/99/answer",
        sessao_falsa,
        token=token_maria,
        corpo={"is_me": False},
    )

    assert response.status_code == 404


async def test_sou_eu_sem_matricula_pela_rota_da_422(token_maria: str) -> None:
    sessao_falsa = _sessao_rota(MARIA, GIRL, _indicio())

    response = await chamar_rota(
        app,
        "POST",
        "/api/matches/11/answer",
        sessao_falsa,
        token=token_maria,
        corpo={"is_me": True},
    )

    assert response.status_code == 422
    sessao_falsa.add.assert_not_called()


@pytest.mark.parametrize("papel", [Role.COORDINATOR, Role.NISE_TEAM])
@pytest.mark.parametrize(
    ("metodo", "url", "corpo"),
    [
        ("GET", "/api/matches", None),
        ("POST", "/api/matches/11/answer", {"is_me": False}),
    ],
)
async def test_coordenadora_e_curadoria_nao_veem_nem_respondem(
    papel: Role, metodo: str, url: str, corpo: dict[str, object] | None
) -> None:
    conta = User(id=2, email="conta@exemplo.test", name="Conta", role=papel)
    sessao_falsa = _sessao_rota(conta, GIRL, _indicio())

    response: Response = await chamar_rota(
        app, metodo, url, sessao_falsa, token=create_access_token(2), corpo=corpo
    )

    assert response.status_code == 403
    # Nem chegou a procurar a menina ou o indício.
    sessao_falsa.scalar.assert_not_called()
    sessao_falsa.scalars.assert_not_called()


async def test_sem_login_da_401() -> None:
    response = await chamar_rota(app, "GET", "/api/matches", _sessao(None))

    assert response.status_code == 401


@pytest.mark.parametrize(
    ("metodo", "url", "corpo"),
    [
        ("GET", "/api/matches", None),
        ("POST", "/api/matches/11/answer", {"is_me": True, "enrolled": True}),
    ],
)
async def test_sem_o_aceite_da_versao_atual_dos_termos_da_403(
    token_maria: str, metodo: str, url: str, corpo: dict[str, object] | None
) -> None:
    # RN-20: a comparação com listas oficiais depende dos termos. Quando a
    # equipe publica uma versão nova, ela não vê nem responde até aceitar.
    sessao_falsa = _sessao_rota(MARIA, GIRL, _indicio(), aceite=None)

    response = await chamar_rota(
        app, metodo, url, sessao_falsa, token=token_maria, corpo=corpo
    )

    assert response.status_code == 403
    assert response.json() == {"error": "terms_not_accepted"}
    # Parou no aceite: não procurou a menina nem o indício, e não gravou nada.
    assert sessao_falsa.scalar.await_count == 1
    sessao_falsa.scalars.assert_not_called()
    sessao_falsa.add.assert_not_called()
    sessao_falsa.commit.assert_not_awaited()
