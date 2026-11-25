import { expect, test } from "@playwright/test";
import { mockActivityApi } from "./activity-api";
import { mockFeedbackApi } from "./feedback-api";
import { mockFileApi } from "./file-api";

// #124 e #126 · A06·5, parte opcional: "O que achou?" e "Quer sugestões parecidas?".
// A atividade vem de GET /api/file/{id} (#121), simulada em activity-api.ts; a
// avaliação vai para PUT /api/file/{id}/feedback (#125), simulada em feedback-api.ts.

const ACTIVITY_ID = "curadoria-1";
const PAGE = `/file/${ACTIVITY_ID}/concluida`;

// O aviso do filé depois do "Enviar" (#171, Figma: Toast / Resposta enviada).
const SENT_NOTICE = "Valeu! Sua resposta foi enviada.";

// O que o back guardou, pelo id da atividade.
let savedFeedback: Awaited<ReturnType<typeof mockFeedbackApi>>;

// "Enviar" e "Pular" voltam ao filé (A06·3), que lê GET /api/file (#116).
test.beforeEach(async ({ page }) => {
  await mockFileApi(page);
  await mockActivityApi(page, { status: { [ACTIVITY_ID]: "concluded" } });
  savedFeedback = await mockFeedbackApi(page);
});

test("mostra a nota de 1 a 5 com os extremos e as quatro sugestões, tudo opcional", async ({ page }) => {
  await page.goto(PAGE);

  await expect(page.getByRole("heading", { name: "O que achou? (opcional)" })).toBeVisible();
  await expect(page.getByRole("radio")).toHaveCount(5);
  await expect(page.getByText("1 · Não curti")).toBeVisible();
  await expect(page.getByText("5 · Amei!")).toBeVisible();

  const similar = page.getByRole("group", { name: "Quer sugestões parecidas? (opcional)" });
  for (const label of ["Algo mais avançado", "Mais do mesmo nível", "Outro tema", "Por enquanto, tá bom"]) {
    await expect(similar.getByRole("button", { name: label })).toHaveAttribute("aria-pressed", "false");
  }
});

