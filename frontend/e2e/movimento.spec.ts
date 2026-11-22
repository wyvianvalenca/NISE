import { expect, test, type Locator, type Page } from "@playwright/test";
import { mockSuggestionsApi } from "./suggestions-api";

// Movimento na A06·2: o card sai para o lado da escolha e o aviso "Desfazer" entra e sai com
// uma animação curta. As rotas da #104 são simuladas em suggestions-api.ts. Dados fictícios.

const FIRST = "Crie seu primeiro site com HTML";

async function open(page: Page) {
  await mockSuggestionsApi(page);
  await page.goto("/descobrir/uma-tarde");
  await expect(page.getByText("Sugestão 1 de 8")).toBeVisible();
}

/** Deixa as animações 20 vezes mais lentas, para o teste ver o card no meio do caminho. */
async function slowAnimations(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Animation.enable");
  await cdp.send("Animation.setPlaybackRate", { playbackRate: 0.05 });
}

/** Os nomes das animações que estão rodando no elemento (o CSS Module prefixa cada nome). */
function animations(locator: Locator) {
  return locator.evaluate((element) =>
    element.getAnimations().map((animation) => (animation as CSSAnimation).animationName),
  );
}

const button = (page: Page, name: string) => page.getByRole("button", { name, exact: true });
const leaving = (page: Page) => page.locator("[data-motion^='sai-']");
const toastArea = (page: Page) =>
  page.getByRole("status").filter({ has: page.getByRole("button") }).locator("xpath=..");

for (const [choice, side] of [
  ["Quero fazer", "direita"],
  ["Talvez depois", "cima"],
] as const) {
  test(`"${choice}" leva o card para ${side}, e a próxima já é a sugestão à mostra`, async ({ page }) => {
    await open(page);
    await slowAnimations(page);

    await button(page, choice).click();

    const card = leaving(page);
    await expect(card).toHaveAttribute("data-motion", `sai-${side}`);
    await expect(card).toContainText(FIRST);
    // Para o leitor de tela e o teclado, o card que sai já não existe.
    await expect(card).toHaveAttribute("aria-hidden", "true");
    await expect(card).toHaveAttribute("inert", "");
    await expect(page.getByText("Sugestão 2 de 8")).toBeVisible();
  });
}

test("\"Não é pra mim\" leva o card para a esquerda", async ({ page }) => {
  await open(page);
  await slowAnimations(page);

  await button(page, "Não é pra mim").click();
  await page.getByRole("button", { name: "Pular" }).click();

  await expect(leaving(page)).toHaveAttribute("data-motion", "sai-esquerda");
});

test("o card que saiu some no fim da animação", async ({ page }) => {
  await open(page);

  await button(page, "Quero fazer").click();

  await expect(page.getByText("Sugestão 2 de 8")).toBeVisible();
  await expect(leaving(page)).toHaveCount(0);
});

test("a escolha que não foi guardada não tira o card do lugar", async ({ page }) => {
  await mockSuggestionsApi(page, { choiceFailures: 1 });
  await page.goto("/descobrir/uma-tarde");
  await expect(page.getByText("Sugestão 1 de 8")).toBeVisible();

  await button(page, "Quero fazer").click();

  await expect(page.getByRole("main").getByRole("alert")).toHaveText("Não deu pra guardar. Tente de novo.");
  await expect(leaving(page)).toHaveCount(0);
  await expect(page.getByText("Sugestão 1 de 8")).toBeVisible();
});

test("o aviso entra deslizando e, quando o tempo acaba, sai antes de sumir", async ({ page }) => {
  await page.clock.install();
  await open(page);

  await button(page, "Quero fazer").click();
  await expect(toastArea(page)).toBeVisible();
  expect((await animations(toastArea(page))).join()).toContain("toast-in");

  await slowAnimations(page);
  await page.clock.runFor(5000);
  await expect.poll(async () => (await animations(toastArea(page))).join()).toContain("toast-out");

  // O fim da animação tira o aviso da tela.
  await expect(toastArea(page)).toHaveCount(0, { timeout: 15000 });
});

test.describe("com menos movimento", () => {
  test.use({ reducedMotion: "reduce" });

  test("o card só some e o próximo só aparece, sem deslizar", async ({ page }) => {
    await open(page);
    await slowAnimations(page);

    await button(page, "Quero fazer").click();

    const card = leaving(page);
    await expect(card).toHaveAttribute("data-motion", "sai-direita");
    expect((await animations(card)).join()).toContain("card-fade-out");
    expect(await card.evaluate((element) => getComputedStyle(element).translate)).toBe("none");
    expect((await animations(page.locator("[data-motion='chega']"))).join()).toContain("card-fade-in");
  });

  test("o aviso só aparece, sem deslizar", async ({ page }) => {
    await open(page);

    await button(page, "Quero fazer").click();

    expect((await animations(toastArea(page))).join()).not.toContain("toast-in");
  });
});
