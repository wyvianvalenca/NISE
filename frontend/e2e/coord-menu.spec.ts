import { expect, test } from "@playwright/test";
import { mockActionsListApi } from "./actions-list-api";
import { COORDINATOR, mockCoordinatorApi as mockMe } from "./coordinator-api";

const URL = "/coordenacao/acoes";

test.beforeEach(async ({ page }) => {
  await mockActionsListApi(page);
  await mockMe(page);
});

const TABS = ["Ações", "Resultados", "Ingressantes", "Exportar"];

test("shows the four tabs in order with Ações as the current one", async ({ page }) => {
  await page.goto(URL);

  const nav = page.getByRole("navigation", { name: "Seções" });
  await expect(nav.locator("a, span")).toHaveText(TABS);
  await expect(nav.getByRole("link", { name: "Ações" })).toHaveAttribute("aria-current", "page");
});

test("only Ações, Resultados and Ingressantes are links, Exportar goes nowhere", async ({
  page,
}) => {
  await page.goto(URL);

  const nav = page.getByRole("navigation", { name: "Seções" });
  await expect(nav.locator("a[href]")).toHaveCount(3);
  await expect(nav.getByRole("link", { name: "Resultados" })).toHaveAttribute(
    "href",
    "/coordenacao/resultados",
  );
  await expect(nav.getByRole("link", { name: "Ingressantes" })).toHaveAttribute(
    "href",
    "/coordenacao/ingressantes",
  );

  await expect(nav.getByText("Relatórios")).toHaveCount(0);

  const tab = nav.getByRole("link", { name: "Exportar", exact: true, disabled: true });
  await expect(tab).not.toHaveAttribute("href", /.*/);
  await expect(tab).toHaveAttribute("aria-disabled", "true");
  await tab.click({ force: true });
  await expect(page).toHaveURL(new RegExp(`${URL}$`));
});

test("shows the group and the initial of the coordinator of the session", async ({ page }) => {
  await page.goto(URL);

  const header = page.getByRole("banner");
  await expect(header.getByText("Rendeiras do Código")).toBeVisible();
  await expect(header.getByLabel("Sua conta")).toHaveText("K");
});

test("shows the group of another coordinator, not a fixed one", async ({ page }) => {
  await mockMe(page, {
    ...COORDINATOR,
    name: "Maria Ficticia",
    group: { id: 9, name: "Grupo Ficticio Nove" },
  });
  await page.goto(URL);

  const header = page.getByRole("banner");
  await expect(header.getByText("Grupo Ficticio Nove")).toBeVisible();
  await expect(header.getByText("Rendeiras do Código")).toHaveCount(0);
  await expect(header.getByLabel("Sua conta")).toHaveText("M");
});

test("a coordinator with no group has the account but no group pill", async ({ page }) => {
  await mockMe(page, { ...COORDINATOR, group: null });
  await page.goto(URL);

  const header = page.getByRole("banner");
  await expect(header.getByLabel("Sua conta")).toBeVisible();
  await expect(header.getByText("Rendeiras do Código")).toHaveCount(0);
});

test("a girl's session or no session leaves the right side of the header empty", async ({
  page,
}) => {
  await mockMe(page, { ...COORDINATOR, role: "girl", group: null });
  await page.goto(URL);
  await expect(page.getByRole("navigation", { name: "Seções" })).toBeVisible();
  await expect(page.getByRole("banner").getByLabel("Sua conta")).toHaveCount(0);

  await mockMe(page, { detail: "Não autenticada" }, 401);
  await page.goto(URL);
  await expect(page.getByRole("navigation", { name: "Seções" })).toBeVisible();
  await expect(page.getByRole("banner").getByLabel("Sua conta")).toHaveCount(0);
});

test("the account menu has her name and Sair da conta, with no profile link", async ({
  page,
}) => {
  await page.goto(URL);
  await page.getByRole("banner").getByLabel("Sua conta").click();

  await expect(page.getByText("Kaline Ficticia", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sair da conta" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Ver perfil" })).toHaveCount(0);
});

test("Sair da conta ends the session and goes back to A01", async ({ page }) => {
  let left = false;
  await page.route("**/api/auth/logout", (route) => {
    left = true;
    return route.fulfill({ status: 204, body: "" });
  });
  await page.goto(URL);
  await page.getByRole("banner").getByLabel("Sua conta").click();
  await mockMe(page, { detail: "Não autenticada" }, 401);
  await page.getByRole("button", { name: "Sair da conta" }).click();

  await expect(page).toHaveURL(/\/$/);
  expect(left).toBe(true);
});

test("if leaving fails, it says so and stays on the screen", async ({ page }) => {
  await page.route("**/api/auth/logout", (route) => route.abort());
  await page.goto(URL);
  await page.getByRole("banner").getByLabel("Sua conta").click();
  await page.getByRole("button", { name: "Sair da conta" }).click();

  await expect(page.getByText("Não deu pra sair agora. Tente de novo.")).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`${URL}$`));
});
