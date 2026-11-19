from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.catalog.models import ItemOrigin
from app.modules.catalog.utils import item_id
from app.modules.girl_file.models import DismissReason, FileEntry, FileStatus
from app.modules.girl_file.schemas import Choice

# Onde cada botão da sugestão põe o item (tabela de status da #78).
CHOICE_STATUS: dict[Choice, FileStatus] = {
    Choice.QUERO_FAZER: FileStatus.NEXT,
    Choice.TALVEZ_DEPOIS: FileStatus.LATER,
    Choice.NAO_E_PRA_MIM: FileStatus.DISMISSED,
}

# O que conta na pílula "Meu filé": tudo o que entrou no filé. O "Ver depois"
# e o "Não é pra mim" ficam de fora.
IN_FILE: list[FileStatus] = [
    FileStatus.NEXT,
    FileStatus.IN_PROGRESS,
    FileStatus.CONCLUDED,
    FileStatus.SIGNED_UP,
]


def new_entry(
    girl_id: int,
    origin: ItemOrigin,
    number: int,
    status: FileStatus,
    reason: DismissReason | None = None,
) -> FileEntry:
    """Linha do filé para um item do catálogo, na coluna da fonte certa.

    O motivo só vale no "Não é pra mim"; o banco também confere isso.
    """
    if reason is not None and status is not FileStatus.DISMISSED:
        raise ValueError('O motivo só vale para "Não é pra mim"')

    entry = FileEntry(girl_id=girl_id, status=status, dismiss_reason=reason)
    if origin is ItemOrigin.CURATED:
        entry.curated_item_id = number
    else:
        entry.action_id = number
    return entry


def entry_item_id(entry: FileEntry) -> str:
    """O id do item no catálogo ("curadoria-12", "acao-7"), para cruzar com as sugestões."""
    if entry.curated_item_id is not None:
        return item_id(ItemOrigin.CURATED, entry.curated_item_id)
    # A restrição ck_file_entries_one_source garante uma das duas colunas.
    assert entry.action_id is not None
    return item_id(ItemOrigin.GROUP_ACTION, entry.action_id)


async def file_total(session: AsyncSession, girl_id: int) -> int:
    """Quantos itens estão no filé dela, para a pílula "Meu filé" (A06·2)."""
    total = await session.scalar(
        select(func.count())
        .select_from(FileEntry)
        .where(FileEntry.girl_id == girl_id, FileEntry.status.in_(IN_FILE))
    )
    return total or 0


async def find_entry(
    session: AsyncSession, girl_id: int, origin: ItemOrigin, number: int
) -> FileEntry | None:
    """A linha dela para um item do catálogo, ou None se ela ainda não escolheu nada.

    A busca usa o id dela, então a linha de outra menina nunca é achada (RNF-G.03).
    """
    if origin is ItemOrigin.CURATED:
        same_item = FileEntry.curated_item_id == number
    else:
        same_item = FileEntry.action_id == number

    return await session.scalar(
        select(FileEntry).where(FileEntry.girl_id == girl_id, same_item)
    )


async def save_choice(
    session: AsyncSession,
    girl_id: int,
    origin: ItemOrigin,
    number: int,
    choice: Choice,
    reason: DismissReason | None = None,
) -> None:
    """Grava o que ela decidiu sobre um item (RF-F10.04).

    Uma linha por menina e item: escolher de novo troca a escolha anterior, sem
    criar outra linha.
    """
    status = CHOICE_STATUS[choice]
    entry = await find_entry(session, girl_id, origin, number)
    if entry is None:
        session.add(new_entry(girl_id, origin, number, status, reason))
    else:
        entry.status = status
        entry.dismiss_reason = reason
        # A nota e as "sugestões parecidas" só valem numa atividade concluída
        # (ck_file_entries_feedback_only_when_concluded).
        entry.rating = None
        entry.similar_choice = None
    await session.commit()


async def remove_choice(
    session: AsyncSession, girl_id: int, origin: ItemOrigin, number: int
) -> None:
    """Apaga a escolha dela sobre um item: o "Desfazer" da A06·2 (RF-F10.05).

    Apagar a linha leva junto o motivo do "Não é pra mim", e o item volta a
    poder ser sugerido. Se ela não tem escolha nesse item (ou já desfez), não
    faz nada.
    """
    entry = await find_entry(session, girl_id, origin, number)
    if entry is None:
        return
    await session.delete(entry)
    await session.commit()
