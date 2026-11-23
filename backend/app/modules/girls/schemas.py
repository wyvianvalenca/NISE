from typing import Annotated, Self

from pydantic import (
    AfterValidator,
    BaseModel,
    ConfigDict,
    Field,
    StrictBool,
    model_validator,
)
from pydantic.alias_generators import to_camel

from app.modules.admissions.declaration import (
    FreeText,
    blank_is_none,
    check_course_fields,
    level_of,
)
from app.modules.admissions.models import CourseLevel
from app.modules.consents.schemas import GroupOrigin, SelfOrigin
from app.modules.followup.models import CourseCode, CourseStatus
from app.modules.girls.models import StudyStage, Topic


class OptionOut(BaseModel):
    """Uma opção de lista fechada: o código vai para o back, o nome vai para a tela."""

    code: str
    label: str


class InterestOptionsOut(BaseModel):
    """As listas de temas e de etapas de estudo da A05 (RF-F10.01)."""

    topics: list[OptionOut]
    stages: list[OptionOut]


def _without_repeats(topics: list[Topic]) -> list[Topic]:
    # O mesmo tema duas vezes vale como uma, na ordem em que ela escolheu.
    return list(dict.fromkeys(topics))


class InterestsIn(BaseModel):
    """O que ela escolheu na A05: temas e etapa de estudo (RF-F10.01).

    Códigos fora das listas são recusados. Não há "Pular por agora" (D-19):
    ela escolhe pelo menos um tema ou "Ainda não sei, me mostra de tudo", e a
    etapa de estudo é obrigatória.
    """

    # Códigos dos temas; vazio quando ela escolhe "me mostra de tudo". O limite
    # é o tamanho da lista, para ninguém mandar um corpo enorme.
    topics: Annotated[
        list[Topic], Field(max_length=len(Topic)), AfterValidator(_without_repeats)
    ]
    # "Ainda não sei, me mostra de tudo". StrictBool: um texto como "false" é
    # recusado em vez de virar True.
    everything: StrictBool
    stage: StudyStage

    @model_validator(mode="after")
    def topics_or_everything(self) -> Self:
        # A tela desmarca um quando ela escolhe o outro; o servidor confere de
        # novo (RNF-G.03).
        if self.everything and self.topics:
            raise ValueError('Escolha temas ou "me mostra de tudo", não os dois')
        if not self.everything and not self.topics:
            raise ValueError('Escolha pelo menos um tema ou "me mostra de tudo"')
        return self


class ProfileOut(BaseModel):
    """O perfil da menina da sessão, do jeito que o app lê.

    Por enquanto só o que o filé precisa: se ela já viu "Por que filé?"
    (RF-F10.02, #84). O front lê em camelCase (Profile em
    frontend/lib/file-intro.ts). Sem nome, e-mail nem data de nascimento.
    """

    file_intro_seen: bool = Field(serialization_alias="fileIntroSeen")


# O front lê e manda em camelCase (courseStatus, otherCourse). Mesma regra de
# followup/schemas.py, que importa este arquivo e por isso não pode ser
# importado aqui.
_CAMEL_CASE = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class ProfileDetailsOut(BaseModel):
    """O que a A10 mostra do perfil dela (RF-F7.11, RF-F7.12, RF-S2.09).

    Só o que a tela exibe. Sem data de nascimento, hash de senha, ids nem o
    identificador da conta Google. Tudo vai só para ela.
    """

    model_config = _CAMEL_CASE

    name: str
    email: str
    # "Maceió, AL"; vazio se o registro não tem cidade.
    city: str | None
    # Quem tem senha vê "Mudar senha"; quem tem Google vê o cartão do Google.
    # Conta mista (os dois) mostra os dois (P6 do épico #130).
    has_password: bool
    google: bool
    topics: list[OptionOut]
    all_topics: bool
    study_stage: OptionOut | None
    origin: Annotated[GroupOrigin | SelfOrigin, Field(discriminator="kind")]
    opportunity_emails: bool


class ProfileCourseOut(BaseModel):
    """O curso atual dela no perfil (A10, #298) e o nome para a A10b.

    `level` e `course` vêm vazios quando ela não tem curso registrado. O nome
    do curso é o da lista ou o que ela digitou: vai só para ela.
    """

    model_config = _CAMEL_CASE

    first_name: str
    level: CourseLevel | None = None
    course: str | None = None


class ProfileCourseIn(BaseModel):
    """O curso que ela registra pelo perfil (A10b, RF-F6.04, RF-F6.02).

    As mesmas escolhas da pergunta 3 da A18: técnico e graduação pedem o curso
    ("Outro curso" pede o nome); "Tô tentando entrar" e "Ainda não" não levam
    dados de curso. Campos desconhecidos são recusados.
    """

    model_config = ConfigDict(**_CAMEL_CASE, extra="forbid")

    course_status: CourseStatus
    course: CourseCode | None = None
    other_course: Annotated[FreeText | None, AfterValidator(blank_is_none)] = None
    institution: Annotated[FreeText | None, AfterValidator(blank_is_none)] = None

    @property
    def level(self) -> CourseLevel | None:
        """O nível do curso, se ela entrou (técnico ou graduação)."""
        return level_of(self.course_status)

    @model_validator(mode="after")
    def course_rules(self) -> Self:
        # A tela confere antes; o servidor confere de novo (RNF-G.03).
        check_course_fields(
            self.level, self.course, self.other_course, self.institution
        )
        return self
