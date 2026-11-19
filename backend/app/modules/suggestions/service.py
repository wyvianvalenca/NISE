"""Sugestões por regras: o que cada menina vê em cada faixa, e em que ordem (#80).

RF-F11.02 diz que as regras são o plano B para quando a LLM não responde. Até a
LLM chegar (RF-F11.03), elas são a única fonte das sugestões.

O caminho é este:

1. `load_catalog` (catalog/service.py) traz os itens que podem ser sugeridos
   hoje na cidade dela.
2. `matches_profile` deixa só os que combinam com os temas, a etapa de estudo
   e a idade dela, e somem os que já estão no filé (qualquer escolha).
3. `score` dá pontos a cada item pelas escolhas que ela já fez (RF-F11.05), e a
   lista é ordenada pelos pontos. Empate fica na ordem do catálogo, então o
   mesmo perfil sempre recebe a mesma lista.

Tudo isso são funções puras (sem sessão), para serem testadas sem banco.
`load_suggestions` só busca no banco e chama `build_suggestions`.

Nada aqui usa nome, e-mail ou a data de nascimento além da idade (RN-05).
"""

from dataclasses import dataclass
from datetime import date

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.modules.actions.models import Action
from app.modules.catalog.models import CuratedItem, EffortBand, ItemLevel
from app.modules.catalog.schemas import CatalogItem
from app.modules.catalog.service import ACTION_LEVEL, action_effort_band, load_catalog
from app.modules.catalog.utils import LEVEL_ORDER
from app.modules.girl_file.models import (
    DismissReason,
    FileEntry,
    FileStatus,
    SimilarChoice,
)
from app.modules.girl_file.service import entry_item_id
from app.modules.girls.models import Girl, StudyStage, Topic
from app.modules.girls.utils import TOPIC_LABELS, age_on
from app.modules.suggestions.schemas import BandSuggestions, Suggestion

# Quanto cada escolha sobe ou desce um item. "Sugestões parecidas" e os motivos
# do "Não é pra mim" pesam mais que a nota, que só sobe ou desce "um pouco".
STRONG = 3
LIGHT = 1

# As faixas de vários dias, que "Sem tempo agora" desce (RF-F10.03).
LONG_BANDS = {EffortBand.NO_MEU_RITMO, EffortBand.GRANDE_DESAFIO}


@dataclass(frozen=True)
class GirlProfile:
    """O que as regras usam do perfil da menina. Nada que a identifique (RN-05)."""

    topics: frozenset[Topic]
    # "Ainda não sei, me mostra de tudo" (RF-F10.01).
    all_topics: bool
    stage: StudyStage | None
    # Vazia quando ela não informou a data de nascimento.
    age: int | None


@dataclass(frozen=True)
class PastChoice:
    """Uma escolha que ela já fez no filé, com o tema, o nível e a faixa do item.

    `dismiss_reason` só vem no "Não é pra mim"; `rating` e `similar_choice`, só
    numa atividade concluída.
    """

    item_id: str
    status: FileStatus
    topics: frozenset[Topic]
    level: ItemLevel
    effort_band: EffortBand
    dismiss_reason: DismissReason | None = None
    rating: int | None = None
    similar_choice: SimilarChoice | None = None


def profile_of(girl: Girl, today: date) -> GirlProfile:
    """O perfil que as regras usam. A menina precisa de topics carregados."""
    age = None
    if girl.birth_date is not None:
        age = age_on(girl.birth_date, today)
    return GirlProfile(
        topics=frozenset(row.topic for row in girl.topics),
        all_topics=girl.all_topics,
        stage=girl.study_stage,
        age=age,
    )


def matches_profile(item: CatalogItem, profile: GirlProfile) -> bool:
    """O item combina com os temas, a etapa de estudo e a idade dela (RF-F11.02).

    A cidade já foi conferida em `load_catalog` (RN-16).

    - Tema: pelo menos um tema em comum. Quem pediu "me mostra de tudo", ou
      ainda não escolheu temas, vê todos.
    - Etapa: item sem etapas serve para todas; quem não informou a etapa vê todos.
    - Idade: item com idade mínima só aparece para quem tem essa idade. Sem a
      data de nascimento, ela não vê os itens com idade mínima.
    """
    likes_topic = (
        not profile.topics
        or profile.all_topics
        or bool(profile.topics.intersection(item.topics))
    )
    fits_stage = (
        not item.stages or profile.stage is None or profile.stage in item.stages
    )
    old_enough = item.min_age is None or (
        profile.age is not None and profile.age >= item.min_age
    )
    return likes_topic and fits_stage and old_enough


