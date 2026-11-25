import { expect, test, type Page } from "@playwright/test";
import { mockEventApi, type EventApiOptions } from "./evento-api";

// #195 · A06·4b de um evento de grupo da NISE depois da data: "Esperando a lista de presença".
// A presença é da coordenadora (#135); aqui ela entra pelo estado de evento-api.ts.

const GROUP_EVENT = "acao-27";
const PATH = `/file/evento/${GROUP_EVENT}`;

// Com hoje em 13/nov/2025, a oficina foi no sábado, 8/nov.
const TODAY = "2025-11-13";

async function open(page: Page, value: EventApiOptions = {}) {
  await mockEventApi(page, { today: TODAY, ...value });
  await page.goto(PATH);
}

function summary(page: Page) {
  return page.getByRole("list", { name: "Quando e onde" });
}

test("depois da data, o evento de grupo da NISE espera a lista de presença, sem botões", async ({ page }) => {
  await open(page);

  await expect(page.getByRole("heading", { level: 1, name: "Oficina de jogos com Scratch" })).toBeVisible();
  await expect(page.getByText("Organizado pelas Rendeiras do Código · grupo da NISE")).toBeVisible();
  await expect(page.getByRole("main").getByText("Em andamento")).toBeVisible();
  await expect(summary(page).getByRole("listitem")).toHaveText([
    "Foi em 8 de novembroSábado",
    "MaceióLocal divulgado na inscrição",
    "Esperando a lista de presençaQuando o grupo marcar, ele vai pros concluídos do seu filé",
  ]);

  // Quem conclui é a presença: nada de "Você foi?" nem de outros botões.
  await expect(page.getByRole("main").getByRole("button")).toHaveCount(0);
  await expect(page.getByRole("heading", { level: 2 })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /Ir para inscrição/ })).toHaveCount(0);
});

test("com a presença marcada, abre a versão \"Concluído\"", async ({ page }) => {
  await open(page, { status: { [GROUP_EVENT]: "concluded" } });

  await expect(page.getByRole("main").getByText("Concluído")).toBeVisible();
  await expect(summary(page).getByRole("listitem").first()).toHaveText("Você foi · 8 de novembroSábado");
  await expect(page.getByText("Ele já tá colorido no seu filé.")).toBeVisible();
  await expect(page.getByRole("main").getByRole("button")).toHaveCount(0);
});

test("com a presença registrada sem ela, o evento sai do filé", async ({ page }) => {
  await open(page, { removed: [GROUP_EVENT] });

  await expect(page.getByText("Esse evento não está no seu filé.")).toBeVisible();
});

test("o voltar \"Seu filé\" é o único foco da tela, e fica visível", async ({ page }) => {
  await open(page);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  await page.keyboard.press("Tab");
  const back = page.getByRole("link", { name: "Seu filé" });
  await expect(back).toBeFocused();
  const outline = await back.evaluate((element) => getComputedStyle(element).outlineStyle);
  expect(outline).not.toBe("none");
});

for (const width of [360, 1366]) {
  test(`cabe em ${width}px sem rolagem lateral`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await open(page);

    await expect(page.getByText("Esperando a lista de presença")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
  });
}
