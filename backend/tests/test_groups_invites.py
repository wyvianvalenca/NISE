import argparse
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.modules.groups.exceptions import ExpiredInviteError, InvalidInviteError
from app.modules.groups.models import Group, Invite
from app.modules.groups.service import create_invite, get_valid_invite
from app.modules.groups.utils import new_invite_code
from scripts.criar_convite import positive_days

AGORA = datetime(2026, 11, 14, 12, 0, tzinfo=UTC)
RENDEIRAS = Group(id=7, name="Rendeiras")


def convite(expira_em: datetime) -> Invite:
    return Invite(
        id=1, code="codigo-ficticio", group_id=7, expires_at=expira_em, group=RENDEIRAS
    )


def sessao_que_acha(achado: Invite | None) -> AsyncMock:
    # session.scalar(select(Invite)...) devolve o convite, ou None.
    sessao_falsa = AsyncMock()
    sessao_falsa.scalar.return_value = achado
    return sessao_falsa


def test_codigo_novo_e_longo_e_nao_se_repete() -> None:
    codigos = {new_invite_code() for _ in range(50)}

    assert len(codigos) == 50
    assert all(len(codigo) == 22 for codigo in codigos)


async def test_convite_valido_volta_com_o_grupo() -> None:
    achado = convite(AGORA + timedelta(days=1))

    invite = await get_valid_invite(sessao_que_acha(achado), "codigo-ficticio", AGORA)

    assert invite is achado
    assert invite.group.name == "Rendeiras"


async def test_codigo_que_nao_existe_e_invalido_mas_nao_vencido() -> None:
    with pytest.raises(InvalidInviteError) as erro:
        await get_valid_invite(sessao_que_acha(None), "nao-existe", AGORA)

    assert not isinstance(erro.value, ExpiredInviteError)


async def test_convite_vence_no_instante_de_expires_at() -> None:
    sessao = sessao_que_acha(convite(AGORA))

    with pytest.raises(ExpiredInviteError):
        await get_valid_invite(sessao, "codigo-ficticio", AGORA)


def test_convite_vencido_tambem_e_convite_invalido() -> None:
    # O cadastro trata os dois do mesmo jeito: basta pegar InvalidInviteError.
    assert issubclass(ExpiredInviteError, InvalidInviteError)


async def test_criar_convite_grava_grupo_codigo_e_validade() -> None:
    sessao_falsa = AsyncMock()
    sessao_falsa.add = MagicMock()

    invite = await create_invite(sessao_falsa, RENDEIRAS, days=30, now=AGORA)

    sessao_falsa.add.assert_called_once_with(invite)
    sessao_falsa.commit.assert_awaited_once()
    assert invite.group_id == 7
    assert invite.expires_at == AGORA + timedelta(days=30)
    assert len(invite.code) == 22


def test_script_aceita_dias_positivos() -> None:
    assert positive_days("30") == 30


@pytest.mark.parametrize("dias", ["0", "-5"])
def test_script_recusa_convite_sem_validade(dias: str) -> None:
    with pytest.raises(argparse.ArgumentTypeError):
        positive_days(dias)
