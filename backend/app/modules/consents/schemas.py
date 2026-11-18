from typing import Annotated, Literal

from pydantic import BaseModel, Field, StrictBool, StringConstraints


class GroupOrigin(BaseModel):
    """Ela veio pelo convite de um grupo (M1): a liderança dele vê os dados dela (RN-01)."""

    kind: Literal["group"] = "group"
    # O front lê em camelCase (Origin.groupName em frontend/lib/signup-api.ts).
    group_name: str = Field(serialization_alias="groupName")


class SelfOrigin(BaseModel):
    """Ela chegou sozinha (M2): os grupos só veem números gerais (RN-04)."""

    kind: Literal["self"] = "self"


class TermsSummaryOut(BaseModel):
    """O que a A04·1 precisa para montar o resumo dos termos (RF-F7.03, RF-F7.04).

    O texto fica no front; aqui vão só a versão que ela vai aceitar e a origem,
    que decide qual versão do resumo ela lê.
    """

    version: str
    origin: Annotated[GroupOrigin | SelfOrigin, Field(discriminator="kind")]


class TermsAcceptanceIn(BaseModel):
    """A versão dos termos que ela leu e aceitou na A04·1 (RF-F7.05).

    O servidor só aceita a versão atual; quem confere é o serviço.
    """

    version: Annotated[str, StringConstraints(max_length=32)]


class OpportunityEmailsIn(BaseModel):
    """A escolha dela na A04·2: quer ou não receber oportunidades por e-mail (RF-F7.06).

    StrictBool: só aceita true ou false. Um texto como "false" é recusado em
    vez de virar True.
    """

    enabled: StrictBool
