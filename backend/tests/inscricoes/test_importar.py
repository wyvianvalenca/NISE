"""Import the girls of an action from a spreadsheet (C2, #234)."""

import io
import json
import logging

import pytest
from openpyxl import Workbook
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.actions.models import Action, Participation
from app.modules.girls.models import Girl, StudyStage
from app.modules.groups.models import Group
from app.modules.registrations import routes as registration_routes
from app.modules.registrations.service import register_girl
from app.modules.registrations.spreadsheet import (
    MAX_LINES,
    SpreadsheetError,
    read_spreadsheet,
)
from app.users.models import Role, User
from tests.inscricoes.dados import Api, make_action, make_girl, make_group, register

HEADER = "Nome completo,Endereço de e-mail,Telefone,Escolaridade,Série"
MAPPING = {
    "name": "Nome completo",
    "email": "Endereço de e-mail",
    "whatsapp": "Telefone",
    "study_stage": "Escolaridade",
    "school_year": "Série",
}


def csv_file(lines: list[str], sep: str = ",", header: str = HEADER) -> bytes:
    text = "\n".join([header, *lines])
    return text.replace(",", sep).encode() if sep != "," else text.encode()


def files(content: bytes, name: str = "inscritas.csv") -> dict[str, tuple[str, bytes]]:
    return {"file": (name, content)}


def form(
    mapping: dict[str, str | None] | None = None, **extra: object
) -> dict[str, str]:
    data = {"mapping": json.dumps(MAPPING if mapping is None else mapping)}
    data.update({key: json.dumps(value) for key, value in extra.items()})
    return data


async def setup(banco: AsyncSession) -> tuple[Group, User, Action]:
    group, coordinator = await make_group(banco)
    return group, coordinator, await make_action(banco, group)


async def count(banco: AsyncSession, model: type) -> int:
    return await banco.scalar(select(func.count()).select_from(model)) or 0


SIX = [
    "Ana Teste,ana@exemplo.com,82 99999-0001,Ensino médio,2º ano",
    "Bia Teste,bia@exemplo.com,,,8º ano",
    "Carla Teste,carla@exemplo.com,,Graduação,",
]


# ---- read ----


async def test_read_csv_with_comma(banco: AsyncSession, api: Api) -> None:
    _, coordinator, action = await setup(banco)

    response = await api(coordinator).post(
        f"/api/actions/{action.id}/registrations/import/read",
        files=files(csv_file(SIX)),
    )
    body = response.json()

    assert response.status_code == 200
    assert body["file_name"] == "inscritas.csv"
    assert body["line_count"] == 3
    assert body["columns"][0] == "Nome completo"
    assert body["first_line"]["Endereço de e-mail"] == "ana@exemplo.com"
    assert body["suggested"]["name"] == "Nome completo"
    assert body["suggested"]["email"] == "Endereço de e-mail"
    assert body["suggested"]["whatsapp"] == "Telefone"


async def test_read_csv_with_semicolon_and_bom_and_accents(
    banco: AsyncSession, api: Api
) -> None:
    _, coordinator, action = await setup(banco)
    content = (
        "﻿Nome;E-mail;Série\nMaria da Conceição;maria@exemplo.com;8º ano"
    ).encode()

    response = await api(coordinator).post(
        f"/api/actions/{action.id}/registrations/import/read", files=files(content)
    )
    body = response.json()

    assert response.status_code == 200
    assert body["columns"] == ["Nome", "E-mail", "Série"]
    assert body["first_line"]["Nome"] == "Maria da Conceição"


async def test_read_xlsx(banco: AsyncSession, api: Api) -> None:
    _, coordinator, action = await setup(banco)
    book = Workbook()
    sheet = book.active
    assert sheet is not None
    sheet.append(["Nome", "E-mail"])
    sheet.append(["Ana Teste", "ana@exemplo.com"])
    buffer = io.BytesIO()
    book.save(buffer)

    response = await api(coordinator).post(
        f"/api/actions/{action.id}/registrations/import/read",
        files=files(buffer.getvalue(), "planilha.xlsx"),
    )

    assert response.status_code == 200
    assert response.json()["line_count"] == 1


