from app.modules.catalog.models import ItemOrigin
from app.modules.catalog.utils import item_id
from app.modules.girl_file.models import DismissReason, FileEntry, FileStatus


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
