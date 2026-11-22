import json
from dataclasses import asdict
from typing import Annotated, Any

from fastapi import APIRouter, File, Form, Query, UploadFile, status
from fastapi.responses import JSONResponse
from pydantic import TypeAdapter, ValidationError
from sqlalchemy import func, select

from app.db.engine import AsyncSessionDep
from app.modules.actions.dependencies import CoordinatorGroupIdsDep, GroupActionDep
from app.modules.actions.models import Action, Participation
from app.modules.girls.models import Girl
from app.modules.registrations.schemas import (
    CorrectionBody,
    ImportOut,
    ImportReadOut,
    ImportRepeatedOut,
    ImportReviewOut,
    ImportReviewRowOut,
    ImportRowOut,
    MappingBody,
    RegistrationListOut,
    RegistrationOut,
)
from app.modules.registrations.service import (
    RegistrationData,
    list_registrations,
    register_girl,
    registration_columns,
)
from app.modules.registrations.spreadsheet import (
    MAX_BYTES,
    Mapping,
    Review,
    Sheet,
    SpreadsheetError,
    build_review,
    read_spreadsheet,
    suggest_mapping,
)

router = APIRouter(prefix="/actions/{action_id}/registrations", tags=["Registrations"])

NOT_FOUND: dict[int | str, dict[str, Any]] = {
    status.HTTP_404_NOT_FOUND: {"description": "Ação não encontrada"}
}


# The card "Inscritas" of the action page (K11, #233, RF-F1.14). An action of
# another group is a 404 (RNF-G.03, RN-01). `columns` ignores search and paging.
@router.get("", response_model=RegistrationListOut, responses=NOT_FOUND)
async def list_registrations_route(
    action: GroupActionDep,
    session: AsyncSessionDep,
    search: Annotated[str | None, Query(max_length=100)] = None,
    offset: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int, Query(ge=1, le=500)] = 50,
) -> RegistrationListOut:
    rows, total = await list_registrations(session, action, search, offset, limit)

    return RegistrationListOut(
        items=[
            RegistrationOut(
                id=participation.id,
                name=name,
                email=email,
                whatsapp=participation.whatsapp,
                study_stage=participation.study_stage,
                school_year=participation.school_year,
            )
            for participation, name, email in rows
        ],
        total=total,
        columns=await registration_columns(session, action),
    )


# --- import of a spreadsheet (#234, RF-F1.01 to RF-F1.08, RN-27) ---
# The file travels in every request and is never stored; nothing of a girl is
# logged or put in an error, only a code.

UNPROCESSABLE: dict[int | str, dict[str, Any]] = {
    status.HTTP_404_NOT_FOUND: {"description": "Ação não encontrada"},
    status.HTTP_422_UNPROCESSABLE_CONTENT: {
        "description": (
            '{"error": "unsupported_type" | "unreadable_file" | "empty_file" | '
            '"too_large" | "missing_columns" | "invalid_request"}, or '
            '{"error": "invalid_corrections", "lines": [...]} on the import'
        )
    },
}


def _error(code: str, **extra: object) -> JSONResponse:
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
        content={"error": code, **extra},
    )


async def _read_sheet(file: UploadFile) -> Sheet:
    # One byte more than the limit is enough to know it is too large.
    content = await file.read(MAX_BYTES + 1)
    return read_spreadsheet(file.filename or "", content)


def _parse_mapping(text: str) -> Mapping:
    return Mapping(**MappingBody.model_validate_json(text).model_dump())


async def _already_in_action(
    session: AsyncSessionDep, action: Action, emails: list[str]
) -> set[str]:
    if not emails:
        return set()
    found = await session.scalars(
        select(Girl.email)
        .join(Participation, Participation.girl_id == Girl.id)
        .where(Participation.action_id == action.id, Girl.email.in_(emails))
    )
    return set(found.all())