def test_xlsx_over_the_line_limit_stops_reading() -> None:
    book = Workbook()
    sheet = book.active
    assert sheet is not None
    sheet.append(["Nome", "E-mail"])
    for n in range(MAX_LINES + 1):
        sheet.append([f"Menina {n}", f"m{n}@exemplo.com"])
        sheet.append([])  # blank rows don't count toward the limit
    buffer = io.BytesIO()
    book.save(buffer)

    with pytest.raises(SpreadsheetError, match="too_large"):
        read_spreadsheet("planilha.xlsx", buffer.getvalue())


@pytest.mark.parametrize(
    ("name", "content", "code"),
    [
        ("lista.pdf", b"%PDF", "unsupported_type"),
        ("lista.xlsx", b"not a workbook", "unreadable_file"),
        ("lista.csv", b"Nome,E-mail\n", "empty_file"),
        ("lista.csv", b"Nome,E-mail\n" + b"a,b@c.com\n" * 2001, "too_large"),
    ],
)
async def test_read_refuses_bad_files(
    banco: AsyncSession, api: Api, name: str, content: bytes, code: str
) -> None:
    _, coordinator, action = await setup(banco)

    response = await api(coordinator).post(
        f"/api/actions/{action.id}/registrations/import/read",
        files=files(content, name),
    )

    assert response.status_code == 422
    assert response.json() == {"error": code}


# ---- review ----


async def test_review_counts_ready_to_review_and_repeated(
    banco: AsyncSession, api: Api
) -> None:
    _, coordinator, action = await setup(banco)
    lines = [
        *SIX,
        "Dani Teste,dani@exemplo.com,,,",
        "Eva Teste,eva@exemplo,,,",
        "Fabi Teste,,,,",
        "Beatriz Nascimento,bea@exemplo.com,,,",
        "Beatriz Nascimento,BEA@exemplo.com,,,",
    ]

    response = await api(coordinator).post(
        f"/api/actions/{action.id}/registrations/import/review",
        files=files(csv_file(lines)),
        data=form(),
    )
    body = response.json()

    assert response.status_code == 200
    assert len(body["ready"]) == 5
    assert [(r["line"], r["reason"]) for r in body["to_review"]] == [
        (5, "incomplete_email"),
        (6, "missing_email"),
    ]
    assert body["repeated"] == [
        {"name": "Beatriz Nascimento", "email": "bea@exemplo.com", "count": 2}
    ]
    assert body["already_in_action"] == 0
    assert body["new_count"] == 5
    assert await count(banco, Participation) == 0  # saves nothing


async def test_review_school_year_fills_the_study_stage(
    banco: AsyncSession, api: Api
) -> None:
    _, coordinator, action = await setup(banco)

    response = await api(coordinator).post(
        f"/api/actions/{action.id}/registrations/import/review",
        files=files(csv_file(SIX)),
        data=form(),
    )
    stages = {r["name"]: r["study_stage"] for r in response.json()["ready"]}

    assert stages["Ana Teste"] == "medio"
    assert stages["Bia Teste"] == "fundamental"  # "8º ano"
    assert stages["Carla Teste"] == "graduacao"


async def test_review_marks_a_line_with_no_name(banco: AsyncSession, api: Api) -> None:
    _, coordinator, action = await setup(banco)

    response = await api(coordinator).post(
        f"/api/actions/{action.id}/registrations/import/review",
        files=files(csv_file([",sem@exemplo.com,,,"])),
        data=form(),
    )

    assert response.json()["to_review"][0]["reason"] == "missing_name"


async def test_review_without_name_or_email_column_is_refused(
    banco: AsyncSession, api: Api
) -> None:
    _, coordinator, action = await setup(banco)
    mappings: list[dict[str, str | None]] = [
        {**MAPPING, "email": None},
        {**MAPPING, "name": "Coluna que não existe"},
    ]

    for mapping in mappings:
        response = await api(coordinator).post(
            f"/api/actions/{action.id}/registrations/import/review",
            files=files(csv_file(SIX)),
            data=form(mapping),
        )
        assert response.status_code == 422
        assert response.json() == {"error": "missing_columns"}


