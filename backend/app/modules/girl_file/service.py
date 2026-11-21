from dataclasses import dataclass
from datetime import date

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.modules.actions.models import Action, ActionFormat
from app.modules.catalog.models import CuratedItem, ItemKind, ItemOrigin
from app.modules.catalog.service import (
    action_duration,
    action_effort_band,
    action_is_visible,
    curated_is_visible,
    reaches_city,
)
from app.modules.catalog.utils import (
    ACTION_TYPE_LABELS,
    CURATED_TYPE_LABELS,
    item_id,
    parse_item_id,
)
from app.modules.cities.models import City
from app.modules.girl_file.models import (
    DismissReason,
    FileEntry,
    FileStatus,
    SimilarChoice,
)
from app.modules.girl_file.schemas import (
    ActivityOut,
    Choice,
    FileGroupOut,
    FileItemOut,
    FileOut,
    FileSection,
    FileSquareOut,
    LaterItemOut,
    LaterOut,
)
from app.modules.girls.models import EffortBand, Topic
from app.modules.girls.service import get_girl_of_user
from app.modules.girls.utils import first_name

# Onde cada botão da sugestão põe o item (tabela de status da #78).
CHOICE_STATUS: dict[Choice, FileStatus] = {
    Choice.QUERO_FAZER: FileStatus.NEXT,
    Choice.TALVEZ_DEPOIS: FileStatus.LATER,
    Choice.NAO_E_PRA_MIM: FileStatus.DISMISSED,
}

# Uma escolha nova só vale num item sem escolha dela, ou num que está no "Ver
# depois" (o "+ Quero fazer" do Ver depois, #110). No filé, no "Não é pra mim"
# ou concluído, o item não aparece mais nas sugestões, e trocar a escolha
# apagaria o que ela fez (a nota, o dia da conclusão, a inscrição).
CHOOSABLE: frozenset[FileStatus] = frozenset({FileStatus.LATER})

# O que o "Desfazer", o "Remover" e o "Tirar do filé" podem apagar. A atividade
# concluída e o evento concluído não saem do filé. O evento em que ela se
# inscreveu sai pelo "Tirar do filé" da A06·4b (#184, D-39).
REMOVABLE: frozenset[FileStatus] = frozenset(
    {
        FileStatus.NEXT,
        FileStatus.IN_PROGRESS,
        FileStatus.SIGNED_UP,
        FileStatus.LATER,
        FileStatus.DISMISSED,
    }
)

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
    session: AsyncSession,
    girl_id: int,
    origin: ItemOrigin,
    number: int,
    for_update: bool = False,
) -> FileEntry | None:
    """A linha dela para um item do catálogo, ou None se ela ainda não escolheu nada.

    A busca usa o id dela, então a linha de outra menina nunca é achada (RNF-G.03).

    Com `for_update`, a linha fica travada até o fim da transação (SELECT ... FOR
    UPDATE): as rotas que escrevem usam isso para dois pedidos na mesma linha (um
    clique duplo, "Concluída" e "Tirar do filé" juntos) irem um depois do outro,
    e o segundo decidir pelo status que o primeiro deixou.
    """
    if origin is ItemOrigin.CURATED:
        same_item = FileEntry.curated_item_id == number
    else:
        same_item = FileEntry.action_id == number

    query = select(FileEntry).where(FileEntry.girl_id == girl_id, same_item)
    if for_update:
        query = query.with_for_update().execution_options(populate_existing=True)
    return await session.scalar(query)


async def save_choice(
    session: AsyncSession,
    girl_id: int,
    origin: ItemOrigin,
    number: int,
    choice: Choice,
    reason: DismissReason | None,
    entry: FileEntry | None,
) -> bool:
    """Grava o que ela decidiu sobre um item (RF-F10.04).

    `entry` é a linha que ela já tem para o item (`find_entry` com
    `for_update`), ou None. Uma linha por menina e item: num item no "Ver
    depois" a escolha troca a anterior; num item sem escolha, cria a linha. Nos
    outros status (CHOOSABLE) devolve False sem mudar nada. Repetir a mesma
    escolha não muda nada e vale.

    Dois pedidos ao mesmo tempo num item sem escolha (clique duplo, nova
    tentativa depois de um tempo esgotado) tentam criar a mesma linha. O banco
    recusa o segundo (a restrição de único), e ele decide pela linha que o
    primeiro criou, sem erro 500.

    O insert roda num savepoint: a recusa desfaz só ele. Um rollback da sessão
    inteira expiraria os objetos já carregados (a menina, na rota), e lê-los de
    novo no SQLAlchemy assíncrono dá MissingGreenlet, um 500.
    """
    status = CHOICE_STATUS[choice]
    if entry is None:
        try:
            async with session.begin_nested():
                session.add(new_entry(girl_id, origin, number, status, reason))
        except IntegrityError:
            entry = await find_entry(session, girl_id, origin, number, for_update=True)
            if entry is None:
                return False
        else:
            await session.commit()
            return True

    if entry.status is status and entry.dismiss_reason is reason:
        return True
    if entry.status not in CHOOSABLE:
        return False
    entry.status = status
    entry.dismiss_reason = reason
    await session.commit()
    return True


