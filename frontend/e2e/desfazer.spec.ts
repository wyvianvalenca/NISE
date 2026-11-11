import { expect, test, type Page } from "@playwright/test";

// #107 · Aviso "Desfazer" na A06·2. Usa os dados de teste de lib/sugestoes.ts.

type Mock = { count?: number; fileTotal?: number; delayMs?: number; undoFailures?: number };

async function open(page: Page, mock: Mock = {}) {
  await page.addInitScript((value) => {
    globalThis.__NISE_MOCK_SUGESTOES__ = value as typeof globalThis.__NISE_MOCK_SUGESTOES__;
  }, mock);
  await page.goto("/descobrir/uma-tarde");
  await expect(page.getByText(/^Sugestão 1 de/)).toBeVisible();
}

function choices(page: Page) {
  return page.evaluate(() => globalThis.__NISE_ESCOLHAS__ ?? []);
}

const pill = (page: Page) => page.getByRole("link", { name: /^Meu filé/ });
const button = (page: Page, name: string) => page.getByRole("button", { name, exact: true });
const toast = (page: Page) => page.getByRole("status").filter({ has: page.getByRole("button") });
const undoButton = (page: Page) => button(page, "Desfazer");

const FIRST = "Crie seu primeiro site com HTML";
const SECOND = "Um jogo da velha no navegador";

test("\"Quero fazer\" mostra o aviso e \"Desfazer\" traz a mesma sugestão de volta", async ({ page }) => {
  await open(page);

  await button(page, "Quero fazer").click();
  await expect(toast(page)).toHaveText(`${FIRST} entrou no seu filéDesfazer`);
  await expect(pill(page)).toContainText("6");

  await undoButton(page).click();

  await expect(toast(page)).toHaveCount(0);
  await expect(page.getByText("Sugestão 1 de 8")).toBeVisible();
  await expect(page.getByRole("heading", { name: FIRST })).toBeVisible();
  await expect(pill(page)).toContainText("5");
  expect(await choices(page)).toEqual([]);
  // O foco vai para o contador, que diz qual sugestão voltou.
  await expect(page.getByText("Sugestão 1 de 8")).toBeFocused();
});

test("\"Talvez depois\" mostra \"foi pro Ver depois\" e o desfazer apaga a escolha", async ({ page }) => {
  await open(page);

  await button(page, "Talvez depois").click();
  await expect(toast(page)).toContainText(`${FIRST} foi pro Ver depois`);

  await undoButton(page).click();
  await expect(page.getByText("Sugestão 1 de 8")).toBeVisible();
  await expect(pill(page)).toContainText("5");
  expect(await choices(page)).toEqual([]);
});

test("\"Não é pra mim\" mostra \"foi dispensada\" e o desfazer apaga a escolha e o motivo", async ({ page }) => {
  await open(page);

  await button(page, "Não é pra mim").click();
  await page.getByRole("button", { name: "Muito difícil" }).click();
  await page.getByRole("button", { name: "Enviar" }).click();
  await expect(toast(page)).toContainText(`${FIRST} foi dispensada`);
  expect(await choices(page)).toHaveLength(1);

  await undoButton(page).click();
  await expect(page.getByText("Sugestão 1 de 8")).toBeVisible();
  expect(await choices(page)).toEqual([]);
});

test("uma escolha nova troca o aviso: só a última pode ser desfeita", async ({ page }) => {
  await open(page);

  await button(page, "Quero fazer").click();
  await expect(toast(page)).toContainText(FIRST);
  await button(page, "Talvez depois").click();
  await expect(toast(page)).toContainText(`${SECOND} foi pro Ver depois`);
  await expect(toast(page)).toHaveCount(1);

  await undoButton(page).click();
  await expect(page.getByText("Sugestão 2 de 8")).toBeVisible();
  await expect(page.getByRole("heading", { name: SECOND })).toBeVisible();
  // A primeira escolha continua guardada.
  await expect(pill(page)).toContainText("6");
  expect(await choices(page)).toEqual([{ id: "uma-tarde-1", choice: "quero-fazer" }]);
});

test("o aviso só aparece depois que a escolha é confirmada", async ({ page }) => {
  await open(page, { delayMs: 600 });

  await button(page, "Quero fazer").click();
  await expect(button(page, "Talvez depois")).toBeDisabled();
  await expect(toast(page)).toHaveCount(0);

  await expect(toast(page)).toContainText(FIRST);
  await expect(page.getByText("Sugestão 2 de 8")).toBeVisible();
});