@router.post(
    "/import/read",
    response_model=ImportReadOut,
    responses=UNPROCESSABLE,
)
async def import_read_route(
    action: GroupActionDep, file: Annotated[UploadFile, File()]
) -> ImportReadOut | JSONResponse:
    """Step 1: the columns of the file, its first line and a suggested mapping."""
    try:
        sheet = await _read_sheet(file)
    except SpreadsheetError as error:
        return _error(error.code)

    return ImportReadOut(
        file_name=sheet.file_name,
        line_count=len(sheet.lines),
        columns=sheet.columns,
        first_line=sheet.lines[0].values,
        suggested=MappingBody(**asdict(suggest_mapping(sheet.columns))),
    )


def _review_out(sheet: Sheet, review: Review, in_action: set[str]) -> ImportReviewOut:
    already = sum(1 for row in review.ready if row.email in in_action)
    return ImportReviewOut(
        file_name=sheet.file_name,
        line_count=len(sheet.lines),
        ready=[ImportRowOut(**asdict(row)) for row in review.ready],
        to_review=[
            ImportReviewRowOut(
                line=row.line, name=row.name, email=row.email, reason=row.reason.value
            )
            for row in review.to_review
        ],
        repeated=[ImportRepeatedOut(**asdict(row)) for row in review.repeated],
        already_in_action=already,
        new_count=len(review.ready) - already,
    )


@router.post("/import/review", response_model=ImportReviewOut, responses=UNPROCESSABLE)
async def import_review_route(
    action: GroupActionDep,
    session: AsyncSessionDep,
    file: Annotated[UploadFile, File()],
    mapping: Annotated[str, Form()],
) -> ImportReviewOut | JSONResponse:
    """Step 2: ready, to review and repeated lines. Saves nothing."""
    try:
        parsed = _parse_mapping(mapping)
    except ValidationError:
        return _error("missing_columns")
    try:
        sheet = await _read_sheet(file)
        review = build_review(sheet, parsed)
    except SpreadsheetError as error:
        return _error(error.code)

    in_action = await _already_in_action(
        session, action, [row.email for row in review.ready]
    )
    return _review_out(sheet, review, in_action)


@router.post("/import", response_model=ImportOut, responses=UNPROCESSABLE)
async def import_route(
    action: GroupActionDep,
    group_ids: CoordinatorGroupIdsDep,
    session: AsyncSessionDep,
    file: Annotated[UploadFile, File()],
    mapping: Annotated[str, Form()],
    corrections: Annotated[str, Form()] = "[]",
    skip: Annotated[str, Form()] = "[]",
) -> ImportOut | JSONResponse:
    """Registers the new girls, all or nothing: one commit at the end (RF-F1.08)."""
    try:
        parsed = _parse_mapping(mapping)
        fixes = TypeAdapter(list[CorrectionBody]).validate_json(corrections)
        skipped = TypeAdapter(list[int]).validate_json(skip)
    except (ValidationError, json.JSONDecodeError):
        return _error("invalid_request")
    try:
        sheet = await _read_sheet(file)
        review = build_review(
            sheet,
            parsed,
            {fix.line: fix.email for fix in fixes},
            set(skipped),
        )
    except SpreadsheetError as error:
        return _error(error.code)

    if review.invalid_corrections:
        return _error("invalid_corrections", lines=review.invalid_corrections)

    imported = 0
    already = 0
    # A savepoint, so a failure in the middle undoes the lines already done
    # even when the caller's transaction goes on; the commit comes only at the end.
    async with session.begin_nested():
        for row in review.ready:
            result = await register_girl(
                session,
                action,
                group_ids,
                RegistrationData(
                    name=row.name,
                    email=row.email,
                    whatsapp=row.whatsapp,
                    study_stage=row.study_stage,
                    school_year=row.school_year,
                ),
            )
            if result.already_registered:
                already += 1
            else:
                imported += 1
    await session.commit()

    registered_count = await session.scalar(
        select(func.count())
        .select_from(Participation)
        .where(Participation.action_id == action.id)
    )
    return ImportOut(
        imported=imported,
        already_in_action=already,
        registered_count=registered_count or 0,
    )
