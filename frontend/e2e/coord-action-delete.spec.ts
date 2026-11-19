import { expect, test, type Page } from "@playwright/test";

// #226 · "Excluir ação" in the "..." menu of K10. Uses lib/coord-actions.ts;
// `?fail` and `?delay=<ms>` are the test bench of its temporary delete function.

const URL = "/coordenacao/acoes";

function more(page: Page, name: string) {
  return page.getByRole("button", { name: `Mais opções de ${name}`, exact: true });
}

async function openModal(page: Page, name: string) {
  await more(page, name).click();
  await page.getByRole("menuitem", { name: "Excluir ação" }).click();
  return page.getByRole("dialog");
}

test("the menu offers Excluir ação only while attendance is not registered", async ({ page }) => {
  await page.goto(URL);
  await page.getByRole("button", { name: "Ver as outras 3" }).click();

  const withMenu = page.getByRole("main").locator('button[aria-haspopup="menu"]');
  await expect(withMenu).toHaveCount(5);
  for (const name of [
    "Introdução à robótica",
    "Python do zero",
    "Hackathon Meninas no Código",
    "Scratch: crie seu primeiro jogo",
    "Visita ao Polo de TI",
  ]) {
    await more(page, name).click();
    await expect(page.getByRole("menuitem", { name: "Excluir ação" })).toBeVisible();
    await page.keyboard.press("Escape");
  }

  for (const name of ["Arduino na escola", "Minicurso de Git"]) {
    await expect(more(page, name)).not.toHaveAttribute("aria-haspopup", /.*/);
    await more(page, name).click();
    await expect(page.getByRole("menuitem")).toHaveCount(0);
  }
});

test("the modal asks with the name of the action and the two buttons", async ({ page }) => {
  await page.goto(URL);

  const dialog = await openModal(page, "Introdução à robótica");

  await expect(dialog.getByRole("heading", { name: "Excluir ação?" })).toBeVisible();
  await expect(dialog).toContainText(
    "Introdução à robótica sai da sua lista e das sugestões das meninas. Isso não dá pra desfazer.",
  );
  await expect(dialog.getByRole("button", { name: "Cancelar" })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Excluir ação" })).toBeVisible();
});

test("Cancelar closes the modal, changes nothing and returns the focus to the ... button", async ({
  page,
}) => {
  await page.goto(URL);

  const dialog = await openModal(page, "Introdução à robótica");
  await dialog.getByRole("button", { name: "Cancelar" }).click();

  await expect(dialog).toBeHidden();
  await expect(page.getByRole("heading", { level: 3, name: "Introdução à robótica" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 3 })).toHaveCount(7);
  await expect(page.getByRole("button", { name: /^Todas/ })).toContainText("10");
  await expect(more(page, "Introdução à robótica")).toBeFocused();
});

test("Escape closes the modal and the menu, and each hands the focus back", async ({ page }) => {
  await page.goto(URL);

  const dialog = await openModal(page, "Python do zero");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(more(page, "Python do zero")).toBeFocused();

  await more(page, "Python do zero").click();
  await expect(page.getByRole("menu")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).toBeHidden();
  await expect(more(page, "Python do zero")).toBeFocused();
});

test("the focus never reaches the page behind the modal while she tabs", async ({ page }) => {
  await page.goto(URL);
  const dialog = await openModal(page, "Python do zero");

  await expect(dialog.getByRole("button", { name: "Cancelar" })).toBeFocused();
  const reachable = new Set<string>();
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press("Tab");
    reachable.add(
      await dialog.evaluate((el) =>
        el.contains(document.activeElement)
          ? (document.activeElement?.textContent ?? "")
          : document.activeElement === document.body
            ? "(browser)"
            : "(page behind)",
      ),
    );
  }
  expect([...reachable].sort()).toEqual(["(browser)", "Cancelar", "Excluir ação"]);
});

test("confirming deletes the action and the chips recount", async ({ page }) => {
  await page.goto(URL);

  const dialog = await openModal(page, "Python do zero");
  await dialog.getByRole("button", { name: "Excluir ação" }).click();

  await expect(dialog).toBeHidden();
  await expect(page.getByRole("heading", { level: 3, name: "Python do zero" })).toHaveCount(0);
  await expect(page.locator("button[aria-pressed]")).toHaveText([
    "Todas9",
    "Aguardando inscrições2",
    "Aguardando evento1",
    "Aguardando presença1",
    "Concluídas5",
  ]);
  const group = page.locator("section").filter({ has: page.getByRole("heading", { name: "Aguardando inscrições" }) });
  await expect(group.getByRole("heading", { level: 3 })).toHaveText([
    "Introdução à robótica",
    "Hackathon Meninas no Código",
  ]);
  await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0);
});

test("deleting the only action of a status hides its group", async ({ page }) => {
  await page.goto(URL);

  const dialog = await openModal(page, "Scratch: crie seu primeiro jogo");
  await dialog.getByRole("button", { name: "Excluir ação" }).click();

  await expect(page.getByRole("heading", { level: 2, name: "Aguardando evento" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Aguardando evento/ })).toContainText("0");
  await expect(page.getByRole("button", { name: /^Todas/ })).toContainText("9");
});

test("it works by keyboard alone: Enter opens the menu, Arrow keys move, Enter opens the modal", async ({
  page,
}) => {
  await page.goto(URL);

  await more(page, "Visita ao Polo de TI").focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("menuitem", { name: "Excluir ação" })).toBeFocused();

  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Visita ao Polo de TI sai da sua lista");
  await page.keyboard.press("Tab");
  await expect(dialog.getByRole("button", { name: "Excluir ação" })).toBeFocused();
  await page.keyboard.press("Enter");

  await expect(page.getByRole("heading", { level: 3, name: "Visita ao Polo de TI" })).toHaveCount(0);
});

test("while it deletes, the button waits and cannot be pressed twice", async ({ page }) => {
  await page.goto(`${URL}?delay=1500`);

  const dialog = await openModal(page, "Python do zero");
  await dialog.getByRole("button", { name: "Excluir ação" }).click();

  await expect(dialog.getByRole("button", { name: "Excluindo…" })).toBeDisabled();
  await expect(page.getByRole("heading", { level: 3, name: "Python do zero" })).toBeVisible();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("heading", { level: 3, name: "Python do zero" })).toHaveCount(0);
});

test("when the deletion fails the action stays and a notice shows", async ({ page }) => {
  await page.goto(`${URL}?fail`);

  const dialog = await openModal(page, "Python do zero");
  await dialog.getByRole("button", { name: "Excluir ação" }).click();

  await expect(page.getByRole("main").getByRole("alert")).toContainText("Não foi possível excluir a ação.");
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("heading", { level: 3, name: "Python do zero" })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Todas/ })).toContainText("10");

  await more(page, "Python do zero").click();
  await page.getByRole("menuitem", { name: "Excluir ação" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0);
});

test("the modal fits at 1366 px and the menu opens over the last row", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto(URL);
  await page.getByRole("button", { name: /^Aguardando presença/ }).click();

  await more(page, "Visita ao Polo de TI").click();
  const item = page.getByRole("menuitem", { name: "Excluir ação" });
  await expect(item).toBeVisible();
  const box = await item.boundingBox();
  expect(box && box.x >= 0 && box.x + box.width <= 1366).toBe(true);
  expect(box && box.y >= 0 && box.y + box.height <= 768).toBe(true);
  expect(box && box.height).toBeGreaterThanOrEqual(44);

  await item.click();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBe(0);
});
