import { expect, test, type Page } from "@playwright/test";
import {
  CLOSED_ACTION_ID,
  CONCLUDED_ACTION_ID,
  EMPTY_ACTION_ID,
  FULL_ACTION_ID,
  MISSING_ACTION_ID,
  mockActionPageApi,
} from "./action-page-api";
import { mockAttendanceApi } from "./attendance-api";

// #233 · K11 Ação: where the action stands and the girls registered in it, by
// GET /api/actions/{id} and GET /api/actions/{id}/registrations (simulated in
// action-page-api.ts). Coordinator screens are tested at 1366×900.
test.use({ viewport: { width: 1366, height: 900 } });

const rowsOf = (page: Page) => page.getByRole("table").locator("tbody tr");

test("with no girl: header, steps and the empty card", async ({ page }) => {
  await mockActionPageApi(page);
  await page.goto(`/coordenacao/acoes/${EMPTY_ACTION_ID}`);

  await expect(
    page.getByRole("link", { name: "Ações", exact: true }).nth(1),
  ).toHaveAttribute("href", "/coordenacao/acoes");
  await expect(
    page.getByRole("heading", { level: 1, name: "Introdução à robótica" }),
  ).toBeVisible();
  const header = page.locator("header").nth(1);
  await expect(header.getByText("Aguardando inscrições")).toBeVisible();
  await expect(header.getByText("Oficina")).toBeVisible();
  await expect(header.getByText("sáb, 24/10/2026 · 14h às 17h")).toBeVisible();
  await expect(header.getByText("Presencial · Maceió")).toBeVisible();
  await expect(header.getByText("Aberta ao público")).toBeVisible();

  const steps = page.getByRole("list").filter({ hasText: "Cadastro" });
  await expect(steps).toContainText("Feito em 16/10");
  await expect(steps).toContainText("Importe quando quiser");
  await expect(steps).toContainText("Depois do evento, em 24/10");

  const card = page.getByRole("region", { name: /Inscritas/ });
  await expect(
    card.getByText("As inscrições estão acontecendo no seu formulário"),
  ).toBeVisible();
  await expect(
    card.getByText("forms.exemplo.test/rendeiras-robotica"),
  ).toBeVisible();
  await expect(card.getByText("Nenhuma inscrita ainda")).toBeVisible();
  await expect(
    card.getByText(
      "Quando as respostas chegarem no formulário, baixe a planilha e importe aqui. Dá pra importar de novo depois.",
    ),
  ).toBeVisible();
  await expect(
    card.getByRole("button", { name: "Importar inscritas" }),
  ).toBeVisible();
  await expect(
    card.getByRole("button", { name: "Adicionar inscrita" }),
  ).toBeVisible();
  await expect(page.getByRole("table")).toHaveCount(0);
  await expect(card.getByRole("searchbox")).toHaveCount(0);
});

test("the form link opens in a new tab and the header buttons lead to edit and delete", async ({
  page,
}) => {
  await mockActionPageApi(page);
  await page.goto(`/coordenacao/acoes/${EMPTY_ACTION_ID}`);

  const open = page.getByRole("link", { name: /Abrir o formulário/ });
  await expect(open).toHaveAttribute("target", "_blank");
  await expect(open).toHaveAttribute(
    "href",
    "https://forms.exemplo.test/rendeiras-robotica",
  );
  await expect(page.getByRole("link", { name: "Editar ação" })).toHaveAttribute(
    "href",
    `/coordenacao/acoes/${EMPTY_ACTION_ID}/editar`,
  );
  await expect(
    page.getByRole("button", { name: "Excluir ação" }),
  ).toBeVisible();
});

test("with 23 girls: count, columns, first six and Ver todas as 23", async ({
  page,
}) => {
  const api = await mockActionPageApi(page);
  await page.goto(`/coordenacao/acoes/${FULL_ACTION_ID}`);

  const card = page.getByRole("region", { name: /Inscritas/ });
  await expect(
    page.locator("header").nth(1).getByText("Aguardando evento"),
  ).toBeVisible();
  await expect(card.getByRole("heading", { level: 2 })).toContainText("23");
  await expect(
    page.getByRole("list").filter({ hasText: "Cadastro" }),
  ).toContainText("23 adicionadas · inscrições ainda abertas");
  await expect(page.getByRole("columnheader")).toHaveText([
    "Nome",
    "E-mail",
    "WhatsApp",
    "Nível de escolaridade",
  ]);
  await expect(rowsOf(page)).toHaveCount(6);
  await expect(rowsOf(page).first()).toContainText("Alana Fictícia");
  await expect(rowsOf(page).first()).toContainText("(82) 99999-");
  await expect(
    card.getByPlaceholder("Buscar por nome ou e-mail"),
  ).toBeVisible();
  await expect(
    card.getByRole("button", { name: "Adicionar inscrita" }),
  ).toBeVisible();
  await expect(
    card.getByRole("button", { name: "Importar planilha" }),
  ).toBeVisible();

  await card.getByRole("button", { name: "Ver todas as 23" }).click();

  await expect(rowsOf(page)).toHaveCount(23);
  await expect(
    card.getByRole("button", { name: /Ver (todas|mais)/ }),
  ).toHaveCount(0);
  expect(api.listRequests[0]).toContain("limit=6");
});

