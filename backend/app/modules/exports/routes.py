from datetime import UTC, datetime
from typing import Annotated, Any

from fastapi import APIRouter, HTTPException, Path, Query, Response, status
from sqlalchemy import func, select

from app.auth.permissions import CoordinatorDep
from app.db.engine import AsyncSessionDep
from app.modules.actions.dependencies import (
    CoordinatorGroupIdDep,
    CoordinatorGroupIdsDep,
)
from app.modules.actions.models import Action, Participation
from app.modules.actions.service import today_in_maceio
from app.modules.exports.models import DataExport
from app.modules.exports.schemas import (
    ExportColumnOut,
    ExportIn,
    ExportOut,
    ExportPreviewOut,
)
from app.modules.exports.service import (
    DEFAULT_PACKAGES,
    PREVIEW_ROWS,
    Package,
    build_table,
    create_export,
)

router = APIRouter(prefix="/coordinator/exports", tags=["Coordinator"])

_NOT_COORDINATOR: dict[int | str, dict[str, Any]] = {
    status.HTTP_403_FORBIDDEN: {"description": "Não é coordenadora ou sem grupo"},
}


def parse_packages(text: str | None) -> list[Package]:
    """ "groups,funnel" vira a lista. Sem o parâmetro vale o padrão; "" é só a Base."""
    if text is None:
        return list(DEFAULT_PACKAGES)
    try:
        return [Package(name) for name in text.split(",") if name]
    except ValueError:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT, "Pacote desconhecido"
        ) from None


# O grupo vem sempre da sessão, nunca da requisição (RN-07, RNF-G.03).
@router.get("/preview", response_model=ExportPreviewOut, responses=_NOT_COORDINATOR)
async def preview_route(
    group_id: CoordinatorGroupIdDep,
    session: AsyncSessionDep,
    packages: Annotated[
        str | None, Query(description="Pacotes ligados, separados por vírgula")
    ] = None,
) -> ExportPreviewOut:
    """Cinco linhas do arquivo que vai sair, para o passo "Revisão" (RF-F24.32)."""
    table = await build_table(
        session,
        group_id,
        today_in_maceio(),
        PREVIEW_ROWS,
        parse_packages(packages),
    )
    total = await session.scalar(
        select(func.count(Participation.id))
        .join(Action, Action.id == Participation.action_id)
        .where(Action.group_id == group_id)
    )
    return ExportPreviewOut(
        columns=[
            ExportColumnOut(key=c.key, label=c.label, kind=c.kind)
            for c in table.columns
        ],
        rows=table.rows,
        total_rows=total or 0,
    )


@router.post(
    "",
    response_model=ExportOut,
    status_code=status.HTTP_201_CREATED,
    responses=_NOT_COORDINATOR,
)
async def create_export_route(
    user: CoordinatorDep,
    group_id: CoordinatorGroupIdDep,
    session: AsyncSessionDep,
    body: ExportIn | None = None,
) -> ExportOut:
    """Gera o CSV anônimo do grupo e registra a exportação (RF-F24.34, RN-07)."""
    packages = DEFAULT_PACKAGES if body is None else body.packages
    export = await create_export(
        session, group_id, user.id, today_in_maceio(), packages=packages
    )
    return ExportOut.model_validate(export, from_attributes=True)


@router.get(
    "/{export_id}/file",
    response_class=Response,
    responses={
        **_NOT_COORDINATOR,
        status.HTTP_404_NOT_FOUND: {"description": "Exportação de outro grupo"},
        status.HTTP_410_GONE: {"description": "O link expirou"},
    },
)
async def download_route(
    export_id: Annotated[int, Path(ge=1)],
    group_ids: CoordinatorGroupIdsDep,
    session: AsyncSessionDep,
) -> Response:
    """Baixa o CSV. Precisa de sessão e vale 15 minutos (RF-F24.34)."""
    export = await session.get(DataExport, export_id)
    if export is None or export.group_id not in group_ids:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Exportação não encontrada")
    if export.content is None or export.expires_at <= datetime.now(UTC):
        raise HTTPException(status.HTTP_410_GONE, "O link expirou")

    return Response(
        content=export.content.encode("utf-8"),
        media_type="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": f'attachment; filename="{export.filename}"',
            "Cache-Control": "no-store",
        },
    )
