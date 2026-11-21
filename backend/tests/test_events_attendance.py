"""O filé muda pela presença que a coordenadora registra (#196, com a #337).

`apply_attendance` é a função que a presença da C3 (#135) chama. Enquanto a C3
não a chama, ela é testada aqui com uma sessão falsa e dados fictícios.
"""

from datetime import date
from unittest.mock import AsyncMock, MagicMock

import pytest
from sqlalchemy.exc import IntegrityError

from app.modules.events.service import apply_attendance
from app.modules.girl_file.models import DismissReason, FileEntry, FileStatus
from tests.helpers import sql_do_postgres

HOJE = date(2026, 11, 19)
GRUPO = 1
ACAO = 7


def linha(girl_id: int, status: FileStatus) -> FileEntry:
    return FileEntry(id=girl_id + 100, girl_id=girl_id, action_id=ACAO, status=status)


def sessao(
    inscritas: list[int] | None,
    linhas: list[FileEntry],
    grupo_da_acao: int | None = GRUPO,
) -> AsyncMock:
    """session.scalar responde o grupo da ação; session.scalars responde, em
    ordem, quem veio entre as inscritas da ação (se alguém veio) e as linhas
    no filé."""
    sessao_falsa = AsyncMock()
    sessao_falsa.scalar.return_value = grupo_da_acao
    respostas: list[object] = [linhas] if inscritas is None else [inscritas, linhas]
    sessao_falsa.scalars.side_effect = respostas
    sessao_falsa.add = MagicMock()
    # session.begin_nested() é usado com "async with" (um savepoint).
    sessao_falsa.begin_nested = MagicMock()
    return sessao_falsa


async def concluir(
    sessao_falsa: AsyncMock, presentes: list[int], grupo: int = GRUPO
) -> bool:
    return await apply_attendance(
        sessao_falsa, grupo, ACAO, presentes, HOJE, concluding=True
    )


async def marcar_depois(sessao_falsa: AsyncMock, presentes: list[int]) -> bool:
    return await apply_attendance(
        sessao_falsa, GRUPO, ACAO, presentes, HOJE, concluding=False
    )


# --- "Concluir presença" ------------------------------------------------------


async def test_presente_inscrita_fica_concluida_com_o_dia() -> None:
    inscrita = linha(3, FileStatus.SIGNED_UP)
    sessao_falsa = sessao([3], [inscrita])

    assert await concluir(sessao_falsa, [3])

    assert inscrita.status is FileStatus.CONCLUDED
    assert inscrita.concluded_on == HOJE
    sessao_falsa.flush.assert_awaited_once()
    # Quem chamou faz o commit, junto com a presença.
    sessao_falsa.commit.assert_not_called()


async def test_quem_nao_veio_e_estava_inscrita_sai_do_file() -> None:
    veio = linha(3, FileStatus.SIGNED_UP)
    faltou = linha(4, FileStatus.SIGNED_UP)
    sessao_falsa = sessao([3], [veio, faltou])

    assert await concluir(sessao_falsa, [3])

    assert veio.status is FileStatus.CONCLUDED
    sessao_falsa.delete.assert_awaited_once_with(faltou)


async def test_inscrita_no_file_que_nao_esta_na_lista_tambem_sai() -> None:
    # Ela marcou "Já me inscrevi", mas não está nas inscritas da ação: a
    # coordenadora não tinha como marcá-la, então ela não veio. Sem isso, o
    # evento esperaria a presença para sempre.
    fora_da_lista = linha(8, FileStatus.SIGNED_UP)
    sessao_falsa = sessao(None, [fora_da_lista])

    assert await concluir(sessao_falsa, [])

    sessao_falsa.delete.assert_awaited_once_with(fora_da_lista)


async def test_ao_concluir_trava_todas_as_linhas_da_acao() -> None:
    # Em qualquer status: um "Já me inscrevi" ao mesmo tempo, numa linha que
    # ainda é próxima, espera a conclusão e então vê a presença concluída.
    sessao_falsa = sessao([3], [linha(3, FileStatus.SIGNED_UP)])

    await concluir(sessao_falsa, [3])

    busca = sessao_falsa.scalars.await_args_list[1].args[0]
    sql = sql_do_postgres(busca)
    assert "FOR UPDATE" in sql
    # Sempre na mesma ordem: duas chamadas ao mesmo tempo não dão deadlock.
    assert "ORDER BY file_entries.id" in sql
    assert "status" not in sql.split("WHERE")[1]
    assert "girl_id" not in sql.split("WHERE")[1]


@pytest.mark.parametrize(
    "status", [FileStatus.NEXT, FileStatus.LATER, FileStatus.CONCLUDED]
)
async def test_quem_nao_veio_sem_estar_inscrita_nao_muda(status: FileStatus) -> None:
    # Só o evento em que ela marcou "Já me inscrevi" sai (RF-F10.24); a busca
    # já só traz as inscritas, mas uma linha fora disso também não muda.
    escolha = linha(4, status)
    sessao_falsa = sessao(None, [escolha])

    assert await concluir(sessao_falsa, [])

    sessao_falsa.delete.assert_not_called()
    assert escolha.status is status


