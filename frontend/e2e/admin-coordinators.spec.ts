import { expect, test } from "@playwright/test";
import { mockAdminCoordinatorsApi } from "./admin-coordinators-api";

// #447 · AD02 Coordenadoras, on the mocked GET /api/admin/coordinators.

const URL = "/admin/coordenadoras";

test.use({ viewport: { width: 1366, height: 768 } });

test.beforeEach(async ({ page }) => {
  await mockAdminCoordinatorsApi(page);
});

test("shows each coordinator with initial, group, situation and date", async ({ page }) => {
  await page.goto(URL);

  await expect(page.getByRole("heading", { level: 1, name: "Coordenadoras" })).toBeVisible();
  const ana = page.getByRole("listitem").filter({ hasText: "Ana Souza" });
  await expect(ana).toContainText("A");
  await expect(ana).toContainText("Rendeiras do Código");
  await expect(ana).toContainText("Ativa");
  await expect(ana).toContainText("Entrou em 12 de set");
  await expect(page.getByText("Vence em 25 de nov")).toBeVisible();
  await expect(page.getByText("Venceu em 18 de nov")).toBeVisible();
  await expect(page.getByText("Desde 2 de nov")).toBeVisible();
});

test("filters have counts and Convites brings sent and expired", async ({ page }) => {
  await page.goto(URL);
  const filters = page.locator("button[aria-pressed]");

  await expect(filters).toHaveText(["Todas5", "Ativas2", "Convites2", "Desativadas1"]);
  await filters.nth(2).click();
  await expect(page.getByRole("listitem")).toHaveCount(2);
  await expect(page.getByText("Convite enviado")).toBeVisible();
  await expect(page.getByText("Convite expirou")).toBeVisible();
});

test("search finds by coordinator or group name and says when nothing matches", async ({ page }) => {
  await page.goto(URL);
  const search = page.getByRole("searchbox", { name: "Buscar coordenadora ou grupo" });

  await search.fill("ROBOTICA");
  await expect(page.getByRole("listitem")).toHaveCount(1);
  await expect(page.getByText("Carla Mendes")).toBeVisible();
  await search.fill("beatriz");
  await expect(page.getByText("Meninas Programadoras")).toBeVisible();
  await search.fill("zzz");
  await expect(page.getByText("Nenhuma coordenadora encontrada.")).toBeVisible();
});

test("shows the invite note and a menu with Coordenadoras and Grupos", async ({ page }) => {
  await page.goto(URL);

  await expect(
    page.getByText("Cada convite vale 7 dias, funciona uma vez só e só pro e-mail convidado."),
  ).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Seções" }).getByRole("link")).toHaveText([
    "Coordenadoras",
    "Grupos",
  ]);
});

test("a coordinator or a girl is refused and sees no rows (RNF-G.03)", async ({ page }) => {
  await mockAdminCoordinatorsApi(page, { status: 403 });
  await page.goto(URL);

  await expect(page.getByRole("main").getByRole("alert")).toHaveText("Esta área é só da equipe NISE.");
  await expect(page.getByRole("main").getByRole("listitem")).toHaveCount(0);
  await expect(page.getByText("Ana Souza")).toHaveCount(0);
});

test("offers to try again when the list fails to load", async ({ page }) => {
  await mockAdminCoordinatorsApi(page, { status: 500 });
  await page.goto(URL);

  await expect(page.getByRole("main").getByRole("alert")).toHaveText("Não foi possível carregar as coordenadoras.");
  await expect(page.getByRole("button", { name: "Tentar novamente" })).toBeVisible();
});
