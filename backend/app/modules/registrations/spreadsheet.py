"""Reading a spreadsheet of registrations and building its review (C2, #234).

Pure functions: they only see the bytes they are given and never log or put a
value of the file in an error (RN-27, privacy rules). Routes wire them to HTTP.
"""

import csv
import io
import re
import unicodedata
from dataclasses import dataclass, field
from datetime import date, datetime, time
from enum import StrEnum
from typing import Any

from email_validator import EmailNotValidError, validate_email
from openpyxl import load_workbook

from app.modules.girls.models import StudyStage
from app.modules.registrations.service import infer_study_stage, parse_study_stage

MAX_BYTES = 5 * 1024 * 1024
MAX_LINES = 2000


class SpreadsheetError(Exception):
    """`code` is one of unsupported_type, unreadable_file, empty_file, too_large,
    missing_columns. Never carries a value of the file."""

    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


@dataclass(frozen=True)
class SheetLine:
    # 1-based number of the data line (header excluded, empty lines skipped),
    # so the last one equals `len(lines)`, the "26 linhas" of the screen.
    line: int
    values: dict[str, str]  # column name -> stripped text


@dataclass(frozen=True)
class Sheet:
    file_name: str
    columns: list[str]
    lines: list[SheetLine]


# --- reading ---------------------------------------------------------------


def _clean_columns(raw: list[str]) -> list[str]:
    columns: list[str] = []
    for index, cell in enumerate(raw, start=1):
        base = cell.strip() or f"Coluna {index}"
        name, count = base, 1
        while name in columns:
            count += 1
            name = f"{base} ({count})"
        columns.append(name)
    return columns


def _cell_text(value: object) -> str:
    if value is None:
        return ""
    if isinstance(value, bool):
        return str(value)
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    if isinstance(value, datetime):
        if value.time() == time(0):
            return value.date().isoformat()
        return value.isoformat()
    if isinstance(value, date):
        return value.isoformat()
    return str(value).strip()


def _decode_csv(content: bytes) -> str:
    if b"\x00" in content:
        raise SpreadsheetError("unreadable_file")
    try:
        return content.decode("utf-8-sig")
    except UnicodeDecodeError:
        pass
    try:
        return content.decode("cp1252")
    except UnicodeDecodeError:
        raise SpreadsheetError("unreadable_file") from None


def _read_csv_rows(content: bytes) -> list[list[str]]:
    text = _decode_csv(content)

    def parse(delimiter: str) -> list[list[str]]:
        return list(csv.reader(io.StringIO(text, newline=""), delimiter=delimiter))

    try:
        # The separator is the one that splits the header into more columns
        # (csv respects quotes); a tie keeps ",".
        by_comma, by_semicolon = parse(","), parse(";")
    except csv.Error:
        raise SpreadsheetError("unreadable_file") from None
    comma_width = len(by_comma[0]) if by_comma else 0
    semicolon_width = len(by_semicolon[0]) if by_semicolon else 0
    return by_semicolon if semicolon_width > comma_width else by_comma


def _read_xlsx_rows(content: bytes) -> list[list[str]]:
    try:
        workbook = load_workbook(io.BytesIO(content), read_only=True, data_only=True)
    except Exception:  # noqa: BLE001 - openpyxl raises many types for a broken file
        raise SpreadsheetError("unreadable_file") from None
    try:
        sheet = workbook.worksheets[0] if workbook.worksheets else None
        if sheet is None:
            raise SpreadsheetError("empty_file")
        # Stops at the line limit (header + MAX_LINES) instead of loading a
        # huge sheet whole: blank rows don't count, as below.
        rows: list[list[str]] = []
        filled = 0
        for values in sheet.iter_rows(values_only=True):
            row = [_cell_text(c) for c in values]
            rows.append(row)
            if any(cell.strip() for cell in row):
                filled += 1
                if filled > MAX_LINES + 1:
                    raise SpreadsheetError("too_large")
        return rows
    except SpreadsheetError:
        raise
    except Exception:  # noqa: BLE001
        raise SpreadsheetError("unreadable_file") from None
    finally:
        workbook.close()


def read_spreadsheet(file_name: str, content: bytes) -> Sheet:
    """RF-F1.01: CSV (UTF-8 with/without BOM, cp1252; "," or ";") or XLSX."""
    lowered = file_name.lower()
    if lowered.endswith(".csv"):
        is_csv = True
    elif lowered.endswith(".xlsx"):
        is_csv = False
    else:
        raise SpreadsheetError("unsupported_type")
    if len(content) > MAX_BYTES:
        raise SpreadsheetError("too_large")
    if not content.strip():
        raise SpreadsheetError("empty_file")

    rows = _read_csv_rows(content) if is_csv else _read_xlsx_rows(content)
    rows = [[cell.strip() for cell in row] for row in rows]
    # Leading blank rows before the header are not a header.
    while rows and not any(rows[0]):
        rows.pop(0)
    if not rows:
        raise SpreadsheetError("empty_file")

    width = len(rows[0])
    while width and not rows[0][width - 1]:
        width -= 1  # trailing empty header cells (xlsx pads rows)
    columns = _clean_columns(rows[0][:width])
    if not columns:
        raise SpreadsheetError("empty_file")

    lines: list[SheetLine] = []
    for row in rows[1:]:
        if not any(row):
            continue
        padded = (row + [""] * width)[:width]
        lines.append(SheetLine(len(lines) + 1, dict(zip(columns, padded, strict=True))))
        if len(lines) > MAX_LINES:
            raise SpreadsheetError("too_large")
    if not lines:
        raise SpreadsheetError("empty_file")
    return Sheet(file_name=file_name, columns=columns, lines=lines)