test("the search finds by name or by e-mail and keeps the count and the columns", async ({
  page,
}) => {
  await mockActionPageApi(page);
  await page.goto(`/coordenacao/acoes/${FULL_ACTION_ID}`);
  const card = page.getByRole("region", { name: /Inscritas/ });
  const search = card.getByRole("searchbox", {
    name: "Buscar por nome ou e-mail",
  });

  await search.fill("ana cl");
  await expect(rowsOf(page)).toHaveCount(1);
  await expect(rowsOf(page).first()).toContainText("Ana Clara Fictícia");
  await expect(card.getByRole("heading", { level: 2 })).toContainText("23");
  await expect(page.getByRole("columnheader")).toHaveCount(4);

  await search.fill("beatriz2@");
  await expect(rowsOf(page)).toHaveCount(1);
  await expect(rowsOf(page).first()).toContainText("beatriz2@exemplo.test");

  await search.fill("zzzz");
  await expect(
    card.getByText("Ninguém com esse nome ou e-mail."),
  ).toBeVisible();
  await expect(page.getByRole("table")).toHaveCount(0);
});

test("without extra data there are only the Nome and E-mail columns", async ({
  page,
}) => {
  await mockActionPageApi(page);
  await mockAttendanceApi(page);
  await page.goto(`/coordenacao/acoes/${CONCLUDED_ACTION_ID}`);

  await expect(page.getByRole("columnheader")).toHaveText(["Nome", "E-mail"]);
  await expect(rowsOf(page)).toHaveCount(2);
  await expect(
    page.locator("header").nth(1).getByText("Online", { exact: true }),
  ).toBeVisible();
  await expect(
    page.locator("header").nth(1).getByText("Fechada ao público"),
  ).toBeVisible();
});

test("closed registrations: steps and card say so", async ({ page }) => {
  await mockActionPageApi(page);
  await page.goto(`/coordenacao/acoes/${CLOSED_ACTION_ID}`);

  await expect(
    page.getByRole("list").filter({ hasText: "Cadastro" }),
  ).toContainText("23 adicionadas · inscrições fechadas");
  await expect(
    page.getByText(
      "As inscrições estão fechadas na NISE e a ação não aparece mais pras meninas.",
    ),
  ).toBeVisible();
  // Closed registrations still let her import and add (RF-F1.10).
  await expect(
    page.getByRole("button", { name: "Adicionar inscrita" }),
  ).toBeEnabled();
});

test("Excluir ação is hidden once the attendance is saved", async ({
  page,
}) => {
  await mockActionPageApi(page);
  await mockAttendanceApi(page);
  await page.goto(`/coordenacao/acoes/${CONCLUDED_ACTION_ID}`);

  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByRole("button", { name: "Excluir ação" })).toHaveCount(
    0,
  );
  await expect(page.getByRole("link", { name: "Editar ação" })).toBeVisible();
});

test("Excluir ação asks first, then deletes and goes back to the list", async ({
  page,
}) => {
  const api = await mockActionPageApi(page);
  await page.goto(`/coordenacao/acoes/${EMPTY_ACTION_ID}`);

  await page.getByRole("button", { name: "Excluir ação" }).click();
  const modal = page.getByRole("dialog", { name: "Excluir esta ação?" });
  await modal.getByRole("button", { name: "Cancelar" }).click();
  await expect(modal).toBeHidden();
  expect(api.deleted).toEqual([]);

  await page.getByRole("button", { name: "Excluir ação" }).click();
  await modal.getByRole("button", { name: "Excluir ação" }).click();

  await expect(page).toHaveURL(/\/coordenacao\/acoes$/);
  expect(api.deleted).toEqual([EMPTY_ACTION_ID]);
});

test("an action that is not found, or is of another group, is the 404", async ({
  page,
}) => {
  await mockActionPageApi(page);

  await page.goto(`/coordenacao/acoes/${MISSING_ACTION_ID}`);

  await expect(page.getByText("This page could not be found.")).toBeVisible();
  await expect(
    page.getByRole("heading", { level: 1, name: "Introdução à robótica" }),
  ).toHaveCount(0);
});

test("shows the loading state, then the failure with a retry", async ({
  page,
}) => {
  const api = await mockActionPageApi(page, {
    delayMs: 300,
    failActions: true,
  });
  await page.goto(`/coordenacao/acoes/${FULL_ACTION_ID}`);

  await expect(page.getByRole("status")).toContainText("Carregando a ação…");
  await expect(
    page.getByRole("heading", { name: "Não foi possível carregar" }),
  ).toBeVisible();

  api.failActions = false;
  await page.getByRole("button", { name: "Tentar novamente" }).click();

  await expect(
    page.getByRole("heading", { level: 1, name: "Introdução à robótica" }),
  ).toBeVisible();
});

test("works with the keyboard and shows the focus", async ({ page }) => {
  await mockActionPageApi(page);
  await page.goto(`/coordenacao/acoes/${FULL_ACTION_ID}`);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  const reach = async (
    name: string | RegExp,
    role: "link" | "button" | "searchbox",
  ) => {
    const target = page.getByRole(role, { name });
    for (let step = 0; step < 30; step += 1) {
      await page.keyboard.press("Tab");
      if (
        await target.evaluate((element) => element === document.activeElement)
      )
        break;
    }
    await expect(target).toBeFocused();
    const outline = await target.evaluate(
      (element) => getComputedStyle(element).outlineStyle,
    );
    expect(outline).not.toBe("none");
    return target;
  };

  await reach("Editar ação", "link");
  await reach("Excluir ação", "button");
  await reach("Importar planilha", "button");
  await reach("Adicionar inscrita", "button");
  await reach(/Abrir o formulário/, "link");
  const search = await reach("Buscar por nome ou e-mail", "searchbox");
  await search.pressSequentially("yasmin");
  await expect(rowsOf(page)).toHaveCount(1);
  await search.fill("");
  await expect(rowsOf(page)).toHaveCount(6);
  await reach("Ver todas as 23", "button");
  await page.keyboard.press("Enter");
  await expect(rowsOf(page)).toHaveCount(23);
});