test("enquanto desfaz, os botões ficam bloqueados", async ({ page }) => {
  await open(page);
  await button(page, "Quero fazer").click();
  await expect(toast(page)).toBeVisible();

  // Daqui em diante as respostas demoram.
  await page.evaluate(() => {
    globalThis.__NISE_MOCK_SUGESTOES__ = { ...globalThis.__NISE_MOCK_SUGESTOES__, delayMs: 600 };
  });
  await undoButton(page).click();
  await expect(undoButton(page)).toHaveAttribute("aria-disabled", "true");
  await expect(button(page, "Quero fazer")).toBeDisabled();

  await expect(page.getByText("Sugestão 1 de 8")).toBeVisible();
  await expect(button(page, "Quero fazer")).toBeEnabled();
});

test("se desfazer falha, mostra o erro e deixa tentar de novo", async ({ page }) => {
  await open(page, { undoFailures: 1 });

  await button(page, "Quero fazer").click();
  await undoButton(page).click();

  await expect(toast(page)).toContainText("Não deu pra desfazer.");
  await expect(page.getByText("Sugestão 2 de 8")).toBeVisible();
  await expect(pill(page)).toContainText("6");

  await button(page, "Tentar de novo").click();
  await expect(toast(page)).toHaveCount(0);
  await expect(page.getByText("Sugestão 1 de 8")).toBeVisible();
  await expect(pill(page)).toContainText("5");
});

test("depois da última sugestão ainda dá para desfazer", async ({ page }) => {
  await open(page, { count: 1 });

  await button(page, "Quero fazer").click();
  await expect(page.getByRole("heading", { name: "Você viu todas as sugestões de Uma tarde." })).toBeVisible();

  await undoButton(page).click();
  await expect(page.getByText("Sugestão 1 de 1")).toBeVisible();
  await expect(page.getByRole("heading", { name: FIRST })).toBeVisible();
});

test.describe("tempo do aviso", () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.install();
  });

  test("some sozinho depois de uns 5 s e não oferece mais o desfazer", async ({ page }) => {
    await open(page);
    await button(page, "Quero fazer").click();
    await expect(toast(page)).toBeVisible();

    await page.clock.runFor(4000);
    await expect(toast(page)).toBeVisible();
    await page.clock.runFor(1500);
    await expect(toast(page)).toHaveCount(0);
    await expect(undoButton(page)).toHaveCount(0);
  });

  test("não some enquanto o mouse está em cima", async ({ page }) => {
    await open(page);
    await button(page, "Quero fazer").click();
    await toast(page).hover();

    await page.clock.runFor(8000);
    await expect(toast(page)).toBeVisible();

    await page.mouse.move(0, 400);
    await page.clock.runFor(5500);
    await expect(toast(page)).toHaveCount(0);
  });

  test("depois de um erro, o tempo recomeça", async ({ page }) => {
    await open(page, { undoFailures: 1 });
    await button(page, "Quero fazer").click();
    await page.clock.runFor(4000);
    await undoButton(page).click();
    await expect(button(page, "Tentar de novo")).toBeVisible();

    // Tira o mouse e o foco do aviso para o tempo correr.
    await page.mouse.move(0, 400);
    await button(page, "Tentar de novo").blur();
    await page.clock.runFor(4000);
    await expect(button(page, "Tentar de novo")).toBeVisible();
    await page.clock.runFor(1500);
    await expect(toast(page)).toHaveCount(0);
  });
});

test("dá para desfazer só com o teclado, com foco visível", async ({ page }) => {
  await open(page);

  // Voltar, Meu filé, Não é pra mim, Talvez depois, Quero fazer.
  for (let i = 0; i < 5; i++) await page.keyboard.press("Tab");
  await expect(button(page, "Quero fazer")).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(toast(page)).toBeVisible();

  // O aviso fica entre o cabeçalho e os botões: Talvez depois, Não é pra mim, Desfazer.
  for (let i = 0; i < 3; i++) await page.keyboard.press("Shift+Tab");
  await expect(undoButton(page)).toBeFocused();
  await expect(undoButton(page)).toHaveCSS("outline-style", "solid");

  await page.keyboard.press("Enter");
  await expect(page.getByText("Sugestão 1 de 8")).toBeFocused();
  expect(await choices(page)).toEqual([]);
});

for (const width of [360, 1366]) {
  test(`em ${width} px o aviso cabe na tela, abaixo do cabeçalho, sem cobrir os botões`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 360 ? 740 : 768 });
    await open(page);
    await button(page, "Quero fazer").click();

    const box = await toast(page).boundingBox();
    expect(box).not.toBeNull();
    expect(box!.y).toBeGreaterThanOrEqual(68);
    await expect(toast(page)).toBeInViewport({ ratio: 1 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    for (const name of ["Não é pra mim", "Talvez depois", "Quero fazer"]) {
      await expect(button(page, name)).toBeInViewport({ ratio: 1 });
    }
  });
}