# --- mapping ---------------------------------------------------------------


@dataclass(frozen=True)
class Mapping:
    name: str | None = None
    email: str | None = None
    whatsapp: str | None = None
    study_stage: str | None = None
    school_year: str | None = None


def _plain(text: str) -> str:
    decomposed = unicodedata.normalize("NFKD", text)
    letters = "".join(c for c in decomposed if not unicodedata.combining(c))
    return letters.lower()


def suggest_mapping(columns: list[str]) -> Mapping:
    """RF-F1.02: suggests by the header only; each column is used at most once."""
    plain = [(column, _plain(column)) for column in columns]
    used: set[str] = set()

    def pick(match: Any, prefer: str | None = None) -> str | None:
        found = [c for c, p in plain if c not in used and match(p)]
        if prefer:
            found.sort(key=lambda c: prefer not in _plain(c))  # stable: preferred first
        if not found:
            return None
        used.add(found[0])
        return found[0]

    def is_name(p: str) -> bool:
        words = set(re.findall(r"[a-z0-9]+", p))
        return "nome" in p and "mail" not in p and not words & {"mae", "responsavel"}

    name = pick(is_name, prefer="nome completo")
    email = pick(lambda p: "mail" in p)
    whatsapp = pick(
        lambda p: any(k in p for k in ("whats", "telefone", "celular", "contato"))
    )
    study_stage = pick(lambda p: "escolaridade" in p or "nivel" in p)
    school_year = pick(lambda p: "serie" in p or "ano escolar" in p)
    return Mapping(name, email, whatsapp, study_stage, school_year)


def validate_mapping(sheet: Sheet, mapping: Mapping) -> None:
    """RF-F1.03: name and e-mail are required; every column must be in the file."""
    if not mapping.name or not mapping.email:
        raise SpreadsheetError("missing_columns")
    chosen = [
        mapping.name,
        mapping.email,
        mapping.whatsapp,
        mapping.study_stage,
        mapping.school_year,
    ]
    if any(column is not None and column not in sheet.columns for column in chosen):
        raise SpreadsheetError("missing_columns")


# --- review ----------------------------------------------------------------


class ReviewReason(StrEnum):
    INCOMPLETE_EMAIL = "incomplete_email"
    MISSING_EMAIL = "missing_email"
    MISSING_NAME = "missing_name"


@dataclass(frozen=True)
class ReadyRow:
    line: int
    name: str
    email: str
    whatsapp: str | None
    study_stage: StudyStage | None
    school_year: str | None


@dataclass(frozen=True)
class ReviewRow:
    line: int
    name: str
    email: str  # as typed, may be ""
    reason: ReviewReason


@dataclass(frozen=True)
class Repeated:
    name: str
    email: str
    count: int  # times the e-mail appears among valid rows


@dataclass(frozen=True)
class Review:
    ready: list[ReadyRow] = field(default_factory=list)
    to_review: list[ReviewRow] = field(default_factory=list)
    repeated: list[Repeated] = field(default_factory=list)
    invalid_corrections: list[int] = field(default_factory=list)


def _is_valid_email(value: str) -> bool:
    try:
        validate_email(value, check_deliverability=False)
    except EmailNotValidError:
        return False
    return True


def _problem(name: str, email: str) -> ReviewReason | None:
    if not name:
        return ReviewReason.MISSING_NAME
    if not email:
        return ReviewReason.MISSING_EMAIL
    if not _is_valid_email(email):
        return ReviewReason.INCOMPLETE_EMAIL
    return None


def build_review(
    sheet: Sheet,
    mapping: Mapping,
    corrections: dict[int, str] | None = None,
    skip: set[int] | None = None,
) -> Review:
    """RF-F1.05/06: splits the lines into ready, to review and repeated."""
    validate_mapping(sheet, mapping)
    corrections = corrections or {}
    skip = skip or set()
    assert mapping.name and mapping.email  # validate_mapping guarantees it

    ready: list[ReadyRow] = []
    to_review: list[ReviewRow] = []
    invalid: list[int] = []
    first_index: dict[str, int] = {}
    counts: dict[str, int] = {}

    for row in sheet.lines:
        line, values = row.line, row.values
        name = values[mapping.name]
        raw_email = values[mapping.email]
        if line in skip and _problem(name, raw_email) is not None:
            continue  # "Não importar"
        email = corrections[line].strip() if line in corrections else raw_email
        reason = _problem(name, email)
        if line in corrections and email and not _is_valid_email(email):
            invalid.append(line)
        if reason is not None:
            to_review.append(ReviewRow(line, name, email, reason))
            continue

        normalized = email.lower()
        counts[normalized] = counts.get(normalized, 0) + 1
        if normalized in first_index:
            continue  # repeated: the first occurrence stays in ready
        first_index[normalized] = len(ready)
        stage_text = values[mapping.study_stage] if mapping.study_stage else None
        year = (values[mapping.school_year] if mapping.school_year else "") or None
        ready.append(
            ReadyRow(
                line=line,
                name=name,
                email=normalized,
                whatsapp=(values[mapping.whatsapp] if mapping.whatsapp else "") or None,
                study_stage=infer_study_stage(parse_study_stage(stage_text), year),
                school_year=year,
            )
        )

    repeated = [
        Repeated(ready[index].name, email, counts[email])
        for email, index in first_index.items()
        if counts[email] > 1
    ]
    return Review(ready, to_review, repeated, invalid)