def choice_weight(item: CatalogItem, choice: PastChoice) -> int:
    """Quanto uma escolha que ela já fez sobe (+) ou desce (-) o item (RF-F11.05)."""
    same_topic = bool(choice.topics.intersection(item.topics))
    # Comparado com o item da escolha: mais difícil, do mesmo nível ou mais fácil.
    level_change = LEVEL_ORDER.index(item.level) - LEVEL_ORDER.index(choice.level)
    harder = level_change > 0
    same_level = level_change == 0
    similar = choice.similar_choice
    reason = choice.dismiss_reason
    weight = 0

    # "Quer sugestões parecidas?" de uma atividade concluída (RF-F10.09).
    # "Por enquanto, tá bom" não muda nada.
    if similar is SimilarChoice.MAIS_AVANCADO and same_topic and harder:
        weight += STRONG
    if similar is SimilarChoice.MESMO_NIVEL and same_topic and same_level:
        weight += STRONG
    if similar is SimilarChoice.OUTRO_TEMA:
        # Os itens que aparecem já são dos temas dela; os outros temas sobem.
        weight += -STRONG if same_topic else STRONG

    # Motivo do "Não é pra mim". "Já conheço" e "Outro motivo" só escondem o item.
    if reason is DismissReason.MUITO_DIFICIL and same_topic and (harder or same_level):
        weight -= STRONG
    if reason is DismissReason.MUITO_FACIL and harder:
        weight += STRONG
    if reason is DismissReason.NAO_CURTO_O_TEMA and same_topic:
        weight -= STRONG
    if reason is DismissReason.SEM_TEMPO_AGORA and item.effort_band in LONG_BANDS:
        weight -= STRONG

    # Nota da atividade concluída: 4 e 5 sobem o tema um pouco; 1 e 2 descem.
    if choice.rating is not None and same_topic:
        if choice.rating >= 4:
            weight += LIGHT
        elif choice.rating <= 2:
            weight -= LIGHT

    return weight


def score(item: CatalogItem, profile: GirlProfile, choices: list[PastChoice]) -> int:
    """Os pontos do item: um por tema dela que ele tem, mais o peso das escolhas."""
    points = len(profile.topics.intersection(item.topics))
    for choice in choices:
        points += choice_weight(item, choice)
    return points


def join_with_e(words: list[str]) -> str:
    """Junta as palavras como numa frase: "A", "A e B", "A, B e C"."""
    if len(words) <= 1:
        return "".join(words)
    return ", ".join(words[:-1]) + " e " + words[-1]


def why_for_you(item: CatalogItem, profile: GirlProfile) -> str | None:
    """O "Por que pra você" do item, montado por regras (RF-F11.04).

    Os temas vão na ordem da tela de interesses (A05), não na do item.
    """
    liked = [
        TOPIC_LABELS[topic]
        for topic in Topic
        if topic in profile.topics and topic in item.topics
    ]
    if liked:
        return f"você curtiu {join_with_e(liked)}"
    if profile.all_topics:
        return "você pediu pra ver de tudo"
    return None


def rank(
    catalog: list[CatalogItem], profile: GirlProfile, choices: list[PastChoice]
) -> list[Suggestion]:
    """Os itens que combinam com ela e não estão no filé, do mais ao menos indicado.

    O `sorted` do Python mantém a ordem original nos empates, então quem desempata
    é a ordem do catálogo (curadoria pelo id, depois ações pela data).
    """
    in_file = {choice.item_id for choice in choices}
    candidates = [
        item
        for item in catalog
        if item.id not in in_file and matches_profile(item, profile)
    ]
    ranked = sorted(candidates, key=lambda item: -score(item, profile, choices))
    return [
        Suggestion(**item.model_dump(), why=why_for_you(item, profile))
        for item in ranked
    ]


def build_suggestions(
    catalog: list[CatalogItem], profile: GirlProfile, choices: list[PastChoice]
) -> list[BandSuggestions]:
    """As 5 faixas, na ordem da tela Descobrir, cada uma com as sugestões e quantas são.

    Uma faixa sem sugestões vem com 0 e a lista vazia (RF-F10.03).
    """
    ranked = rank(catalog, profile, choices)
    bands = []
    for band in EffortBand:
        items = [item for item in ranked if item.effort_band is band]
        bands.append(BandSuggestions(band=band, count=len(items), items=items))
    return bands


async def load_choices(session: AsyncSession, girl_id: int) -> list[PastChoice]:
    """Tudo o que ela já fez no filé, com o tema, o nível e a faixa de cada item.

    O item pode já ter saído das sugestões (vencido, desativado ou ação passada),
    por isso é buscado direto, e não no catálogo.
    """
    entries = list(
        await session.scalars(
            select(FileEntry).where(FileEntry.girl_id == girl_id).order_by(FileEntry.id)
        )
    )

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

    choices = []
    for entry in entries:
        if entry.curated_item_id is not None:
            item = curated[entry.curated_item_id]
            topics = frozenset(row.topic for row in item.topics)
            level = item.level
            band = item.effort_band
        else:
            # A restrição ck_file_entries_one_source garante uma das duas colunas.
            assert entry.action_id is not None
            action = actions[entry.action_id]
            topics = frozenset(row.topic for row in action.topics)
            level = ACTION_LEVEL
            band = action_effort_band(action)
        choices.append(
            PastChoice(
                item_id=entry_item_id(entry),
                status=entry.status,
                topics=topics,
                level=level,
                effort_band=band,
                dismiss_reason=entry.dismiss_reason,
                rating=entry.rating,
                similar_choice=entry.similar_choice,
            )
        )
    return choices


async def load_suggestions(
    session: AsyncSession, girl: Girl, today: date
) -> list[BandSuggestions]:
    """As sugestões da menina em cada faixa (RF-F10.03, RF-F11.02).

    A menina precisa de topics carregados: selectinload(Girl.topics).
    """
    catalog = await load_catalog(session, girl.city_ibge_code, today)
    choices = await load_choices(session, girl.id)
    return build_suggestions(catalog, profile_of(girl, today), choices)
