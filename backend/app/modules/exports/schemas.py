from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel

from app.modules.exports.service import Package


class _CamelModel(BaseModel):
    """O front lê em camelCase."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


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


class ExportIn(_CamelModel):
    """Os pacotes ligados. A Base sempre sai; lista vazia é só a Base (RF-F24.08)."""

    packages: list[Package]


class ExportHistoryItemOut(_CamelModel):
    """Uma linha do histórico: quem, quando, o recorte e quantas linhas (RF-F24.07)."""

    id: int
    who: str
    created_at: datetime
    cut: str
    row_count: int
