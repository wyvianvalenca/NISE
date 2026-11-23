import enum
from datetime import date, datetime
from typing import Self

from pydantic import BaseModel, Field, model_validator

from app.modules.admissions.models import AdmissionOrigin, CourseLevel


class MatchOut(BaseModel):
    """O card da lista oficial na A19 (RF-F31.04).

    Só para a própria menina. `name` é o nome dela na conta, que é o que a busca
    achou igual na lista; nenhum outro nome da lista existe no sistema.
    """

    id: int
    name: str
    institution: str
    selection_process: str
    call: str
    course: str
    level: CourseLevel
    list_url: str | None
    expires_at: datetime


class MatchAnswerIn(BaseModel):
    """ "Sou eu" / "Não sou eu" e, se for ela, "Já me matriculei" / "Ainda não"."""

    is_me: bool
    # Obrigatório com "Sou eu"; ignorado com "Não sou eu".
    enrolled: bool | None = None

    @model_validator(mode="after")
    def enrolled_answered_when_it_is_her(self) -> Self:
        if self.is_me and self.enrolled is None:
            raise ValueError("Com 'Sou eu', diga se já se matriculou")
        return self


class MatchResult(enum.Enum):
    ENROLLED = "enrolled"
    APPROVED = "approved"
    DISMISSED = "dismissed"


class MatchAnswerOut(BaseModel):
    result: MatchResult


class EnrollmentRowOut(BaseModel):
    """Uma linha de "Quem ingressou" (#315). O front lê em camelCase.

    Só o que a tela mostra: o nome vem curto ("Ana L."), e não vão e-mail,
    nascimento nem a chamada da lista oficial.
    """

    # Id do ingresso, para a chave da linha no front.
    id: int
    girl_name: str = Field(serialization_alias="girlName")
    course: str
    # O que ela escreveu em "Onde?" ou a instituição da lista. Vazio é null, e
    # a tela mostra "—".
    institution: str | None
    # Quando o ingresso foi registrado, não o semestre em que ela entrou (D-73).
    registered_at: datetime = Field(serialization_alias="registeredAt")
    # "Ela declarou na NISE" ou "Detectada na busca" (RF-F6.03).
    origin: AdmissionOrigin


class WaitingGirlOut(BaseModel):
    """Uma menina com indício sem resposta, na última linha da lista (#318).

    Só o nome curto. Nem lista, curso, instituição ou id do indício vão: só a
    menina vê os detalhes (RN-21, RNF-F31.02).
    """

    girl_name: str = Field(serialization_alias="girlName")


class EnrollmentPageOut(BaseModel):
    """Uma página da lista e o que a paginação precisa (D-77)."""

    items: list[EnrollmentRowOut]
    # Quantas meninas a lista tem ao todo, o número ao lado do título. Não conta
    # as que aguardam a menina responder.
    total: int
    # As meninas com indício sem resposta que cabem nesta página: vêm depois de
    # todas as que ingressaram, então só aparecem nas últimas páginas (D-76).
    waiting: list[WaitingGirlOut]
    # Quantas meninas aguardam ao todo, para o "+1 aguardando a menina" em toda
    # página. As páginas contam as que ingressaram e as que aguardam juntas.
    waiting_total: int = Field(serialization_alias="waitingTotal")
    page: int
    page_size: int = Field(serialization_alias="pageSize")


class ListSearchOut(BaseModel):
    """O card "Busca nas listas de ingressantes" (#317, RF-F5.23).

    Só fontes e datas, iguais para todas as coordenadoras: a busca não é por
    grupo. Nenhum nome, número de achadas ou lista de quem foi achada (RN-24).
    """

    # As fontes que a busca lê, como no chip: "UFAL" e, quando o #274 entrar,
    # "IFAL".
    sources: list[str]
    # Quando a última rodada terminou bem. Null se nunca rodou.
    last_search_at: datetime | None = Field(serialization_alias="lastSearchAt")
    # Dia previsto da próxima (D-72). Null se nunca rodou.
    next_search_on: date | None = Field(serialization_alias="nextSearchOn")


class LevelSummaryOut(BaseModel):
    """Quantas ingressaram num nível e em quais instituições."""

    count: int
    # Cada instituição uma vez, em ordem alfabética (pergunta 4 da #316). Vazias
    # ficam de fora.
    institutions: list[str]


class RecentGirlOut(BaseModel):
    """Uma menina de "Mais recentes": o primeiro nome, o curso e a instituição."""

    first_name: str = Field(serialization_alias="firstName")
    course: str
    institution: str | None


class RecentFoundOut(BaseModel):
    """As ingressantes que a última busca achou e que confirmaram (RF-F5.22)."""

    # Quando a última busca terminou: a tela mostra o mês, igual ao do card.
    searched_at: datetime = Field(serialization_alias="searchedAt")
    girls: list[RecentGirlOut]


class EnrollmentSummaryOut(BaseModel):
    """O resumo do topo da tela Ingressantes (#316, RF-F5.21).

    Mostra os números mesmo com menos de 5 meninas (RN-06 não vale aqui, D-75).
    """

    # Quantas meninas ingressaram: o mesmo número da lista "Quem ingressou".
    total: int
    # Ingressantes sobre as meninas que foram a ações do grupo e criaram conta,
    # em número inteiro (D-78). Zero se nenhuma foi.
    percent: int
    graduacao: LevelSummaryOut
    tecnico: LevelSummaryOut
    # Null quando a última busca não achou ninguém da lista, ou nunca rodou: a
    # frase "Mais recentes" some.
    recent: RecentFoundOut | None
