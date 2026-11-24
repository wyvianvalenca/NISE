import { expect, test, type Page } from "@playwright/test";
import { mockEventApi, type EventApiOptions } from "./evento-api";
import { mockFileApi } from "./file-api";

// #191 · A06·4b depois da data de um evento de fora: "Você foi?" e "Concluído".
// As rotas são simuladas por evento-api.ts.

const PAST = "curadoria-24";
const DONE = "curadoria-25";
const UPCOMING = "curadoria-21";
const PAST_PATH = `/file/evento/${PAST}`;

// Com hoje em 16/nov/2025, o hackathon que passou foi em 8 e 9/nov (sábado e domingo).
const TODAY = "2025-11-16";

async function open(page: Page, path: string, value: EventApiOptions = {}) {
  const api = await mockEventApi(page, { today: TODAY, ...value });
  // Depois do "Não deu" ela volta para o Seu filé (GET /api/file, #116).
  await mockFileApi(page);
  await page.goto(path);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  return api;
}

function button(page: Page, name: string) {
  return page.getByRole("button", { name, exact: true });
}

function summary(page: Page) {
  return page.getByRole("list", { name: "Quando e onde" });
}

function toast(page: Page) {
  return page.getByRole("status").filter({ hasText: /saiu do seu filé|desfazer/i });
}

test("depois da data, o evento de fora pergunta se ela foi", async ({ page }) => {
  await open(page, PAST_PATH);

  await expect(summary(page).getByRole("listitem")).toHaveText([
    "Foi em 8 e 9 de novembroSábado e domingo",
    "MaceióLocal divulgado na inscrição",
    "O evento acabouConta pra gente se você foi",
  ]);
  await expect(page.getByRole("heading", { level: 2, name: "Você foi ao hackathon?" })).toBeVisible();
  await expect(page.getByText("Se foi, ele vira um quadradinho colorido no seu filé.")).toBeVisible();

  // Só os dois botões: o resto do evento some.
  await expect(page.getByRole("main").getByRole("button")).toHaveText(["Não deu", "Fui!"]);
  await expect(page.getByRole("link", { name: /Ir para inscrição/ })).toHaveCount(0);
  await expect(page.getByText("Seus dados da NISE não são enviados", { exact: false })).toHaveCount(0);
  await expect(page.getByRole("list", { name: "Detalhes" })).toHaveCount(0);
});

test("antes da data, um evento \"Inscrita\" ainda não pergunta", async ({ page }) => {
  // O "depois da data" vem do servidor (#192); aqui, um evento que ainda vai acontecer.
  await open(page, `/file/evento/${UPCOMING}`, { status: { [UPCOMING]: "in_progress" } });

  await expect(page.getByRole("main").getByText("Inscrita", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2 })).toHaveCount(0);
});

