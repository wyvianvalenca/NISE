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


class GoogleSignupCompleteIn(BaseModel):
    """O que falta no cadastro pelo Google: data de nascimento e cidade (A02b).

    Nome e e-mail vêm do Google, pelo cookie do cadastro pendente, e não daqui.
    """

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    birth_date: date
    # Código IBGE do município. O front manda como texto ("2704302").
    city_id: int
    # True quando a tela avisou que o convite venceu e ela seguiu sem ele.
    without_invite: bool = False


class SignupOut(UserOut):
    # O cadastro sempre segue para os termos (H3).
    next_step: Literal["terms"] = Field(default="terms", serialization_alias="nextStep")


class PendingSignupOut(BaseModel):
    """O que veio do Google, para a A02b mostrar (#52). Só leitura."""

    name: str
    email: str
    # O código com que ela começou, para "Usar outra conta" voltar ao Google
    # com ele (RN-29). Não é dado dela: já estava no link do convite.
    invite: str | None


class LoginIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class SessionOut(UserOut):
    """A conta que acabou de entrar e a tela para onde ela vai (A15, #330)."""

    next_path: str = Field(serialization_alias="nextPath")


class HomeOut(BaseModel):
    """A primeira tela de quem já entrou, para a A01 mandá-la adiante."""

    next_path: str = Field(serialization_alias="nextPath")


class ForgotPasswordIn(BaseModel):
    """O e-mail da conta que esqueceu a senha (A16, #331)."""

    email: Annotated[str, StringConstraints(strip_whitespace=True, max_length=254)]


# O token do link tem 43 caracteres (secrets.token_urlsafe(32)); o teto só
# protege o servidor.
ResetToken = Annotated[str, StringConstraints(min_length=1, max_length=128)]


class ResetTokenIn(BaseModel):
    """O token do link de nova senha. Vai no corpo, não na URL da API, para
    não ficar em logs de acesso."""

    token: ResetToken


class ResetTokenOut(BaseModel):
    """O e-mail da conta, que a A16b mostra ("Pra conta alana@...")."""

    email: str


class ResetPasswordIn(BaseModel):
    """A senha nova da A16b (#331). O tamanho mínimo é conferido na rota."""

    token: ResetToken
    # Sem teto, uma senha gigante prenderia o servidor no Argon2.
    password: Annotated[str, StringConstraints(max_length=128)]
