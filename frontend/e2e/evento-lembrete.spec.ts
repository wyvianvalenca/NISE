import { expect, test, type Page } from "@playwright/test";
import { mockEventApi, type EventApiOptions } from "./evento-api";

// #187 · "Me lembra um dia antes" na versão "Inscrita" da A06·4b.
// O envio do e-mail é do back (#188); aqui só a escolha, salva por PUT /api/events/{id}/reminder.

const HACKATHON = "curadoria-21";
const TOMORROW = "curadoria-26";
const PATH = `/file/evento/${HACKATHON}`;

// Com hoje em 15/out/2025, o hackathon começa em 8/nov: o lembrete é no dia 7.
const TODAY = "2025-10-15";

async function open(page: Page, path = PATH, value: EventApiOptions = {}) {
  const api = await mockEventApi(page, { today: TODAY, status: { [HACKATHON]: "in_progress" }, ...value });
  await page.goto(path);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  return api;
}

function reminder(page: Page) {
  return page.getByRole("checkbox", { name: /Me lembra um dia antes/ });
}

test("a versão \"Inscrita\" oferece o lembrete, desmarcado, com o dia anterior", async ({ page }) => {
  await open(page);

  await expect(reminder(page)).not.toBeChecked();
  await expect(page.getByText("Um e-mail só, no dia 7 de novembro. Opcional.")).toBeVisible();
});

test("marcar e desmarcar fica salvo", async ({ page }) => {
  await open(page);

  await reminder(page).check();
  await page.reload();
  await expect(reminder(page)).toBeChecked();

  await reminder(page).uncheck();
  await page.reload();
  await expect(reminder(page)).not.toBeChecked();
});

test("se salvar falha, avisa e a caixa volta a como estava", async ({ page }) => {
  await open(page, PATH, { failReminder: true });

  // click, não check: a caixa marca e logo volta, e o check esperaria ela ficar marcada.
  await reminder(page).click();

  await expect(page.getByRole("main").getByRole("alert")).toHaveText(
    "Não deu pra salvar o lembrete. Tente de novo.",
  );
  await expect(reminder(page)).not.toBeChecked();
});

test("num evento que começa amanhã, o lembrete não aparece", async ({ page }) => {
  await open(page, `/file/evento/${TOMORROW}`);

  await expect(page.getByRole("main").getByText("Inscrita", { exact: true })).toBeVisible();
  await expect(reminder(page)).toHaveCount(0);
});

test("antes de se inscrever, não há lembrete", async ({ page }) => {
  await open(page, PATH, { status: { [HACKATHON]: "next" } });

  await expect(reminder(page)).toHaveCount(0);
});

test("desfazer a inscrição cancela o lembrete", async ({ page }) => {
  await open(page, PATH, { status: { [HACKATHON]: "next" } });
  await page.getByRole("button", { name: "Já me inscrevi" }).click();
  await reminder(page).check();
  await expect(reminder(page)).toBeChecked();

  await page.getByRole("status").getByRole("button", { name: "Desfazer" }).click();
  await expect(page.getByRole("main").getByText("Próxima aventura")).toBeVisible();
  await page.getByRole("button", { name: "Já me inscrevi" }).click();

  await expect(reminder(page)).not.toBeChecked();
});

// Revisão do #259: com duas ações no ar, a resposta que chega por último sobrescreve a outra.
// O mock espera delayMs em cada chamada, então dá para ver a tela no meio do envio.
test("enquanto o lembrete salva, \"Tirar do filé\" e \"Desfazer\" esperam", async ({ page }) => {
  const api = await open(page, PATH, { status: { [HACKATHON]: "next" } });
  await page.getByRole("button", { name: "Já me inscrevi" }).click();
  await expect(reminder(page)).toBeVisible();
  api.delayMs = 1500;

  await reminder(page).check();

  const undo = page.getByRole("status").getByRole("button", { name: "Desfazer" });
  await expect(page.getByRole("button", { name: "Tirar do filé" })).toBeDisabled();
  await expect(undo).toHaveAttribute("aria-disabled", "true");
  // Tocar no "Desfazer" bloqueado não faz nada: a inscrição e o lembrete continuam.
  // dispatchEvent porque o click do Playwright esperaria o aria-disabled sair.
  await undo.dispatchEvent("click");
  await expect(page.getByRole("button", { name: "Tirar do filé" })).toBeEnabled();
  await expect(reminder(page)).toBeChecked();
  await expect(page.getByRole("main").getByText("Inscrita", { exact: true })).toBeVisible();

  await page.reload();
  await expect(reminder(page)).toBeChecked();
});

test("enquanto desfaz a inscrição, o lembrete fica bloqueado", async ({ page }) => {
  const api = await open(page, PATH, { status: { [HACKATHON]: "next" } });
  await page.getByRole("button", { name: "Já me inscrevi" }).click();
  await expect(reminder(page)).toBeVisible();
  api.delayMs = 1500;

  await page.getByRole("status").getByRole("button", { name: "Desfazer" }).click();

  await expect(reminder(page)).toBeDisabled();
  await expect(page.getByRole("button", { name: "Tirar do filé" })).toBeDisabled();
  await expect(page.getByRole("main").getByText("Próxima aventura")).toBeVisible();
});

test("enquanto tira do filé, o lembrete fica bloqueado", async ({ page }) => {
  await open(page, PATH, { delayMs: 1500 });

  await page.getByRole("button", { name: "Tirar do filé" }).click();

  await expect(reminder(page)).toBeDisabled();
  await page.waitForURL("**/file");
});

test("se o evento não carrega, avisa e deixa tentar de novo", async ({ page }) => {
  const api = await mockEventApi(page, { today: TODAY, status: { [HACKATHON]: "in_progress" }, failLoad: true });
  await page.goto(PATH);

  await expect(page.getByRole("main").getByRole("alert")).toHaveText("Não deu pra carregar o evento.");
  api.failLoad = false;
  await page.getByRole("button", { name: "Tentar de novo" }).click();

  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(reminder(page)).toBeVisible();
});

test("dá para marcar pelo teclado, com o foco visível", async ({ page }) => {
  await open(page);

  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await expect(reminder(page)).toBeFocused();
  const outline = await page
    .locator("label", { has: reminder(page) })
    .evaluate((element) => getComputedStyle(element).outlineStyle);
  expect(outline).not.toBe("none");
  await page.keyboard.press("Space");
  await expect(reminder(page)).toBeChecked();
});

for (const width of [360, 1366]) {
  test(`cabe em ${width}px sem rolagem lateral`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await open(page);

    await expect(reminder(page)).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
  });
}
