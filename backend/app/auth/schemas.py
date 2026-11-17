from typing import Annotated

from pydantic import BaseModel, EmailStr, Field, StringConstraints


class RegisterIn(BaseModel):
    name: Annotated[
        str, StringConstraints(strip_whitespace=True, min_length=1, max_length=128)
    ]
    email: EmailStr
    password: Annotated[str, StringConstraints(min_length=8, max_length=128)]


class LoginIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)
