"""Spreadsheet of registrations: reading, suggested columns and review (#234)."""

import io

import pytest
from openpyxl import Workbook

from app.modules.girls.models import StudyStage
from app.modules.registrations.spreadsheet import (
    Mapping,
    ReviewReason,
    Sheet,
    SpreadsheetError,
    build_review,
    read_spreadsheet,
    suggest_mapping,
    validate_mapping,
)

MAP = Mapping(
    name="Nome",
    email="E-mail",
    whatsapp="Zap",
    study_stage="Nivel",
    school_year="Serie",
)


def csv_bytes(rows: list[list[str]], sep: str = ",") -> bytes:
    return "\n".join(sep.join(r) for r in rows).encode()


def code_of(name: str, content: bytes) -> str:
    with pytest.raises(SpreadsheetError) as error:
        read_spreadsheet(name, content)
    return error.value.code


def test_csv_with_comma_and_semicolon() -> None:
    rows = [["Nome", "E-mail"], ["Ana Teste", "ana@exemplo.com"]]
    for sep in (",", ";"):
        sheet = read_spreadsheet("a.csv", csv_bytes(rows, sep))
        assert sheet.columns == ["Nome", "E-mail"]
        assert sheet.lines[0].line == 1
        assert sheet.lines[0].values["E-mail"] == "ana@exemplo.com"


def test_csv_quotes_are_respected() -> None:
    content = b'Nome;E-mail\n"Silva, Ana";ana@exemplo.com\n'
    sheet = read_spreadsheet("a.csv", content)
    assert sheet.lines[0].values["Nome"] == "Silva, Ana"


def test_csv_bom_and_accents() -> None:
    content = "﻿Nome;Série\nJoão Átila;8º ano\n".encode()
    sheet = read_spreadsheet("a.csv", content)
    assert sheet.columns == ["Nome", "Série"]
    assert sheet.lines[0].values["Nome"] == "João Átila"


def test_csv_cp1252_fallback() -> None:
    content = "Nome;Série\nJosé;8º ano\n".encode("cp1252")
    sheet = read_spreadsheet("a.csv", content)
    assert sheet.lines[0].values == {"Nome": "José", "Série": "8º ano"}


def test_xlsx_first_sheet_numbers_and_dates() -> None:
    from datetime import date

    book = Workbook()
    sheet = book.active
    assert sheet is not None
    sheet.append(["Nome", "Tel", "Nasc"])
    sheet.append(["Bia Teste", 82999990000.0, date(2010, 5, 3)])
    book.create_sheet("Outra").append(["x"])
    buffer = io.BytesIO()
    book.save(buffer)
    read = read_spreadsheet("a.xlsx", buffer.getvalue())
    assert read.lines[0].values == {
        "Nome": "Bia Teste",
        "Tel": "82999990000",
        "Nasc": "2010-05-03",
    }


def test_empty_and_duplicated_headers() -> None:
    sheet = read_spreadsheet(
        "a.csv", csv_bytes([["Nome", "", "Nome"], ["a", "b", "c"]])
    )
    assert sheet.columns == ["Nome", "Coluna 2", "Nome (2)"]


def test_empty_lines_are_skipped_and_numbered_in_order() -> None:
    sheet = read_spreadsheet("a.csv", b"Nome,E-mail\nAna,a@x.com\n,\n\nBia,b@x.com\n")
    assert [line.line for line in sheet.lines] == [1, 2]


def test_empty_header_only_and_unreadable_files() -> None:
    assert code_of("a.csv", b"") == "empty_file"
    assert code_of("a.csv", b"Nome,E-mail\n") == "empty_file"
    assert code_of("a.csv", b"Nome,E-mail\n,\n") == "empty_file"
    assert code_of("a.csv", b"\x81\x8d\x8f\x90\x9d") == "unreadable_file"
    assert code_of("a.xlsx", b"not a zip at all") == "unreadable_file"


def test_unsupported_type() -> None:
    assert code_of("lista.pdf", b"%PDF-1.4") == "unsupported_type"


def test_too_many_lines_and_too_big() -> None:
    rows = [["Nome", "E-mail"]] + [[f"N{i}", f"n{i}@x.com"] for i in range(2001)]
    assert code_of("a.csv", csv_bytes(rows)) == "too_large"
    assert len(read_spreadsheet("a.csv", csv_bytes(rows[:2001])).lines) == 2000
    assert code_of("a.csv", b"Nome\n" + b"a" * (5 * 1024 * 1024)) == "too_large"


def test_suggested_mapping() -> None:
    mapping = suggest_mapping(
        [
            "Carimbo",
            "Nome da mãe",
            "Nome completo",
            "Endereço de e-mail",
            "Telefone para contato",
            "Nível de escolaridade",
            "Série",
        ]
    )
    assert mapping == Mapping(
        name="Nome completo",
        email="Endereço de e-mail",
        whatsapp="Telefone para contato",
        study_stage="Nível de escolaridade",
        school_year="Série",
    )
    assert suggest_mapping(["Nome da mãe", "Idade"]) == Mapping()


