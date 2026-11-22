import { expect, test, type Page } from "@playwright/test";
import type { SuggestionCard } from "../lib/sugestoes";
import { mockDiscoverApi } from "./discover-api";
import { watchFrames } from "./frames";
import { mockSuggestionsApi, type SuggestionsApi } from "./suggestions-api";

// #107 e #109 · Aviso "Desfazer" na A06·2. As sugestões, a escolha e o "Desfazer" vêm das rotas da
// #104 e da #108, simuladas em suggestions-api.ts.

type Options = {
  count?: number;
  /** Atraso das rotas simuladas (a busca, a escolha e o "Desfazer"), em ms. */
  delayMs?: number;
  /** Quantas vezes seguidas o "Desfazer" falha. */
  undoFailures?: number;
};

async function open(page: Page, options: Options = {}): Promise<SuggestionsApi> {
  const api = await mockSuggestionsApi(page, options);
  await page.goto("/descobrir/uma-tarde");
  await expect(page.getByText(/^Sugestão 1 de/)).toBeVisible();
  return api;
}

const pill = (page: Page) => page.getByRole("link", { name: /^Meu filé/ });
const button = (page: Page, name: string) => page.getByRole("button", { name, exact: true });
const toast = (page: Page) => page.getByRole("status").filter({ has: page.getByRole("button") });
const undoButton = (page: Page) => button(page, "Desfazer");

const FIRST = "Crie seu primeiro site com HTML";
const SECOND = "Um jogo da velha no navegador";

// A segunda e a terceira de "Uma tarde", como a rota devolve depois que ela escolheu a primeira.
const SECOND_CARD: SuggestionCard = {
  id: "curadoria-2",
  typeLabel: "Mini-projeto",
  title: SECOND,
  source: "Comunidade de jogos · exemplo",
  format: "online",
  duration: "~4 horas",
  costCents: 0,
  minAge: 13,
  why: null,
};
const THIRD_CARD: SuggestionCard = {
  ...SECOND_CARD,
  id: "curadoria-3",
  typeLabel: "Curso online",
  title: "Lógica de programação com Python",
  source: "Plataforma de cursos gratuitos · exemplo",
};

test("\"Quero fazer\" mostra o aviso e \"Desfazer\" traz a mesma sugestão de volta", async ({ page }) => {
  const api = await open(page);

  await button(page, "Quero fazer").click();
  await expect(toast(page)).toHaveText(`${FIRST} entrou no seu filéDesfazer`);
  await expect(pill(page)).toContainText("6");

  await undoButton(page).click();

  await expect(toast(page)).toHaveCount(0);
  await expect(page.getByText("Sugestão 1 de 8")).toBeVisible();
  await expect(page.getByRole("heading", { name: FIRST })).toBeVisible();
  await expect(pill(page)).toContainText("5");
  // O "Desfazer" manda o id do item ao back, que apaga a escolha.
  expect(api.undone).toEqual(["curadoria-1"]);
  expect(api.saved).toEqual([]);
  // O foco vai para o contador, que diz qual sugestão voltou.
  await expect(page.getByText("Sugestão 1 de 8")).toBeFocused();
});

test("\"Talvez depois\" mostra \"foi pro Ver depois\" e o desfazer apaga a escolha", async ({ page }) => {
  const api = await open(page);

  await button(page, "Talvez depois").click();
  await expect(toast(page)).toContainText(`${FIRST} foi pro Ver depois`);

  await undoButton(page).click();
  await expect(page.getByText("Sugestão 1 de 8")).toBeVisible();
  await expect(pill(page)).toContainText("5");
  expect(api.undone).toEqual(["curadoria-1"]);
  expect(api.saved).toEqual([]);
});

test("\"Não é pra mim\" mostra \"foi dispensada\" e o desfazer apaga a escolha e o motivo", async ({ page }) => {
  const api = await open(page);

  await button(page, "Não é pra mim").click();
  await page.getByRole("button", { name: "Muito difícil" }).click();
  await page.getByRole("button", { name: "Enviar" }).click();
  await expect(toast(page)).toContainText(`${FIRST} foi dispensada`);
  expect(api.saved).toEqual([{ id: "curadoria-1", choice: "nao-e-pra-mim", reason: "muito-dificil" }]);

  await undoButton(page).click();
  await expect(page.getByText("Sugestão 1 de 8")).toBeVisible();
  expect(api.undone).toEqual(["curadoria-1"]);
  expect(api.saved).toEqual([]);
});

