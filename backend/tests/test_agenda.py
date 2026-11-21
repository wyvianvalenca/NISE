"""O item "Achamos seu nome numa lista de aprovados!" na agenda (#266).

Fictional data only: no real girl.
"""

from unittest.mock import AsyncMock

import pytest

from app.auth.utils import create_access_token
from app.main import app
from app.modules.girls.models import Girl
from app.users.models import Role, User
from tests.helpers import chamar_rota

MARIA = User(id=1, email="maria@exemplo.test", name="Maria Fictícia", role=Role.GIRL)
GIRL = Girl(id=3, email="maria@exemplo.test", name="Maria Fictícia", user_id=1)


def _sessao(usuaria: User, tem_indicio: bool, aceite: int | None = 10) -> AsyncMock:
    # get(User) para o login; scalar: 1º o aceite dos termos (o id, ou None),
    # 2º a menina da conta, 3º o EXISTS do indício.
    sessao_falsa = AsyncMock()
    sessao_falsa.get.return_value = usuaria
    sessao_falsa.scalar.side_effect = [aceite, GIRL, tem_indicio]
    return sessao_falsa


@pytest.mark.parametrize("tem_indicio", [True, False])
async def test_diz_so_se_existe_indicio_sem_resposta(tem_indicio: bool) -> None:
    sessao_falsa = _sessao(MARIA, tem_indicio)

    response = await chamar_rota(
        app, "GET", "/api/agenda/to-answer", sessao_falsa, token=create_access_token(1)
    )

    assert response.status_code == 200
    # Só o sim ou não: nenhuma lista, curso ou instituição (RNF-F31.02).
    assert response.json() == {"list_match": tem_indicio}


async def test_consulta_so_o_indicio_aberto_da_propria_menina() -> None:
    sessao_falsa = _sessao(MARIA, True)

    await chamar_rota(
        app, "GET", "/api/agenda/to-answer", sessao_falsa, token=create_access_token(1)
    )

    statement = sessao_falsa.scalar.call_args_list[2].args[0]
    sql = str(statement.compile(compile_kwargs={"literal_binds": True}))
    assert "list_matches.girl_id = 3" in sql
    assert "list_matches.answered_at IS NULL" in sql
    assert "list_matches.expires_at >" in sql


async def test_sem_o_aceite_da_versao_atual_dos_termos_da_403() -> None:
    # Mesma regra da A19 (RN-20): nem o sim ou não sai antes do aceite.
    sessao_falsa = _sessao(MARIA, True, aceite=None)

    response = await chamar_rota(
        app, "GET", "/api/agenda/to-answer", sessao_falsa, token=create_access_token(1)
    )

    assert response.status_code == 403
    assert response.json() == {"error": "terms_not_accepted"}
    assert sessao_falsa.scalar.await_count == 1


@pytest.mark.parametrize("papel", [Role.COORDINATOR, Role.NISE_TEAM])
async def test_coordenadora_e_curadoria_nao_recebem_nada(papel: Role) -> None:
    conta = User(id=2, email="conta@exemplo.test", name="Conta", role=papel)
    sessao_falsa = _sessao(conta, True)

    response = await chamar_rota(
        app, "GET", "/api/agenda/to-answer", sessao_falsa, token=create_access_token(2)
    )

    assert response.status_code == 403
    sessao_falsa.scalar.assert_not_called()


async def test_sem_login_da_401() -> None:
    response = await chamar_rota(
        app, "GET", "/api/agenda/to-answer", _sessao(MARIA, True)
    )

    assert response.status_code == 401
