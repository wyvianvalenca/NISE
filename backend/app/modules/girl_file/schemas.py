import enum
from datetime import date
from typing import Self

from pydantic import BaseModel, Field, model_validator

from app.modules.actions.models import ActionFormat
from app.modules.catalog.models import CuratedType, ItemKind
from app.modules.girl_file.models import DismissReason
from app.modules.girls.models import EffortBand, Topic


class Choice(enum.Enum):
    """Os três botões de uma sugestão (A06·2, RF-F10.04).

    Os valores são os mesmos de `Choice` no front (frontend/lib/sugestoes.ts).
    """

    QUERO_FAZER = "quero-fazer"  # entra no filé
    TALVEZ_DEPOIS = "talvez-depois"  # vai para o "Ver depois"
    NAO_E_PRA_MIM = "nao-e-pra-mim"  # some, com o motivo opcional


class ChoiceIn(BaseModel):
    """O que ela decidiu sobre um item, com o motivo opcional do "Não é pra mim".

    O motivo é da lista fechada da A06·2a (`DismissReason`); um motivo fora
    dela, ou um motivo em outra escolha, responde 422.
    """

    choice: Choice
    reason: DismissReason | None = None

    @model_validator(mode="after")
    def reason_only_when_dismissed(self) -> Self:
        if self.reason is not None and self.choice is not Choice.NAO_E_PRA_MIM:
            raise ValueError('O motivo só vale para "Não é pra mim"')
        return self


class ChoiceOut(BaseModel):
    """A resposta da escolha: o novo total do filé, para a pílula "Meu filé"."""

    file_total: int = Field(serialization_alias="fileTotal")


# --- Seu filé (A06·3, #114) ---------------------------------------------------


class FileSection(enum.Enum):
    """As três seções do filé, na ordem da tela (RF-F10.07).

    "Próximas aventuras" é `NEXT`. Um evento em que ela se inscreveu
    (`FileStatus.SIGNED_UP`) também fica nela, porque ainda vai acontecer.
    """

    IN_PROGRESS = "in_progress"  # "Em andamento"
    NEXT = "next"  # "Próximas aventuras"
    CONCLUDED = "concluded"  # "Concluídos"


class FileItemOut(BaseModel):
    """Um item de uma seção do filé (A06·3). O front lê em camelCase."""

    # "curadoria-12" ou "acao-7": o id do catálogo, que "Continuar" e "Abrir" usam.
    id: str
    # O tema que dá a cor ao quadradinho e à bolinha do item. Vazio quando o
    # item não tem tema; o front usa uma cor neutra.
    theme: Topic | None
    # O tipo como aparece na tela, ex.: "Curso online", "Hackathon".
    type_label: str = Field(serialization_alias="typeLabel")
    title: str
    # A linha de detalhes, já escrita para a tela: "Online · ~10 horas" ou
    # "Presencial · Maceió".
    details: str
    # O último dia de inscrição, só nos eventos que informam um prazo.
    deadline: date | None


class FileGroupOut(BaseModel):
    """Uma seção do filé: o contador e os itens, na ordem em que entraram."""

    count: int
    items: list[FileItemOut]


class FileSquareOut(BaseModel):
    """Um quadradinho do desenho do filé: o tema dá a cor, a seção dá a forma."""

    theme: Topic | None
    section: FileSection


class FileOut(BaseModel):
    """A tela Seu filé (A06·3, #114). O front lê em camelCase (FileData).

    Não há porcentagem, barra de progresso nem nada que compare meninas (RN-28):
    só os contadores das seções dela.
    """

    # Para o avatar. É o nome dela mesma, a da sessão.
    first_name: str = Field(serialization_alias="firstName")
    in_progress: FileGroupOut = Field(serialization_alias="inProgress")
    next: FileGroupOut
    concluded: FileGroupOut
    # Os quadradinhos do desenho, na ordem em que ocupam o filé: concluídos,
    # em andamento e próximas, e em cada seção agrupados por tema (RF-F10.07).
    squares: list[FileSquareOut]


# --- Ver depois (A06·2b, #110) ------------------------------------------------


class LaterItemOut(BaseModel):
    """Um cartão do Ver depois (A06·2b). O front lê em camelCase (SavedItem)."""

    # "curadoria-12" ou "acao-7": o id que "+ Quero fazer" e "Remover" usam.
    id: str
    # Evento ou atividade: o evento tem data e prazo de inscrição (RF-F10.13).
    kind: ItemKind
    # A faixa de esforço, para o selo "Hackathon · Grande desafio" e o filtro.
    band: EffortBand
    # O tipo como aparece na tela, ex.: "Playlist", "Hackathon".
    type_label: str = Field(serialization_alias="typeLabel")
    title: str
    # A linha de detalhes, já escrita para a tela: "Online · ~40 min" ou
    # "Presencial · Maceió · 2 dias".
    details: str
    # O último dia de inscrição, só nos eventos que informam um prazo.
    deadline: date | None


class LaterOut(BaseModel):
    """A tela Ver depois (A06·2b, #110). O front lê em camelCase."""

    # Para o avatar. É o nome dela mesma, a da sessão.
    first_name: str = Field(serialization_alias="firstName")
    # Do guardado mais recente para o mais antigo, sem os vencidos (RF-F11.07).
    items: list[LaterItemOut]


# --- Atividade (A06·4a, #119) -------------------------------------------------


class ActivityOut(BaseModel):
    """O detalhe de uma atividade do filé (A06·4a, RF-F10.08). O front lê em camelCase.

    O formato e o custo vão como código e número, como no card da sugestão; o
    texto da tela ("Online", "Grátis") é montado no front (frontend/lib/atividade.ts).
    """

    # "curadoria-12": o id do catálogo, o mesmo do filé.
    id: str
    # A seção do filé em que ela está; é o que decide os botões da tela.
    status: FileSection
    # Código do tipo (CuratedType), ex.: "course". Um curso diz "site do curso".
    type: CuratedType
    # O selo do topo, ex.: "Curso online".
    type_label: str = Field(serialization_alias="typeLabel")
    # O tema que dá a cor e o nome na linha "Programação · No meu ritmo". Vazio
    # quando o item não tem tema.
    theme: Topic | None
    band: EffortBand
    title: str
    source: str
    description: str
    # O site externo. Abrir o site não muda o status (tabela de status da #78).
    url: str
    format: ActionFormat
    duration: str
    # Em centavos; 0 é grátis.
    cost_cents: int | None = Field(serialization_alias="costCents")
    # Vazia quando o item não tem idade mínima.
    min_age: int | None = Field(serialization_alias="minAge")
    # "Por que pra você" (RF-F11.04); vazio quando nenhuma regra explica.
    why: str | None
    # O dia em que ela marcou como concluída; vazio nas outras seções.
    concluded_on: date | None = Field(serialization_alias="concludedOn")
    # Para o "Você conseguiu, <nome>!" da celebração (A06·5). É o nome dela mesma.
    first_name: str = Field(serialization_alias="firstName")


class StatusIn(BaseModel):
    """A seção para onde ela quer levar a atividade.

    Só o próximo passo é aceito: "in_progress" a partir de "next" e
    "concluded" a partir de "in_progress". Outro salto responde 409.
    """

    status: FileSection
