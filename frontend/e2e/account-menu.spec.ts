import { expect, test, type Page } from "@playwright/test";

/**
 * The girl's account menu: tapping the avatar shows her name, "Ver perfil"
 * and "Sair". Uses the Descobrir test data (lib/descobrir.ts), where she is
 * "Alana". The logout route is mocked with the real contract (204).
 */

function accountButton(page: Page) {
  return page.getByRole("button", { name: "Sua conta" });
}

async function open(page: Page) {
  await page.goto("/descobrir");
  await accountButton(page).click();
  await expect(page.getByText("Alana", { exact: true })).toBeVisible();
}

test("o avatar abre o menu com o nome, o perfil e sair", async ({ page }) => {
  await page.goto("/descobrir");

  await expect(accountButton(page)).toHaveAttribute("aria-expanded", "false");
  await accountButton(page).click();

  await expect(accountButton(page)).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByText("Alana", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Ver perfil" })).toHaveAttribute(
    "href",
    "/perfil",
  );
  await expect(page.getByRole("button", { name: "Sair" })).toBeVisible();
});

test("Esc fecha o menu e devolve o foco ao avatar", async ({ page }) => {
  await open(page);

  await page.keyboard.press("Escape");

  await expect(page.getByRole("button", { name: "Sair" })).toHaveCount(0);
  await expect(accountButton(page)).toBeFocused();
});

test("tocar fora fecha o menu", async ({ page }) => {
  await open(page);

  await page.getByRole("heading", { level: 1 }).click();

  await expect(page.getByRole("button", { name: "Sair" })).toHaveCount(0);
});

test("Sair encerra a sessão, apaga os dados de teste da aba e volta à A01", async ({
  page,
}) => {
  let saiu = false;
  await page.route("**/api/auth/logout", (route) => {
    saiu = route.request().method() === "POST";
    return route.fulfill({ status: 204, body: "" });
  });

  await open(page);
  await page.evaluate(() => sessionStorage.setItem("nise-mock-signup", "{}"));
  await page.getByRole("button", { name: "Sair" }).click();

  await expect(page).toHaveURL(/\/$/);
  await expect(
    page.getByRole("heading", { name: /Núcleo de Incentivo e Suporte/ }),
  ).toBeVisible();
  expect(saiu).toBe(true);
  expect(await page.evaluate(() => sessionStorage.length)).toBe(0);
});

test("se sair falhar, avisa e continua na tela", async ({ page }) => {
  await page.route("**/api/auth/logout", (route) => route.abort());

  await open(page);
  await page.getByRole("button", { name: "Sair" }).click();

  await expect(
    page.getByText("Não deu pra sair agora. Tente de novo."),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/descobrir$/);
  await expect(page.getByRole("button", { name: "Sair" })).toBeEnabled();
});
