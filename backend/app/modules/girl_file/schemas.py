import enum
from typing import Self

from pydantic import BaseModel, Field, model_validator

from app.modules.girl_file.models import DismissReason


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