test("uma escolha nova troca o aviso: só a última pode ser desfeita", async ({ page }) => {
  const api = await open(page);

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
  expect(api.undone).toEqual(["curadoria-2"]);
  expect(api.saved).toEqual([{ id: "curadoria-1", choice: "quero-fazer" }]);
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
  const api = await open(page);
  await button(page, "Quero fazer").click();
  await expect(toast(page)).toBeVisible();

  // Daqui em diante as respostas demoram.
  api.delayMs = 600;
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
  await expect(page.getByRole("heading", { name: "Você viu todas as sugestões de Uma tarde" })).toBeVisible();

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

test("ao voltar para a faixa, começa do zero: sem o aviso nem o contador de antes", async ({ page }) => {
  await mockDiscoverApi(page);
  await open(page, { count: 3 });
  await button(page, "Talvez depois").click();
  await expect(toast(page)).toBeVisible();
  await expect(page.getByText("Sugestão 2 de 3")).toBeVisible();

  // Daqui em diante a faixa só responde quando o teste soltar, já sem a que ela escolheu.
  let release!: () => void;
  const released = new Promise<void>((resolve) => (release = resolve));
  await page.route(/\/api\/discover\/uma-tarde$/, async (route) => {
    await released;
    await route.fulfill({ json: { band: "uma-tarde", fileTotal: 5, items: [SECOND_CARD, THIRD_CARD] } });
  });

  // Vai ao Descobrir pelo cabeçalho e entra logo de novo na mesma faixa. Com cacheComponents
  // o Next guarda a faixa escondida; na volta ela busca de novo. Nem por um quadro a tela
  // de antes pode aparecer.
  await page.getByRole("link", { name: /^Uma tarde/ }).click();
  await expect(page).toHaveURL(/\/descobrir$/);
  const seen = await watchFrames(page, ["Sugestão 2 de 3", "foi pro Ver depois"]);
  const refetch = page.waitForRequest(/\/api\/discover\/uma-tarde$/);
  await page.getByRole("link", { name: /^Uma tarde/ }).click();
  await refetch;

  // Enquanto a resposta não chega, nada de antes aparece.
  await expect(page).toHaveURL(/\/descobrir\/uma-tarde$/);
  await expect(toast(page)).toHaveCount(0);
  await expect(page.getByText(/^Sugestão \d+ de \d+/)).toHaveCount(0);

  release();
  await expect(page.getByText("Sugestão 1 de 2")).toBeVisible();
  await expect(page.getByRole("heading", { name: SECOND })).toBeVisible();
  await expect(toast(page)).toHaveCount(0);
  expect(await seen()).toEqual([]);
});

test("voltando pelo navegador e entrando logo na faixa, a tela de antes não pisca", async ({ page }) => {
  await mockDiscoverApi(page);
  await mockSuggestionsApi(page, { count: 3 });
  await page.goto("/descobrir");
  const bandCard = page.getByRole("link", { name: /^Uma tarde.*sugestões/ });
  await bandCard.click();
  await expect(page.getByText("Sugestão 1 de 3")).toBeVisible();
  await button(page, "Talvez depois").click();
  await expect(toast(page)).toBeVisible();

  await page.goBack();
  await expect(bandCard).toBeVisible();
  // A faixa escondida pode ainda guardar a tela de antes: o React adia as atualizações de
  // uma tela escondida. Ao voltar, ela tem de começar do zero já no primeiro quadro.
  // Sem a correção, o quadro antigo só aparece às vezes (com a máquina ocupada); com ela,
  // nunca. Por isso este teste pega a falha de vez em quando, mas nunca falha à toa.
  const seen = await watchFrames(page, ["Sugestão 2 de 3", "foi pro Ver depois"]);
  await bandCard.click();

  await expect(page.getByText("Sugestão 1 de 3")).toBeVisible();
  expect(await seen()).toEqual([]);
});

test("\"Desfazer\" traz o card de volta pelo lado de onde saiu", async ({ page }) => {
  await open(page);

  await button(page, "Quero fazer").click();
  await undoButton(page).click();

  // "Quero fazer" leva o card para a direita; ele volta por lá (movimento.spec.ts tem a saída).
  await expect(page.locator("[data-motion='volta-direita']")).toContainText(FIRST);
  await expect(page.locator("[data-motion^='sai-']")).toHaveCount(0);
});

test("dá para desfazer só com o teclado, com foco visível", async ({ page }) => {
  const api = await open(page);

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
  expect(api.saved).toEqual([]);
});

test("com o back demorando, o foco fica no botão e o Shift+Tab chega ao Desfazer", async ({ page }) => {
  await open(page, { delayMs: 400 });

  for (let i = 0; i < 5; i++) await page.keyboard.press("Tab");
  await page.keyboard.press("Enter");
  // Enquanto guarda, o botão fica bloqueado, mas não perde o foco.
  await expect(button(page, "Quero fazer")).toHaveAttribute("aria-disabled", "true");
  await expect(button(page, "Quero fazer")).toBeFocused();

  await expect(toast(page)).toBeVisible();
  await expect(button(page, "Quero fazer")).toBeFocused();
  for (let i = 0; i < 3; i++) await page.keyboard.press("Shift+Tab");
  await expect(undoButton(page)).toBeFocused();
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
