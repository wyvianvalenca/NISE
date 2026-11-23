from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

from app.modules.actions.models import ActionType
from app.modules.exports.service import ExportModel, Package
from app.modules.girls.models import Topic


class _CamelModel(BaseModel):
    """O front lê em camelCase."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class ExportIn(_CamelModel):
    """O que a coordenadora escolheu: modelo, recorte e pacotes (RF-F24.08 a 10).

    Campo vazio no recorte é "todos". A Base sempre sai; sem `packages` valem os do
    modelo (sem modelo, "Do meu jeito", D-104) e `packages` vazio é só a Base.
    """

    model: ExportModel | None = None
    packages: list[Package] | None = None
    year: int | None = Field(default=None, ge=2000, le=2100)
    action_id: int | None = Field(default=None, ge=1)
    type: ActionType | None = None
    tag: Topic | None = None


class OptionOut(_CamelModel):
    value: str
    label: str


class ActionOptionOut(_CamelModel):
    id: int
    name: str
    starts_on: date


class ExportModelOut(_CamelModel):
    """Um modelo do primeiro passo e os pacotes que ele já liga (RF-F24.10)."""

    value: ExportModel
    packages: list[Package]


class ExportCutOptionsOut(_CamelModel):
    """O que ela pode escolher no "Recorte": só dados do próprio grupo."""

    years: list[int]
    actions: list[ActionOptionOut]
    types: list[OptionOut]
    tags: list[OptionOut]
    models: list[ExportModelOut]


class ExportSummaryOut(_CamelModel):
    """O resumo da barra escura, em "Recorte" e "Conteúdo" (RF-F24.33)."""

    rows: int
    girls: int
    alone: int
    actions: int


class ExportColumnOut(_CamelModel):
    key: str
    label: str
    kind: Literal["code", "generalized", "action"]


class ExportPreviewOut(_CamelModel):
    """As primeiras linhas do arquivo que vai sair (RF-F24.32).

    Os códigos são de mentira: o arquivo de verdade sorteia outros.
    """

    columns: list[ExportColumnOut]
    rows: list[list[str]]
    total_rows: int


class ExportOut(_CamelModel):
    """O arquivo pronto (RF-F24.34). O CSV se baixa por `GET .../{id}/file`."""

    id: int
    filename: str
    row_count: int
    column_count: int
    expires_at: datetime


class ExportHistoryItemOut(_CamelModel):
    """Uma linha do histórico: quem, quando, o recorte e quantas linhas (RF-F24.07)."""

    id: int
    who: str
    created_at: datetime
    cut: str
    row_count: int
