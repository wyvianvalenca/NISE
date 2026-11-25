from datetime import UTC, datetime
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Path, Query, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.permissions import CoordinatorDep
from app.db.engine import AsyncSessionDep
from app.modules.actions.dependencies import (
    CoordinatorGroupIdDep,
    CoordinatorGroupIdsDep,
)
from app.modules.actions.models import ActionType
from app.modules.actions.service import today_in_maceio
from app.modules.catalog.utils import ACTION_TYPE_LABELS
from app.modules.exports.models import DataExport
from app.modules.exports.schemas import (
    ActionOptionOut,
    ExportColumnOut,
    ExportCutOptionsOut,
    ExportHistoryItemOut,
    ExportIn,
    ExportModelOut,
    ExportOut,
    ExportPreviewOut,
    ExportSummaryOut,
    OptionOut,
)
from app.modules.exports.service import (
    CSV_ENCODING,
    CSV_MEDIA_TYPE,
    PREVIEW_ROWS,
    ExportCut,
    ExportModel,
    Package,
    action_is_of_group,
    build_table,
    create_export,
    cut_options,
    list_history,
    packages_of,
    summarize,
)
from app.modules.girls.models import Topic
from app.modules.girls.utils import TOPIC_LABELS

router = APIRouter(prefix="/coordinator/exports", tags=["Coordinator"])

_NOT_COORDINATOR: dict[int | str, dict[str, Any]] = {
    status.HTTP_403_FORBIDDEN: {"description": "Não é coordenadora ou sem grupo"},
}


async def checked_cut(
    session: AsyncSession, group_id: int, cut: ExportCut
) -> ExportCut:
    """Só se escolhe ação do próprio grupo (RN-07)."""
    if cut.action_id is not None and not await action_is_of_group(
        session, group_id, cut.action_id
    ):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Ação não encontrada")
    return cut


async def cut_from_query(
    group_id: CoordinatorGroupIdDep,
    session: AsyncSessionDep,
    year: Annotated[int | None, Query(ge=2000, le=2100)] = None,
    action_id: Annotated[int | None, Query(ge=1)] = None,
    type: ActionType | None = None,
    tag: Topic | None = None,
) -> ExportCut:
    return await checked_cut(session, group_id, ExportCut(year, action_id, type, tag))


CutDep = Annotated[ExportCut, Depends(cut_from_query)]

_CUT_NOT_FOUND: dict[int | str, dict[str, Any]] = {
    **_NOT_COORDINATOR,
    status.HTTP_404_NOT_FOUND: {"description": "Ação de outro grupo"},
}


def parse_packages(text: str | None) -> list[Package]:
    """ "groups,funnel" vira a lista. "" é só a Base.

    Sem o parâmetro vale "Do meu jeito", que começa sem pacotes, como no POST sem
    corpo: a prévia e o resumo descrevem o mesmo arquivo que sai (RF-F24.10, D-104).
    """
    if text is None:
        return list(packages_of(None))
    try:
        return [Package(name) for name in text.split(",") if name]
    except ValueError:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT, "Pacote desconhecido"
        ) from None


# O grupo vem sempre da sessão, nunca da requisição (RN-07, RNF-G.03).
@router.get("/options", response_model=ExportCutOptionsOut, responses=_NOT_COORDINATOR)
async def options_route(
    group_id: CoordinatorGroupIdDep, session: AsyncSessionDep
) -> ExportCutOptionsOut:
    """O que a coordenadora escolhe nos seletores do "Recorte" (RF-F24.09)."""
    options = await cut_options(session, group_id)
    return ExportCutOptionsOut(
        years=options.years,
        actions=[ActionOptionOut(**vars(a)) for a in options.actions],
        types=[
            OptionOut(value=t.value, label=ACTION_TYPE_LABELS[t]) for t in ActionType
        ],
        tags=[OptionOut(value=t.value, label=TOPIC_LABELS[t]) for t in Topic],
        models=[
            ExportModelOut(value=m, packages=list(packages_of(m))) for m in ExportModel
        ],
    )