async def remove_choice(
    session: AsyncSession, girl_id: int, origin: ItemOrigin, number: int
) -> FileStatus | None:
    """Apaga a escolha dela sobre um item, e o item volta a poder ser sugerido.

    É o "Desfazer" da A06·2 (RF-F10.05), o "Remover" do Ver depois e o "Tirar
    do filé" da atividade (#119) e do evento, próximo ou inscrita (#184).
    Apagar a linha leva junto o motivo do "Não é pra mim". Se ela não tem
    escolha nesse item (ou já desfez), não faz nada.

    Devolve None quando deu certo. O que foi concluído não sai do filé
    (REMOVABLE): devolve o status que impediu, sem apagar nada (tabela de
    status da #78). A linha é travada antes de decidir,
    então um "Marcar como concluída" ao mesmo tempo nunca é apagado.
    """
    entry = await find_entry(session, girl_id, origin, number, for_update=True)
    if entry is None:
        return None
    if entry.status not in REMOVABLE:
        return entry.status
    await session.delete(entry)
    await session.commit()
    return None


# --- Seu filé (A06·3, #114) ---------------------------------------------------

# Em que seção da tela cada status aparece (tabela de status da #78). O evento
# em que ela se inscreveu ainda vai acontecer, então fica em "Próximas
# aventuras" (como ele aparece na lista ainda está a confirmar com o design).
SECTION_OF: dict[FileStatus, FileSection] = {
    FileStatus.NEXT: FileSection.NEXT,
    FileStatus.SIGNED_UP: FileSection.NEXT,
    FileStatus.IN_PROGRESS: FileSection.IN_PROGRESS,
    FileStatus.CONCLUDED: FileSection.CONCLUDED,
}

# A ordem em que os quadradinhos ocupam o desenho: concluídos primeiro, depois
# em andamento, depois próximas (FILE_CELLS em frontend/lib/file.ts).
DRAWING_ORDER: list[FileSection] = [
    FileSection.CONCLUDED,
    FileSection.IN_PROGRESS,
    FileSection.NEXT,
]

# A ordem dos temas é a da tela de interesses (A05).
TOPIC_ORDER: list[Topic] = list(Topic)


def main_theme(topics: list[Topic]) -> Topic | None:
    """O tema que dá a cor ao item: o primeiro dele na ordem da tela de interesses.

    Um item pode ter vários temas, mas o quadradinho tem uma cor só. Vazio
    quando o item não tem tema.
    """
    for topic in TOPIC_ORDER:
        if topic in topics:
            return topic
    return None


def details_line(item_format: ActionFormat, duration: str, city: str | None) -> str:
    """A linha de detalhes do item, como no Figma (A06·3).

    Online mostra a duração ("Online · ~10 horas"); presencial mostra a cidade
    ("Presencial · Maceió"), que é o que ela precisa saber para ir.
    """
    if item_format is ActionFormat.ONLINE:
        return f"Online · {duration}"
    if city is None:
        return "Presencial"
    return f"Presencial · {city}"


def curated_file_item(
    item: CuratedItem, city: str | None, signed_up: bool = False
) -> FileItemOut:
    """Um item da curadoria como aparece no filé. Precisa de topics carregados."""
    deadline = None
    if item.kind is ItemKind.EVENT:
        deadline = item.registration_deadline
    return FileItemOut(
        id=item_id(ItemOrigin.CURATED, item.id),
        kind=item.kind,
        theme=main_theme([row.topic for row in item.topics]),
        type_label=CURATED_TYPE_LABELS[item.type],
        title=item.title,
        details=details_line(item.format, item.duration, city),
        deadline=deadline,
        signed_up=signed_up,
    )


