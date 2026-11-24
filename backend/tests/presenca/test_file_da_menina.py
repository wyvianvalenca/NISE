"""A presença muda o filé da menina (#337, #196): RF-F10.24, RF-F3.03, RF-F3.09,
D-80, D-81, RNF-G.03.

Roda num Postgres de verdade. A função `apply_attendance` (M6) é chamada pelo
"Concluir presença" (#348), na mesma transação que grava a presença, e pelo
marcar e adicionar depois de concluir (#350). Dados fictícios.
"""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.actions.models import Action, Participation
from app.modules.girl_file.models import FileEntry, FileStatus
from app.modules.girls.models import Girl
from app.modules.groups.models import Group
from app.users.models import User
from tests.presenca.dados import (
    EVENT_DAY,
    Api,
    CorreioFalso,
    make_action,
    make_girl,
    make_group,
    register,
)

CONCLUDE = "/api/actions/{}/attendance/conclude"
MARKS = "/api/actions/{}/attendance/marks"
PRESENT = "/api/actions/{}/attendance/present/{}"
GIRLS = "/api/actions/{}/attendance/girls"


async def _signed_up(banco: AsyncSession, girl: Girl, action: Action) -> None:
    """She tapped "Já me inscrevi" on the event of the group."""
    banco.add(
        FileEntry(girl_id=girl.id, action_id=action.id, status=FileStatus.SIGNED_UP)
    )
    await banco.commit()


async def _entry(banco: AsyncSession, girl: Girl, action: Action) -> FileEntry | None:
    return await banco.scalar(
        select(FileEntry)
        .where(FileEntry.girl_id == girl.id, FileEntry.action_id == action.id)
        .execution_options(populate_existing=True)
    )


async def _entries_of(banco: AsyncSession, action: Action) -> list[FileEntry]:
    return list(
        await banco.scalars(
            select(FileEntry)
            .where(FileEntry.action_id == action.id)
            .execution_options(populate_existing=True)
        )
    )


async def _scenario(banco: AsyncSession) -> tuple[User, Action, Girl, Girl, Girl]:
    """Three registered girls: `ana` and `bia` have the event in the filé as
    "Já me inscrevi"; `carol` registered through the coordinator and has no row."""
    group, coordinator = await make_group(banco)
    action = await make_action(banco, group)
    ana = await make_girl(banco, name="Ana Fictícia")
    bia = await make_girl(banco, name="Bia Fictícia")
    carol = await make_girl(banco, name="Carol Fictícia")
    for girl in (ana, bia, carol):
        await register(banco, action, girl)
    await _signed_up(banco, ana, action)
    await _signed_up(banco, bia, action)
    return coordinator, action, ana, bia, carol


async def _participation_id(banco: AsyncSession, action: Action, girl: Girl) -> int:
    found = await banco.scalar(
        select(Participation.id).where(
            Participation.action_id == action.id, Participation.girl_id == girl.id
        )
    )
    assert found is not None
    return found


async def test_concluir_a_presente_fica_concluida_e_a_ausente_sai_do_file(
    banco: AsyncSession, api: Api
) -> None:
    coordinator, action, ana, bia, _ = await _scenario(banco)
    ana_id = await _participation_id(banco, action, ana)

    response = await api(coordinator).post(
        CONCLUDE.format(action.id), json={"present_ids": [ana_id]}
    )

    assert response.status_code == 200
    came = await _entry(banco, ana, action)
    assert came is not None
    assert came.status is FileStatus.CONCLUDED
    assert came.concluded_on == EVENT_DAY
    # She tapped "Já me inscrevi" and was not there: the event leaves her filé.
    assert await _entry(banco, bia, action) is None


async def test_presente_que_nunca_escolheu_o_evento_recebe_o_evento_concluido(
    banco: AsyncSession, api: Api
) -> None:
    coordinator, action, _, _, carol = await _scenario(banco)
    carol_id = await _participation_id(banco, action, carol)

    await api(coordinator).post(
        CONCLUDE.format(action.id), json={"present_ids": [carol_id]}
    )

    entry = await _entry(banco, carol, action)
    assert entry is not None
    assert entry.status is FileStatus.CONCLUDED
    assert entry.concluded_on == EVENT_DAY


async def test_ausente_que_nunca_escolheu_o_evento_continua_sem_linha(
    banco: AsyncSession, api: Api
) -> None:
    coordinator, action, ana, _, carol = await _scenario(banco)
    ana_id = await _participation_id(banco, action, ana)

    await api(coordinator).post(
        CONCLUDE.format(action.id), json={"present_ids": [ana_id]}
    )

    assert await _entry(banco, carol, action) is None