def test_validate_mapping() -> None:
    sheet = read_spreadsheet("a.csv", csv_bytes([["Nome", "E-mail"], ["a", "b"]]))
    validate_mapping(sheet, Mapping(name="Nome", email="E-mail"))
    for bad in (
        Mapping(name="Nome"),
        Mapping(email="E-mail"),
        Mapping(name="Nome", email="Outra"),
        Mapping(name="Nome", email="E-mail", whatsapp="Outra"),
    ):
        with pytest.raises(SpreadsheetError) as error:
            validate_mapping(sheet, bad)
        assert error.value.code == "missing_columns"


def make_sheet(extra: list[list[str]] | None = None) -> Sheet:
    header = ["Nome", "E-mail", "Zap", "Nivel", "Serie"]
    # 26 lines: 23 ready, 1 incomplete, 1 missing, and a repeat of line 1.
    rows = [[f"Menina {i}", f"menina{i}@exemplo.com", "", "", ""] for i in range(1, 24)]
    rows.append(["Ana Dois", "MENINA1@exemplo.com ", "", "", ""])
    rows.append(["Sem Arroba", "sem.arroba@", "", "", ""])
    rows.append(["Sem Email", "", "", "", ""])
    return read_spreadsheet("a.csv", csv_bytes([header, *rows, *(extra or [])]))


def test_review_counts_of_the_issue() -> None:
    review = build_review(make_sheet(), MAP)
    assert len(make_sheet().lines) == 26
    assert len(review.ready) == 23
    assert [(r.line, r.reason) for r in review.to_review] == [
        (25, ReviewReason.INCOMPLETE_EMAIL),
        (26, ReviewReason.MISSING_EMAIL),
    ]
    assert len(review.repeated) == 1
    repeated = review.repeated[0]
    assert (repeated.name, repeated.email, repeated.count) == (
        "Menina 1",
        "menina1@exemplo.com",
        2,
    )
    assert review.ready[0].line == 1
    assert review.invalid_corrections == []


def test_valid_correction_moves_line_to_ready() -> None:
    review = build_review(
        make_sheet(), MAP, corrections={25: " Certa@Exemplo.com", 26: "x@y.com"}
    )
    assert len(review.ready) == 25
    assert review.ready[-2].email == "certa@exemplo.com"
    assert review.to_review == []


def test_correction_equal_to_another_row_is_repeated() -> None:
    review = build_review(make_sheet(), MAP, corrections={25: "menina2@exemplo.com"})
    assert len(review.ready) == 23
    assert {r.email: r.count for r in review.repeated}["menina2@exemplo.com"] == 2


def test_invalid_correction_stays_in_review() -> None:
    review = build_review(
        make_sheet(), MAP, corrections={25: "ainda@", 26: "ok@exemplo.com"}
    )
    assert review.invalid_corrections == [25]
    assert [r.line for r in review.to_review] == [25]
    assert review.to_review[0].email == "ainda@"
    assert len(review.ready) == 24


def test_skipped_lines_disappear_from_review() -> None:
    review = build_review(make_sheet(), MAP, skip={25, 26})
    assert review.to_review == []
    assert len(review.ready) == 23
    # a skip wins over a correction, and a ready line cannot be skipped
    review = build_review(
        make_sheet(), MAP, corrections={25: "ok@exemplo.com"}, skip={25, 1}
    )
    assert len(review.ready) == 23
    assert [r.line for r in review.to_review] == [26]


def test_missing_name_goes_to_review() -> None:
    sheet = read_spreadsheet(
        "a.csv",
        csv_bytes(
            [["Nome", "E-mail"], ["", "ok@exemplo.com"], ["Bia", "bia@exemplo.com"]]
        ),
    )
    review = build_review(sheet, Mapping(name="Nome", email="E-mail"))
    assert [(r.line, r.reason, r.email) for r in review.to_review] == [
        (1, ReviewReason.MISSING_NAME, "ok@exemplo.com")
    ]
    assert [r.line for r in review.ready] == [2]
    assert (
        build_review(sheet, Mapping(name="Nome", email="E-mail"), skip={1}).to_review
        == []
    )


def test_school_year_and_level_of_each_stage() -> None:
    cases = [
        ("", "8º ano", StudyStage.FUNDAMENTAL),
        ("", "2ª série", StudyStage.MEDIO),
        ("", "3º período", StudyStage.GRADUACAO),
        ("", "2º módulo técnico", StudyStage.TECNICO),
        ("Ensino médio", "8º ano", StudyStage.MEDIO),  # the level wins
        ("Já me formei", "", StudyStage.FORMADA),
        ("", "", None),
    ]
    rows = [
        [f"M{i}", f"m{i}@exemplo.com", "8299", level, year]
        for i, (level, year, _) in enumerate(cases)
    ]
    sheet = read_spreadsheet(
        "a.csv", csv_bytes([["Nome", "E-mail", "Zap", "Nivel", "Serie"], *rows])
    )
    review = build_review(sheet, MAP)
    assert [r.study_stage for r in review.ready] == [stage for *_, stage in cases]
    assert review.ready[0].school_year == "8º ano"
    assert review.ready[0].whatsapp == "8299"
    assert review.ready[-1].school_year is None