PackagesQuery = Annotated[
    str | None,
    Query(
        description=(
            "Pacotes ligados, separados por vírgula. Sem o parâmetro vale"
            ' "Do meu jeito": só a Base, sem as meninas sem ação.'
        )
    ),
]


@router.get("/summary", response_model=ExportSummaryOut, responses=_CUT_NOT_FOUND)
async def summary_route(
    group_id: CoordinatorGroupIdDep,
    session: AsyncSessionDep,
    cut: CutDep,
    packages: PackagesQuery = None,
) -> ExportSummaryOut:
    """Linhas, meninas, sem ação e ações do arquivo desse recorte (RF-F24.33).

    As meninas sem ação só contam com o pacote "Grupos de comparação" (D-106).
    """
    summary = await summarize(session, group_id, cut, parse_packages(packages))
    return ExportSummaryOut(**vars(summary))


@router.get("/preview", response_model=ExportPreviewOut, responses=_CUT_NOT_FOUND)
async def preview_route(
    group_id: CoordinatorGroupIdDep,
    session: AsyncSessionDep,
    cut: CutDep,
    packages: PackagesQuery = None,
) -> ExportPreviewOut:
    """Cinco linhas do arquivo que vai sair, para o passo "Revisão" (RF-F24.32)."""
    chosen = parse_packages(packages)
    table = await build_table(
        session,
        group_id,
        today_in_maceio(),
        PREVIEW_ROWS,
        packages=chosen,
        cut=cut,
    )
    return ExportPreviewOut(
        columns=[
            ExportColumnOut(key=c.key, label=c.label, kind=c.kind)
            for c in table.columns
        ],
        rows=table.rows,
        no_action=table.no_action,
        total_rows=(await summarize(session, group_id, cut, chosen)).rows,
    )


@router.post(
    "",
    response_model=ExportOut,
    status_code=status.HTTP_201_CREATED,
    responses=_CUT_NOT_FOUND,
)
async def create_export_route(
    user: CoordinatorDep,
    group_id: CoordinatorGroupIdDep,
    session: AsyncSessionDep,
    body: ExportIn | None = None,
) -> ExportOut:
    """Gera o CSV anônimo do recorte e registra a exportação (RF-F24.34, RN-07)."""
    wanted = body or ExportIn()
    cut = await checked_cut(
        session,
        group_id,
        ExportCut(wanted.year, wanted.action_id, wanted.type, wanted.tag),
    )
    export = await create_export(
        session,
        group_id,
        user.id,
        today_in_maceio(),
        packages=wanted.packages,
        cut=cut,
        model=wanted.model,
    )
    return ExportOut.model_validate(export, from_attributes=True)


@router.get("", response_model=list[ExportHistoryItemOut], responses=_NOT_COORDINATOR)
async def history_route(
    group_id: CoordinatorGroupIdDep, session: AsyncSessionDep
) -> list[ExportHistoryItemOut]:
    """O histórico do grupo, com as exportações de todas as coordenadoras (RF-F24.07)."""
    items = await list_history(session, group_id)
    return [ExportHistoryItemOut.model_validate(i, from_attributes=True) for i in items]


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
    """Baixa o CSV, em UTF-8 com BOM. Precisa de sessão e vale 15 minutos (RF-F24.34)."""
    export = await session.get(DataExport, export_id)
    if export is None or export.group_id not in group_ids:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Exportação não encontrada")
    if export.content is None or export.expires_at <= datetime.now(UTC):
        raise HTTPException(status.HTTP_410_GONE, "O link expirou")

    return Response(
        content=export.content.encode(CSV_ENCODING),
        media_type=CSV_MEDIA_TYPE,
        headers={
            "Content-Disposition": f'attachment; filename="{export.filename}"',
            "Cache-Control": "no-store",
        },
    )