def action_file_item(
    action: Action, city: str | None, signed_up: bool = False
) -> FileItemOut:
    """Uma ação de grupo como aparece no filé. Precisa de topics carregados.

    Toda ação é um evento. Ela não tem prazo de inscrição, só "inscrições
    abertas" ou não.
    """
    return FileItemOut(
        id=item_id(ItemOrigin.GROUP_ACTION, action.id),
        kind=ItemKind.EVENT,
        theme=main_theme([row.topic for row in action.topics]),
        type_label=ACTION_TYPE_LABELS[action.type],
        title=action.name,
        details=details_line(action.format, action_duration(action), city),
        deadline=None,
        signed_up=signed_up,
    )


def build_file(name: str, placed: list[tuple[FileSection, FileItemOut]]) -> FileOut:
    """Monta a tela a partir dos itens, cada um já com a sua seção.

    Os itens ficam na ordem recebida (a ordem em que entraram no filé). Os
    quadradinhos seguem `DRAWING_ORDER` e, em cada seção, ficam agrupados por
    tema, na ordem da tela de interesses (RF-F10.07); item sem tema vai por
    último. Nada de porcentagem nem de comparação com outras meninas (RN-28).
    """

    def group(section: FileSection) -> FileGroupOut:
        items = [item for item_section, item in placed if item_section is section]
        return FileGroupOut(count=len(items), items=items)

    def drawing_position(square: FileSquareOut) -> tuple[int, int]:
        theme_position = len(TOPIC_ORDER)
        if square.theme is not None:
            theme_position = TOPIC_ORDER.index(square.theme)
        return DRAWING_ORDER.index(square.section), theme_position

    squares = [
        FileSquareOut(id=item.id, title=item.title, theme=item.theme, section=section)
        for section, item in placed
    ]
    return FileOut(
        first_name=first_name(name),
        in_progress=group(FileSection.IN_PROGRESS),
        next=group(FileSection.NEXT),
        concluded=group(FileSection.CONCLUDED),
        squares=sorted(squares, key=drawing_position),
    )


async def load_file(session: AsyncSession, user_id: int) -> FileOut | None:
    """O filé da menina da sessão, nas três seções e com o desenho (RF-F10.07).

    Só lê o status de cada item: quem muda são os botões das outras telas
    (tabela de status da #78). O "Ver depois" e o "Não é pra mim" ficam de
    fora. Um item que saiu das sugestões (vencido, desativado) continua no filé.

    A menina é sempre a da sessão, e as linhas são buscadas pelo id dela
    (RNF-G.03). Devolve None quando a conta não tem registro de menina.
    """
    girl = await get_girl_of_user(session, user_id)
    if girl is None:
        return None

    entries = list(
        await session.scalars(
            select(FileEntry)
            .where(FileEntry.girl_id == girl.id, FileEntry.status.in_(IN_FILE))
            .order_by(FileEntry.id)
        )
    )
    items = await load_entry_items(session, entries)

    placed = []
    for entry in entries:
        signed_up = entry.status is FileStatus.SIGNED_UP
        if entry.curated_item_id is not None:
            item = items.curated[entry.curated_item_id]
            file_item = curated_file_item(
                item, items.city_name(item.city_ibge_code), signed_up
            )
        else:
            # A restrição ck_file_entries_one_source garante uma das duas colunas.
            assert entry.action_id is not None
            action = items.actions[entry.action_id]
            file_item = action_file_item(
                action, items.city_name(action.city_ibge_code), signed_up
            )
        placed.append((SECTION_OF[entry.status], file_item))

    return build_file(girl.name, placed)


@dataclass
class EntryItems:
    """Os itens de algumas linhas do filé, pelo id, e os nomes das cidades deles."""

    curated: dict[int, CuratedItem]
    actions: dict[int, Action]
    cities: dict[int, str]

    def city_name(self, code: int | None) -> str | None:
        return self.cities.get(code) if code is not None else None


