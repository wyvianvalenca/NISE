from datetime import date
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, StringConstraints
from pydantic.alias_generators import to_camel

from app.users.schemas import UserOut


class EmailSignupIn(BaseModel):
    """Cadastro por e-mail e senha (A02, #51).

    O front manda em camelCase (birthDate, cityId). O formato do e-mail, o
    tamanho mínimo da senha, a idade, a cidade e o convite são conferidos no
    serviço, que devolve um código que o front sabe mostrar junto ao campo.
    Aqui ficam só os limites que protegem o servidor.
    """

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    name: Annotated[
        str, StringConstraints(strip_whitespace=True, min_length=1, max_length=128)
    ]
    email: Annotated[str, StringConstraints(strip_whitespace=True, max_length=254)]
    # Sem teto, uma senha gigante prenderia o servidor no Argon2.
    password: Annotated[str, StringConstraints(max_length=128)]
    birth_date: date
    # Código IBGE do município. O front manda como texto ("2704302").
    city_id: int
    # Código do convite, quando ela veio por um. Decide a origem da conta.
    invite: Annotated[str, StringConstraints(max_length=64)] | None = None


class EmailSignupOut(UserOut):
    # O cadastro sempre segue para os termos (H3).
    next_step: Literal["terms"] = Field(default="terms", serialization_alias="nextStep")


class LoginIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)