async def test_review_counts_who_was_already_in_the_action(
    banco: AsyncSession, api: Api
) -> None:
    _, coordinator, action = await setup(banco)
    old = await make_girl(banco, "Ana Antiga")
    old.email = "ana@exemplo.com"
    await register(banco, action, old)

    response = await api(coordinator).post(
        f"/api/actions/{action.id}/registrations/import/review",
        files=files(csv_file(SIX)),
        data=form(),
    )
    body = response.json()

    assert body["already_in_action"] == 1
    assert body["new_count"] == 2


# ---- import ----


async def test_import_registers_the_ready_lines_without_accounts(
    banco: AsyncSession, api: Api
) -> None:
    _, coordinator, action = await setup(banco)
    users_before = await count(banco, User)

    response = await api(coordinator).post(
        f"/api/actions/{action.id}/registrations/import",
        files=files(csv_file(SIX)),
        data=form(),
    )
    body = response.json()

    assert response.status_code == 200
    assert body == {"imported": 3, "already_in_action": 0, "registered_count": 3}
    assert await count(banco, User) == users_before
    ana = await banco.scalar(select(Girl).where(Girl.email == "ana@exemplo.com"))
    assert ana is not None
    assert ana.user_id is None
    assert ana.study_stage == StudyStage.MEDIO
    bia = await banco.scalar(
        select(Participation)
        .join(Girl)
        .where(Girl.email == "bia@exemplo.com", Participation.action_id == action.id)
    )
    assert bia is not None
    assert bia.school_year == "8º ano"
    assert bia.study_stage == StudyStage.FUNDAMENTAL


async def test_import_corrected_line_enters_and_the_rest_does_not(
    banco: AsyncSession, api: Api
) -> None:
    _, coordinator, action = await setup(banco)
    lines = [
        *SIX,
        "Eva Teste,eva@exemplo,,,",
        "Fabi Teste,,,,",
        "Gabi Teste,gabi@exemplo,,,",
    ]

    response = await api(coordinator).post(
        f"/api/actions/{action.id}/registrations/import",
        files=files(csv_file(lines)),
        data=form(corrections=[{"line": 4, "email": "eva@exemplo.com"}], skip=[6]),
    )

    assert response.status_code == 200
    assert response.json()["imported"] == 4  # 3 ready + Eva; Fabi and Gabi stay out
    emails = set(await banco.scalars(select(Girl.email)))
    assert "eva@exemplo.com" in emails
    assert "gabi@exemplo" not in emails
    assert await count(banco, Participation) == 4


async def test_import_with_a_still_invalid_correction_saves_nothing(
    banco: AsyncSession, api: Api
) -> None:
    _, coordinator, action = await setup(banco)
    lines = [*SIX, "Eva Teste,eva@exemplo,,,"]

    response = await api(coordinator).post(
        f"/api/actions/{action.id}/registrations/import",
        files=files(csv_file(lines)),
        data=form(corrections=[{"line": 4, "email": "ainda-errado"}]),
    )

    assert response.status_code == 422
    assert response.json() == {"error": "invalid_corrections", "lines": [4]}
    assert await count(banco, Participation) == 0


async def test_import_repeated_email_enters_once(banco: AsyncSession, api: Api) -> None:
    _, coordinator, action = await setup(banco)
    lines = ["Beatriz Nascimento,bea@exemplo.com,,,", "Bia N,Bea@Exemplo.com,,,"]

    response = await api(coordinator).post(
        f"/api/actions/{action.id}/registrations/import",
        files=files(csv_file(lines)),
        data=form(),
    )

    assert response.json()["imported"] == 1
    assert await count(banco, Participation) == 1


async def test_second_import_brings_only_the_new_girls(
    banco: AsyncSession, api: Api
) -> None:
    _, coordinator, action = await setup(banco)
    url = f"/api/actions/{action.id}/registrations/import"
    await api(coordinator).post(url, files=files(csv_file(SIX)), data=form())

    # Same two girls again, a new one, and Carla is missing from this file.
    second = [SIX[0], SIX[1], "Dani Teste,dani@exemplo.com,,,"]
    review = await api(coordinator).post(
        f"{url}/review",
        files=files(csv_file(second)),
        data=form(),
    )
    response = await api(coordinator).post(
        url, files=files(csv_file(second)), data=form()
    )

    assert review.json()["already_in_action"] == 2
    assert review.json()["new_count"] == 1
    assert response.json() == {
        "imported": 1,
        "already_in_action": 2,
        "registered_count": 4,
    }
    assert await count(banco, Participation) == 4  # Carla stays