async def load_entry_items(
    session: AsyncSession, entries: list[FileEntry]
) -> EntryItems:
    """Busca os itens das linhas, das duas fontes, com os temas, e as cidades deles.

    Os temas dão a cor no filé; as cidades vão na linha de detalhes dos
    presenciais. Só consulta o banco quando há o que buscar.
    """
    curated_ids = [e.curated_item_id for e in entries if e.curated_item_id is not None]
    action_ids = [e.action_id for e in entries if e.action_id is not None]
    curated: dict[int, CuratedItem] = {}
    actions: dict[int, Action] = {}
    if curated_ids:
        curated = {
            item.id: item
            for item in await session.scalars(
                select(CuratedItem)
                .where(CuratedItem.id.in_(curated_ids))
                .options(selectinload(CuratedItem.topics))
            )
        }
    if action_ids:
        actions = {
            action.id: action
            for action in await session.scalars(
                select(Action)
                .where(Action.id.in_(action_ids))
                .options(selectinload(Action.topics))
            )
        }

    city_ids = {
        item.city_ibge_code
        for item in curated.values()
        if item.city_ibge_code is not None
    } | {
        action.city_ibge_code
        for action in actions.values()
        if action.city_ibge_code is not None
    }
    cities: dict[int, str] = {}
    if city_ids:
        rows = await session.execute(
            select(City.id, City.name).where(City.id.in_(city_ids))
        )
        cities = {city_id: city_name for city_id, city_name in rows}

    return EntryItems(curated=curated, actions=actions, cities=cities)


# --- Ver depois (A06·2b, #110) ------------------------------------------------


def later_details_line(
    item_format: ActionFormat, duration: str, city: str | None
) -> str:
    """A linha de detalhes do cartão do Ver depois, como no Figma (A06·2b).

    Online mostra a duração ("Online · ~40 min"); presencial mostra também a
    cidade ("Presencial · Maceió · 2 dias"), para ela decidir se dá para ir.
    """
    if item_format is ActionFormat.ONLINE:
        return f"Online · {duration}"
    if city is None:
        return f"Presencial · {duration}"
    return f"Presencial · {city} · {duration}"


def curated_later_item(item: CuratedItem, city: str | None) -> LaterItemOut:
    """Um item da curadoria como aparece no Ver depois."""
    deadline = None
    if item.kind is ItemKind.EVENT:
        deadline = item.registration_deadline
    return LaterItemOut(
        id=item_id(ItemOrigin.CURATED, item.id),
        kind=item.kind,
        band=item.effort_band,
        type_label=CURATED_TYPE_LABELS[item.type],
        title=item.title,
        details=later_details_line(item.format, item.duration, city),
        deadline=deadline,
    )


def action_later_item(action: Action, city: str | None) -> LaterItemOut:
    """Uma ação de grupo como aparece no Ver depois.

    Toda ação é um evento, mas não tem prazo de inscrição, só "inscrições
    abertas" ou não.
    """
    return LaterItemOut(
        id=item_id(ItemOrigin.GROUP_ACTION, action.id),
        kind=ItemKind.EVENT,
        band=action_effort_band(action),
        type_label=ACTION_TYPE_LABELS[action.type],
        title=action.name,
        details=later_details_line(action.format, action_duration(action), city),
        deadline=None,
    )


async def load_later(
    session: AsyncSession,
    user_id: int,
    today: date,
    band: EffortBand | None = None,
) -> LaterOut | None:
    """O Ver depois da menina da sessão: o que ela guardou com "Talvez depois" (RF-F10.06).

    Do guardado mais recente para o mais antigo. Com `band`, só os itens dessa
    faixa. Um item que não pode mais ser sugerido (venceu, foi desativado, a
    ação fechou ou já passou, o presencial é de outra cidade) não aparece
    (RF-F11.07), mas a escolha dela fica guardada: são as mesmas regras que o
    "+ Quero fazer" confere (`suggestible_audience`).

    A menina é sempre a da sessão, e as linhas são buscadas pelo id dela
    (RNF-G.03). Devolve None quando a conta não tem registro de menina.
    """
    girl = await get_girl_of_user(session, user_id)
    if girl is None:
        return None

    entries = list(
        await session.scalars(
            select(FileEntry)
            .where(FileEntry.girl_id == girl.id, FileEntry.status == FileStatus.LATER)
            .order_by(FileEntry.updated_at.desc(), FileEntry.id.desc())
        )
    )
    items = await load_entry_items(session, entries)

    later = []
    for entry in entries:
        if entry.curated_item_id is not None:
            item = items.curated[entry.curated_item_id]
            if not (
                curated_is_visible(item, today)
                and reaches_city(item.format, item.city_ibge_code, girl.city_ibge_code)
            ):
                continue
            later_item = curated_later_item(item, items.city_name(item.city_ibge_code))
        else:
            # A restrição ck_file_entries_one_source garante uma das duas colunas.
            assert entry.action_id is not None
            action = items.actions[entry.action_id]
            if not (
                action_is_visible(action, today)
                and reaches_city(
                    action.format, action.city_ibge_code, girl.city_ibge_code
                )
            ):
                continue
            later_item = action_later_item(
                action, items.city_name(action.city_ibge_code)
            )

        if band is None or later_item.band is band:
            later.append(later_item)

    return LaterOut(first_name=first_name(girl.name), items=later)