async def test_marcacoes_so_salvas_nao_mudam_o_file(
    banco: AsyncSession, api: Api
) -> None:
    coordinator, action, ana, bia, carol = await _scenario(banco)
    ana_id = await _participation_id(banco, action, ana)
    carol_id = await _participation_id(banco, action, carol)

    response = await api(coordinator).put(
        MARKS.format(action.id), json={"present_ids": [ana_id, carol_id]}
    )

    assert response.status_code == 200
    entry = await _entry(banco, ana, action)
    assert entry is not None and entry.status is FileStatus.SIGNED_UP
    entry = await _entry(banco, bia, action)
    assert entry is not None and entry.status is FileStatus.SIGNED_UP
    assert await _entry(banco, carol, action) is None


async def test_concluir_duas_vezes_nao_duplica_nem_muda_o_dia(
    banco: AsyncSession, api: Api
) -> None:
    coordinator, action, ana, _, carol = await _scenario(banco)
    ids = [await _participation_id(banco, action, girl) for girl in (ana, carol)]
    client = api(coordinator)

    first = await client.post(CONCLUDE.format(action.id), json={"present_ids": ids})
    entries_before = {
        entry.girl_id: entry.concluded_on for entry in await _entries_of(banco, action)
    }
    # The second tap, even from another day and with other marks, changes nothing.
    again = await client.post(CONCLUDE.format(action.id), json={"present_ids": []})

    assert first.status_code == again.status_code == 200
    entries = await _entries_of(banco, action)
    assert len(entries) == 2
    assert {entry.girl_id: entry.concluded_on for entry in entries} == entries_before
    assert all(entry.status is FileStatus.CONCLUDED for entry in entries)


async def test_marcada_depois_o_evento_volta_ao_file_como_concluido(
    banco: AsyncSession, api: Api, correio: CorreioFalso
) -> None:
    coordinator, action, ana, bia, _ = await _scenario(banco)
    ana_id = await _participation_id(banco, action, ana)
    bia_id = await _participation_id(banco, action, bia)
    client = api(coordinator)
    await client.post(CONCLUDE.format(action.id), json={"present_ids": [ana_id]})
    assert await _entry(banco, bia, action) is None

    response = await client.post(PRESENT.format(action.id, bia_id))

    assert response.status_code == 200
    entry = await _entry(banco, bia, action)
    assert entry is not None
    assert entry.status is FileStatus.CONCLUDED
    assert entry.concluded_on == EVENT_DAY
    assert len(await _entries_of(banco, action)) == 2


async def test_marcar_de_novo_quem_ja_esta_presente_nao_muda_nada(
    banco: AsyncSession, api: Api
) -> None:
    coordinator, action, ana, _, _ = await _scenario(banco)
    ana_id = await _participation_id(banco, action, ana)
    client = api(coordinator)
    await client.post(CONCLUDE.format(action.id), json={"present_ids": [ana_id]})
    # She took the event out of her filé afterwards; marking her again does not bring it back.
    entry = await _entry(banco, ana, action)
    assert entry is not None
    entry.status = FileStatus.DISMISSED
    entry.concluded_on = None
    await banco.commit()

    response = await client.post(PRESENT.format(action.id, ana_id))

    assert response.status_code == 200
    entry = await _entry(banco, ana, action)
    assert entry is not None
    assert entry.status is FileStatus.DISMISSED


async def test_veio_sem_inscricao_antes_de_concluir_nao_mexe_no_file(
    banco: AsyncSession, api: Api
) -> None:
    coordinator, action, _, _, _ = await _scenario(banco)

    response = await api(coordinator).post(
        GIRLS.format(action.id),
        json={"name": "Nova Fictícia", "email": "nova@exemplo.com"},
    )

    assert response.status_code == 200
    nova = await banco.scalar(select(Girl).where(Girl.email == "nova@exemplo.com"))
    assert nova is not None
    assert await _entry(banco, nova, action) is None


async def test_veio_sem_inscricao_depois_de_concluir_recebe_o_evento_concluido(
    banco: AsyncSession, api: Api
) -> None:
    coordinator, action, ana, _, _ = await _scenario(banco)
    ana_id = await _participation_id(banco, action, ana)
    client = api(coordinator)
    await client.post(CONCLUDE.format(action.id), json={"present_ids": [ana_id]})

    response = await client.post(
        GIRLS.format(action.id),
        json={"name": "Nova Fictícia", "email": "nova@exemplo.com"},
    )

    assert response.status_code == 200
    nova = await banco.scalar(select(Girl).where(Girl.email == "nova@exemplo.com"))
    assert nova is not None
    entry = await _entry(banco, nova, action)
    assert entry is not None
    assert entry.status is FileStatus.CONCLUDED
    assert entry.concluded_on == EVENT_DAY


async def test_o_file_de_outra_acao_nao_muda(banco: AsyncSession, api: Api) -> None:
    coordinator, action, ana, _, _ = await _scenario(banco)
    group = await banco.get(Group, action.group_id)
    assert group is not None
    other = await make_action(banco, group, name="Outra ação")
    await _signed_up(banco, ana, other)

    await api(coordinator).post(CONCLUDE.format(action.id), json={"present_ids": []})

    entry = await _entry(banco, ana, other)
    assert entry is not None and entry.status is FileStatus.SIGNED_UP