async def test_import_of_a_girl_known_by_another_group_links_her_record(
    banco: AsyncSession, api: Api
) -> None:
    _, coordinator, action = await setup(banco)
    other = await make_girl(banco, "Nome De Outro Grupo", with_account=True)
    other.email = "ana@exemplo.com"
    await banco.flush()

    await api(coordinator).post(
        f"/api/actions/{action.id}/registrations/import",
        files=files(csv_file(SIX)),
        data=form(),
    )

    assert await count(banco, Girl) == 3
    await banco.refresh(other)
    assert other.name == "Nome De Outro Grupo"  # an existing record is never changed


async def test_failure_in_the_middle_leaves_nothing_saved(
    banco: AsyncSession, api: Api, monkeypatch: pytest.MonkeyPatch
) -> None:
    _, coordinator, action = await setup(banco)
    users_before = await count(banco, User)
    real = register_girl
    calls = 0

    async def failing(*args: object, **kwargs: object):  # type: ignore[no-untyped-def]
        nonlocal calls
        calls += 1
        if calls == 3:
            raise RuntimeError("boom")
        return await real(*args, **kwargs)  # type: ignore[arg-type]

    monkeypatch.setattr(registration_routes, "register_girl", failing)

    with pytest.raises(RuntimeError):
        await api(coordinator).post(
            f"/api/actions/{action.id}/registrations/import",
            files=files(csv_file(SIX)),
            data=form(),
        )

    assert await count(banco, Participation) == 0
    assert await count(banco, Girl) == 0
    assert await count(banco, User) == users_before


async def test_nothing_about_the_girls_goes_to_the_logs(
    banco: AsyncSession, api: Api, caplog: pytest.LogCaptureFixture
) -> None:
    _, coordinator, action = await setup(banco)
    caplog.set_level(logging.DEBUG)

    await api(coordinator).post(
        f"/api/actions/{action.id}/registrations/import",
        files=files(csv_file(SIX)),
        data=form(),
    )
    await api(coordinator).post(
        f"/api/actions/{action.id}/registrations/import/read",
        files=files(b"\x00\x01", "lista.xlsx"),
    )

    for secret in ("Ana Teste", "ana@exemplo.com", "99999-0001"):
        assert secret not in caplog.text


async def test_unreadable_file_on_import_saves_nothing(
    banco: AsyncSession, api: Api
) -> None:
    _, coordinator, action = await setup(banco)

    response = await api(coordinator).post(
        f"/api/actions/{action.id}/registrations/import",
        files=files(b"\x00\x01", "lista.xlsx"),
        data=form(),
    )

    assert response.status_code == 422
    assert response.json() == {"error": "unreadable_file"}
    assert await count(banco, Participation) == 0


# ---- permissions ----


@pytest.mark.parametrize("step", ["import/read", "import/review", "import"])
async def test_coordinator_of_another_group_gets_404(
    banco: AsyncSession, api: Api, step: str
) -> None:
    _, _, action = await setup(banco)
    _, stranger = await make_group(banco)

    response = await api(stranger).post(
        f"/api/actions/{action.id}/registrations/{step}",
        files=files(csv_file(SIX)),
        data=form(),
    )

    assert response.status_code == 404
    assert await count(banco, Participation) == 0


async def test_a_girl_cannot_import(banco: AsyncSession, api: Api) -> None:
    _, _, action = await setup(banco)
    girl = await make_girl(banco, with_account=True)
    user = await banco.get(User, girl.user_id)
    assert user is not None and user.role == Role.GIRL

    response = await api(user).post(
        f"/api/actions/{action.id}/registrations/import/read",
        files=files(csv_file(SIX)),
    )

    assert response.status_code in (401, 403)