# --- Atividade (A06·4a, #119) -------------------------------------------------

# Os três lugares de uma atividade no filé. Ela anda de um para o seguinte,
# nessa ordem, e o concluído é o fim (tabela de status da #78).
NEXT_STEP: dict[FileStatus, FileStatus | None] = {
    FileStatus.NEXT: FileStatus.IN_PROGRESS,
    FileStatus.IN_PROGRESS: FileStatus.CONCLUDED,
    FileStatus.CONCLUDED: None,
}


async def find_activity(
    session: AsyncSession, girl_id: int, text_id: str, for_update: bool = False
) -> tuple[FileEntry, CuratedItem] | None:
    """A linha dela e o item de uma atividade do filé, ou None se não há.

    `text_id` é o id do catálogo, "curadoria-12". Fica de fora o que não é uma
    atividade no filé dela: o "Ver depois", o "Não é pra mim", um item sem
    escolha e os eventos, que abrem a A06·4b (#118). Uma ação de grupo é sempre
    um evento, então nem é buscada.

    A linha é buscada pelo id dela, então a de outra menina nunca é achada
    (RNF-G.03). O item vem com os temas e as etapas, para o "Por que pra você".
    Com `for_update`, a linha fica travada até o fim da transação (`find_entry`).
    """
    parsed = parse_item_id(text_id)
    if parsed is None:
        return None
    origin, number = parsed
    if origin is not ItemOrigin.CURATED:
        return None

    entry = await find_entry(session, girl_id, origin, number, for_update=for_update)
    if entry is None or entry.status not in NEXT_STEP:
        return None

    item = await session.scalar(
        select(CuratedItem)
        .where(CuratedItem.id == number)
        .options(selectinload(CuratedItem.topics), selectinload(CuratedItem.audiences))
    )
    if item is None or item.kind is not ItemKind.ACTIVITY:
        return None
    return entry, item


def activity_out(
    entry: FileEntry, item: CuratedItem, why: str | None, name: str
) -> ActivityOut:
    """O detalhe da atividade como a tela mostra (A06·4a, RF-F10.08).

    Precisa de topics carregados. `why` é o "Por que pra você", montado pelas
    regras das sugestões (RF-F11.04); `name` é o nome da menina da sessão.
    """
    return ActivityOut(
        id=item_id(ItemOrigin.CURATED, item.id),
        status=SECTION_OF[entry.status],
        type=item.type,
        type_label=CURATED_TYPE_LABELS[item.type],
        theme=main_theme([row.topic for row in item.topics]),
        band=item.effort_band,
        title=item.title,
        source=item.source,
        description=item.description,
        url=item.url,
        format=item.format,
        duration=item.duration,
        cost_cents=item.cost_cents,
        min_age=item.min_age,
        why=why,
        concluded_on=entry.concluded_on,
        first_name=first_name(name),
    )


async def advance_status(
    session: AsyncSession, entry: FileEntry, status: FileSection, today: date
) -> bool:
    """Leva a atividade para a seção seguinte: "Marcar como iniciada" ou "concluída".

    Só o próximo passo vale: da próxima para em andamento, e de em andamento
    para concluída, que guarda o dia (`today`, em Maceió). Outro salto (pular
    direto para concluída, voltar, ou repetir a seção atual) devolve False sem
    mudar nada.
    """
    target = NEXT_STEP[entry.status]
    if target is None or SECTION_OF[target] is not status:
        return False

    entry.status = target
    if target is FileStatus.CONCLUDED:
        entry.concluded_on = today
    await session.commit()
    return True


# --- Avaliação da atividade concluída (A06·5, #123) ---------------------------


async def save_feedback(
    session: AsyncSession,
    entry: FileEntry,
    rating: int | None,
    similar: SimilarChoice | None,
) -> bool:
    """Guarda a nota e as "sugestões parecidas" de uma atividade concluída (RF-F10.09).

    Enviar de novo troca a resposta anterior inteira: o que vier vazio fica
    vazio. As sugestões (#80) leem as duas na próxima rodada (RF-F11.05).

    Só vale numa atividade concluída: nas outras seções devolve False sem mudar
    nada (o banco também confere, em ck_file_entries_feedback_only_when_concluded).
    """
    if entry.status is not FileStatus.CONCLUDED:
        return False

    entry.rating = rating
    entry.similar_choice = similar
    await session.commit()
    return True
