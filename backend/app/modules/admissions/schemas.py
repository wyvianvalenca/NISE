from datetime import datetime

from pydantic import BaseModel, Field

from app.modules.admissions.models import AdmissionOrigin


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


class EnrollmentPageOut(BaseModel):
    """Uma página da lista e o que a paginação precisa (D-77)."""

    items: list[EnrollmentRowOut]
    # Quantas meninas a lista tem ao todo, o número ao lado do título.
    total: int
    page: int
    page_size: int = Field(serialization_alias="pageSize")