test("Enviar só libera depois de escolher algo; Pular está sempre disponível", async ({ page }) => {
  await page.goto(PAGE);

  await expect(page.getByRole("button", { name: "Enviar" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Pular" })).toBeEnabled();

  await page.getByRole("button", { name: "Outro tema" }).click();
  await expect(page.getByRole("button", { name: "Enviar" })).toBeEnabled();
});

test("só uma sugestão fica marcada, e tocar de novo desmarca", async ({ page }) => {
  await page.goto(PAGE);
  const advanced = page.getByRole("button", { name: "Algo mais avançado" });
  const sameLevel = page.getByRole("button", { name: "Mais do mesmo nível" });

  await advanced.click();
  await expect(advanced).toHaveAttribute("aria-pressed", "true");

  await sameLevel.click();
  await expect(sameLevel).toHaveAttribute("aria-pressed", "true");
  await expect(advanced).toHaveAttribute("aria-pressed", "false");

  await sameLevel.click();
  await expect(sameLevel).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByRole("button", { name: "Enviar" })).toBeDisabled();
});

test("Enviar guarda a nota e a sugestão e leva ao filé", async ({ page }) => {
  await page.goto(PAGE);

  await page.getByRole("radio", { name: /^4 · / }).check();
  await page.getByRole("button", { name: "Algo mais avançado" }).click();
  await page.getByRole("button", { name: "Enviar" }).click();

  await expect(page).toHaveURL(/\/file$/);
  expect(savedFeedback).toEqual({ [ACTIVITY_ID]: { rating: 4, similar: "mais-avancado" } });
  await expect(page.getByRole("status").filter({ hasText: SENT_NOTICE })).toBeVisible();
});

test("o aviso do envio aparece uma vez só e some sozinho", async ({ page }) => {
  await page.goto(PAGE);

  await page.getByRole("button", { name: "Outro tema" }).click();
  await page.getByRole("button", { name: "Enviar" }).click();

  const notice = page.getByRole("status").filter({ hasText: SENT_NOTICE });
  await expect(notice).toBeVisible();
  // Fica logo acima da barra inferior, sem cobri-la.
  const noticeBox = await notice.boundingBox();
  const navBox = await page.getByRole("navigation", { name: "Navegação principal" }).boundingBox();
  expect(noticeBox && navBox && noticeBox.y + noticeBox.height <= navBox.y).toBe(true);

  await expect(notice).toHaveCount(0, { timeout: 6000 });

  // Abrir o filé de novo não repete o aviso.
  await page.reload();
  await expect(page.getByRole("heading", { name: "Seu filé" })).toBeVisible();
  await expect(page.getByText(SENT_NOTICE)).toHaveCount(0);
});

test("dá para enviar só a nota, sem sugestão", async ({ page }) => {
  await page.goto(PAGE);

  await page.getByRole("radio", { name: /^2 · / }).check();
  await page.getByRole("button", { name: "Enviar" }).click();

  await expect(page).toHaveURL(/\/file$/);
  expect(savedFeedback).toEqual({ [ACTIVITY_ID]: { rating: 2, similar: null } });
});

test("Pular leva ao filé sem enviar nada, mesmo com algo escolhido", async ({ page }) => {
  await page.goto(PAGE);

  await page.getByRole("radio", { name: /^5 · / }).check();
  await page.getByRole("button", { name: "Pular" }).click();

  await expect(page).toHaveURL(/\/file$/);
  await expect(page.getByRole("heading", { name: "Seu filé" })).toBeVisible();
  expect(savedFeedback).toEqual({});
  await expect(page.getByText(SENT_NOTICE)).toHaveCount(0);
});

for (const action of ["Enviar", "Pular"]) {
  test(`depois de ${action}, voltar não reabre o formulário`, async ({ page }) => {
    // Ela chega à celebração a partir do detalhe da atividade.
    await page.goto(`/file/${ACTIVITY_ID}`);
    await page.goto(PAGE);

    await page.getByRole("radio", { name: /^4 · / }).check();
    await page.getByRole("button", { name: action }).click();
    await expect(page).toHaveURL(/\/file$/);

    await page.goBack();
    await expect(page).toHaveURL(new RegExp(`/file/${ACTIVITY_ID}$`));
  });
}

test("se o envio falhar, avisa e deixa tentar de novo", async ({ page }) => {
  // A rota mais nova vale: esta responde 500.
  await mockFeedbackApi(page, { fail: true });
  await page.goto(PAGE);

  await page.getByRole("button", { name: "Outro tema" }).click();
  await page.getByRole("button", { name: "Enviar" }).click();

  await expect(page.getByRole("alert").filter({ hasText: "Não deu pra enviar. Tente de novo." })).toBeVisible();
  // O detalhe técnico do erro fica só no console.
  await expect(page.getByRole("main").getByText("Não foi possível enviar a avaliação.")).toHaveCount(0);
  await expect(page).toHaveURL(new RegExp(`${PAGE}$`));
  await expect(page.getByRole("button", { name: "Enviar" })).toBeEnabled();

  // Depois da falha, "Pular" volta ao filé sem o aviso de enviada.
  await page.getByRole("button", { name: "Pular" }).click();
  await expect(page.getByRole("heading", { name: "Seu filé" })).toBeVisible();
  await expect(page.getByText(SENT_NOTICE)).toHaveCount(0);
});

test("durante o envio mostra Enviando… e bloqueia os dois botões", async ({ page }) => {
  await mockFeedbackApi(page, { delayMs: 1500 });
  await page.goto(PAGE);

  await page.getByRole("radio", { name: /^3 · / }).check();
  await page.getByRole("button", { name: "Enviar" }).click();

  await expect(page.getByRole("button", { name: "Enviando…" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Pular" })).toBeDisabled();
  await expect(page).toHaveURL(/\/file$/);
});

test("funciona só com o teclado, com foco visível", async ({ page }) => {
  await page.goto(PAGE);

  // Chega na nota pelo Tab e escolhe com as setas.
  const firstRadio = page.getByRole("radio", { name: /^1 · / });
  await firstRadio.focus();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("radio", { name: /^3 · / })).toBeChecked();
  const option = page.locator("label", { has: page.getByRole("radio", { name: /^3 · / }) });
  await expect(option).toHaveCSS("outline-style", "solid");

  await page.keyboard.press("Tab");
  const advanced = page.getByRole("button", { name: "Algo mais avançado" });
  await expect(advanced).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(advanced).toHaveAttribute("aria-pressed", "true");

  // Passa pelas outras três sugestões.
  for (let i = 0; i < 4; i++) await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Pular" })).toBeFocused();
  await page.keyboard.press("Tab");
  const send = page.getByRole("button", { name: "Enviar" });
  await expect(send).toBeFocused();
  await expect(send).toHaveCSS("outline-style", "solid");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/file$/);
});

for (const width of [360, 1366]) {
  test(`cabe em ${width} px sem rolagem lateral`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(PAGE);
    await expect(page.getByRole("button", { name: "Enviar" })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
}