test("\"Fui!\" conclui o evento e abre a celebração", async ({ page }) => {
  await open(page, PAST_PATH);

  await button(page, "Fui!").click();

  await expect(page).toHaveURL(`${PAST_PATH}/concluido`);
  await expect(page.getByText("Mais um passo dado")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1, name: "Você conseguiu, Alana!" })).toBeFocused();
  await expect(page.locator("p", { hasText: "Hackathon Cidades Inteligentes" })).toBeVisible();
  // Sem a avaliação de atividade: a de evento de fora ainda não existe (revisão do #257).
  await expect(page.getByRole("button", { name: "Enviar" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Pular" })).toHaveCount(0);

  // Sem "Desfazer": voltar ao evento mostra a versão "Concluído".
  await page.goto(PAST_PATH);
  await expect(page.getByRole("main").getByText("Concluído")).toBeVisible();
  await expect(summary(page)).toContainText("Você foi · 8 e 9 de novembro");
});

test("\"Não deu\" tira o evento do filé e mostra o aviso no filé", async ({ page }) => {
  await open(page, PAST_PATH);

  await button(page, "Não deu").click();

  await expect(page).toHaveURL("/file");
  await expect(toast(page)).toContainText("Hackathon Cidades Inteligentes saiu do seu filé.");
  await page.goto(PAST_PATH);
  await expect(page.getByText("Esse evento não está no seu filé.")).toBeVisible();
});

test("\"Desfazer\" traz o evento de volta para a pergunta", async ({ page }) => {
  await open(page, PAST_PATH);
  await button(page, "Não deu").click();

  await toast(page).getByRole("button", { name: "Desfazer" }).click();

  await expect(page).toHaveURL(PAST_PATH);
  await expect(page.getByRole("heading", { level: 2, name: "Você foi ao hackathon?" })).toBeVisible();
  await expect(page.getByRole("main").getByText("Em andamento")).toBeVisible();
});

test("se desfazer falha, avisa e deixa tentar de novo", async ({ page }) => {
  await open(page, PAST_PATH, { failUndo: true });
  await button(page, "Não deu").click();

  await toast(page).getByRole("button", { name: "Desfazer" }).click();

  await expect(toast(page)).toContainText("Não deu pra desfazer.");
  await expect(toast(page).getByRole("button", { name: "Tentar de novo" })).toBeVisible();
});

test("o aviso do filé some sozinho, e não volta ao recarregar", async ({ page }) => {
  await page.clock.install();
  await open(page, PAST_PATH);
  await button(page, "Não deu").click();
  await expect(toast(page)).toBeVisible();

  await page.mouse.move(0, 0);
  await page.clock.runFor(5100);
  await expect(toast(page)).toHaveCount(0);

  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name: "Seu filé" })).toBeVisible();
  await expect(toast(page)).toHaveCount(0);
});

for (const name of ["Fui!", "Não deu"]) {
  test(`se "${name}" falha, avisa e ela pode tentar de novo`, async ({ page }) => {
    await open(page, PAST_PATH, { failUpdates: true });

    await button(page, name).click();

    await expect(page.getByRole("main").getByRole("alert")).toHaveText("Não deu pra enviar. Tente de novo.");
    await expect(page).toHaveURL(PAST_PATH);
    await expect(button(page, name)).toBeEnabled();
  });
}

test("o concluído mostra que ela foi, os chips e nenhum botão", async ({ page }) => {
  await open(page, `/file/evento/${DONE}`);

  await expect(page.getByRole("main").getByText("Concluído")).toBeVisible();
  await expect(summary(page).getByRole("listitem")).toHaveText([
    "Você foi · 17 de outubroSexta",
    "MaceióLocal divulgado na inscrição",
  ]);
  await expect(page.getByRole("list", { name: "Detalhes" }).getByRole("listitem")).toHaveText([
    "Grátis",
    "Ensino fundamental",
  ]);
  await expect(page.getByText("Ele já tá colorido no seu filé.")).toBeVisible();
  await expect(page.getByRole("main").getByRole("button")).toHaveCount(0);
  await expect(page.getByRole("main").getByRole("link")).toHaveCount(0);
});

test("um evento que ainda vai acontecer não abre a celebração", async ({ page }) => {
  await mockEventApi(page, { today: TODAY });
  await page.goto(`/file/evento/${UPCOMING}/concluido`);

  await expect(page.getByText("Esse evento não está nos concluídos do seu filé.")).toBeVisible();
});

test("dá para responder pelo teclado, com o foco visível", async ({ page }) => {
  await open(page, PAST_PATH);

  // Seu filé → Não deu → Fui!
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await expect(button(page, "Não deu")).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(button(page, "Fui!")).toBeFocused();
  const outline = await button(page, "Fui!").evaluate((element) => getComputedStyle(element).outlineStyle);
  expect(outline).not.toBe("none");
});

for (const width of [360, 1366]) {
  test(`"Você foi?" e "Concluído" cabem em ${width}px sem rolagem lateral`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await open(page, PAST_PATH);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
    await expect(button(page, "Fui!")).toBeInViewport();

    await page.goto(`/file/evento/${DONE}`);
    await expect(page.getByText("Ele já tá colorido no seu filé.")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
  });
}