async def test_presente_sem_linha_no_file_ganha_o_evento_concluido() -> None:
    # Veio sem inscrição, ou nunca escolheu o evento no filé: a linha é criada,
    # já concluída (#337, RF-F3.03, D-81).
    sessao_falsa = sessao([6], [])

    assert await concluir(sessao_falsa, [6])

    criada = sessao_falsa.add.call_args.args[0]
    assert isinstance(criada, FileEntry)
    assert (criada.girl_id, criada.action_id, criada.curated_item_id) == (6, ACAO, None)
    assert criada.status is FileStatus.CONCLUDED
    assert criada.concluded_on == HOJE


async def test_escolha_ao_mesmo_tempo_nao_derruba_a_presenca() -> None:
    # Ela tocou "Quero fazer" no mesmo instante: o banco recusa a segunda linha,
    # e a linha dela é concluída no lugar.
    criada_por_ela = linha(6, FileStatus.NEXT)
    sessao_falsa = sessao([6], [])
    sessao_falsa.begin_nested.return_value.__aexit__.side_effect = IntegrityError(
        "insert", {}, Exception("duplicada")
    )
    sessao_falsa.scalar.side_effect = [GRUPO, criada_por_ela]

    assert await concluir(sessao_falsa, [6])

    assert criada_por_ela.status is FileStatus.CONCLUDED
    assert criada_por_ela.concluded_on == HOJE
    sessao_falsa.flush.assert_awaited_once()


async def test_presente_que_tinha_dispensado_fica_concluida_sem_o_motivo() -> None:
    dispensada = linha(3, FileStatus.DISMISSED)
    dispensada.dismiss_reason = DismissReason.SEM_TEMPO_AGORA
    sessao_falsa = sessao([3], [dispensada])

    assert await concluir(sessao_falsa, [3])

    assert dispensada.status is FileStatus.CONCLUDED
    assert dispensada.dismiss_reason is None


async def test_menina_que_nao_esta_inscrita_na_acao_nao_conta_como_presente() -> None:
    # A 9 não está nas inscritas da ação: o filé dela não ganha o evento
    # (RNF-G.03). A C3 inscreve quem veio sem inscrição antes de marcar.
    sessao_falsa = sessao([], [])

    assert await concluir(sessao_falsa, [9])

    sessao_falsa.add.assert_not_called()


# --- Marcar como presente depois de concluir ----------------------------------


async def test_faltou_e_depois_foi_marcada_presente_volta_concluida() -> None:
    # Ao concluir, faltou: o evento saiu do filé. Pela aba "Faltaram", a linha
    # não existe mais e volta concluída.
    sessao_falsa = sessao([3], [])

    assert await marcar_depois(sessao_falsa, [3])

    criada = sessao_falsa.add.call_args.args[0]
    assert criada.status is FileStatus.CONCLUDED
    assert criada.concluded_on == HOJE


async def test_marcar_depois_nao_mexe_em_quem_nao_foi_marcada() -> None:
    sessao_falsa = sessao([3], [linha(3, FileStatus.SIGNED_UP)])

    assert await marcar_depois(sessao_falsa, [3])

    sessao_falsa.delete.assert_not_called()
    busca_das_linhas = sql_do_postgres(sessao_falsa.scalars.await_args_list[1].args[0])
    assert "status" not in busca_das_linhas.split("WHERE")[1]


async def test_marcar_de_novo_quem_ja_esta_presente_nao_muda_nada() -> None:
    concluida = linha(3, FileStatus.CONCLUDED)
    concluida.concluded_on = date(2026, 11, 10)
    sessao_falsa = sessao([3], [concluida])

    assert await marcar_depois(sessao_falsa, [3])

    assert concluida.concluded_on == date(2026, 11, 10)
    sessao_falsa.add.assert_not_called()
    sessao_falsa.delete.assert_not_called()


async def test_marcar_depois_alguem_fora_da_lista_nao_consulta_o_file() -> None:
    sessao_falsa = sessao([], [])

    assert await marcar_depois(sessao_falsa, [9])

    assert sessao_falsa.scalars.await_count == 1


# --- O grupo ------------------------------------------------------------------


async def test_acao_de_outro_grupo_e_recusada() -> None:
    sessao_falsa = sessao([3], [linha(3, FileStatus.SIGNED_UP)], grupo_da_acao=2)

    assert not await concluir(sessao_falsa, [3])

    sessao_falsa.scalars.assert_not_called()
    sessao_falsa.add.assert_not_called()
    sessao_falsa.flush.assert_not_called()


async def test_acao_que_nao_existe_e_recusada() -> None:
    sessao_falsa = sessao([], [], grupo_da_acao=None)

    assert not await concluir(sessao_falsa, [3])

    sessao_falsa.scalars.assert_not_called()
