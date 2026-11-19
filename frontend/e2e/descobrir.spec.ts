import { expect, test, type Page } from "@playwright/test";
import { BAND_CODES } from "../lib/descobrir";
import { FIGMA_COUNTS, mockDiscoverApi } from "./discover-api";
import { watchFrames } from "./frames";
import { mockSuggestionsApi } from "./suggestions-api";
import { mockTermsApi } from "./terms-api";

// #87 e #89 · A06·1 Descobrir, com as rotas do back (#88) simuladas em discover-api.ts.

type Options = Parameters<typeof mockDiscoverApi>[1];

async function openWith(page: Page, options: Options = {}) {
  const saved = await mockDiscoverApi(page, options);
  // Vários testes abrem uma faixa; sem simular a rota dela, a tela da faixa consultaria um
  // back local, se houver um rodando.
  await mockSuggestionsApi(page);
  await page.goto("/descobrir");
  return saved;
}

function band(page: Page, name: string) {
  return page.getByRole("link", { name: new RegExp(`^${name}`) });
}

test("cumprimenta pelo nome e mostra as 5 faixas na ordem, com os grupos", async ({ page }) => {
  await openWith(page);

  await expect(page.getByText("Oi, Alana!")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1, name: "Quanto você quer mergulhar agora?" })).toBeVisible();

  const main = page.getByRole("main");
  const order = await main.locator("h2, a").allInnerTexts();
  expect(order.map((text) => text.split("\n")[0])).toEqual([
    "Primeiros passos",
    "Sozinha",
    "Uma tarde",
    "No meu ritmo",
    "Em grupo",
    "Rolê com a galera",
    "Grande desafio",
  ]);
});

test("cada faixa mostra a descrição e o número de sugestões", async ({ page }) => {
  await openWith(page);

  await expect(band(page, "Primeiros passos")).toContainText("Até 15 min: vídeos, quizzes e artigos curtos");
  await expect(band(page, "Primeiros passos")).toContainText("12 sugestões");
  await expect(band(page, "Uma tarde")).toContainText("Até 1 dia: tutoriais e mini-projetos");
  await expect(band(page, "No meu ritmo")).toContainText("6 sugestões");
  await expect(band(page, "Rolê com a galera")).toContainText("Até 1 dia: oficinas, palestras e encontros");
  await expect(band(page, "Grande desafio")).toContainText("4 sugestões");
});

test("a faixa da última vez tem a tag, e só ela", async ({ page }) => {
  await openWith(page, { lastBand: "no-meu-ritmo" });

  await expect(band(page, "No meu ritmo")).toContainText("da última vez");
  await expect(page.getByText("da última vez")).toHaveCount(1);
});

test("sem faixa da última vez, nenhuma tag aparece", async ({ page }) => {
  await openWith(page, { lastBand: null });

  await expect(band(page, "Grande desafio")).toBeVisible();
  await expect(page.getByText("da última vez")).toHaveCount(0);
});

test("a faixa da última vez sem sugestões não mostra a tag", async ({ page }) => {
  await openWith(page, { counts: { "uma-tarde": 0 }, lastBand: "uma-tarde" });

  await expect(page.getByText("Por enquanto, nada marcado.")).toBeVisible();
  await expect(page.getByText("da última vez")).toHaveCount(0);
});

test("tocar numa faixa abre as sugestões dela", async ({ page }) => {
  await openWith(page);

  await band(page, "Grande desafio").click();

  await expect(page).toHaveURL(/\/descobrir\/grande-desafio$/);
});

test("faixa com 0 sugestões mostra o aviso e não é link", async ({ page }) => {
  await openWith(page, { counts: { "role-com-a-galera": 0 } });

  await expect(page.getByText("0 sugestões")).toBeVisible();
  await expect(page.getByText("Por enquanto, nada marcado.")).toBeVisible();
  await expect(page.getByText("Até 1 dia: oficinas, palestras e encontros")).toHaveCount(0);
  await expect(band(page, "Rolê com a galera")).toHaveCount(0);

  await page.getByText("Rolê com a galera").click();
  await expect(page).toHaveURL(/\/descobrir$/);
});

test("1 sugestão fica no singular", async ({ page }) => {
  await openWith(page, { counts: { "grande-desafio": 1 } });

  await expect(band(page, "Grande desafio")).toContainText("1 sugestão");
  await expect(band(page, "Grande desafio")).not.toContainText("1 sugestões");
});

test("a barra inferior marca Descobrir; Agenda e o avatar têm destino provisório", async ({ page }) => {
  await openWith(page);
  const nav = page.getByRole("navigation", { name: "Navegação principal" });

  await expect(nav.getByRole("link", { name: "Descobrir" })).toHaveAttribute("aria-current", "page");
  await expect(nav.getByRole("link", { name: "Agenda" })).toHaveAttribute("href", "/agenda");
  await expect(nav.getByRole("link", { name: "Agenda" })).not.toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("link", { name: "Seu perfil" })).toHaveAttribute("href", "/perfil");
});

test("uma espera curta não mostra nada no lugar das faixas", async ({ page }) => {
  await openWith(page, { delayMs: 500 });

  await expect(band(page, "Primeiros passos")).toBeVisible();
  await expect(page.getByText("Tecendo seu filé…")).toHaveCount(0);
});

test("uma espera longa mostra o Tecendo seu filé… (#81)", async ({ page }) => {
  await openWith(page, { delayMs: 2500 });

  await expect(page.getByRole("heading", { name: "Tecendo seu filé…" })).toBeVisible();
  await expect(page.getByText("Quase lá, Alana")).toBeVisible();
  await expect(band(page, "Primeiros passos")).toBeVisible();
  await expect(page.getByText("Tecendo seu filé…")).toHaveCount(0);
});

test("se a rota falha, mostra a E04 e tenta de novo", async ({ page }) => {
  await openWith(page, { failure: 500 });

  await expect(page.getByRole("heading", { name: "Não foi possível carregar" })).toBeVisible();

  await page.unrouteAll();
  await mockDiscoverApi(page);
  await page.getByRole("button", { name: "Tentar novamente" }).click();

  await expect(band(page, "Primeiros passos")).toBeVisible();
});

test("sem sessão, volta para o início", async ({ page }) => {
  await openWith(page, { failure: 401 });

  await expect(page).toHaveURL(/\/$/);
});

test("sem o aceite dos termos, vai para os termos", async ({ page }) => {
  // A tela dos termos é a de verdade: sem simular a rota dela, ela consultaria um back
  // local, se houver um rodando, e sairia dos termos (o teste falhava às vezes).
  await mockTermsApi(page);
  await openWith(page, { failure: "terms_not_accepted" });

  await expect(page).toHaveURL(/\/cadastro\/termos$/);
});

test("tocar numa faixa grava a faixa para a tag da próxima visita", async ({ page }) => {
  const saved = await openWith(page);

  await band(page, "No meu ritmo").click();

  await expect(page).toHaveURL(/\/descobrir\/no-meu-ritmo$/);
  await expect.poll(() => saved).toEqual(["no-meu-ritmo"]);
});

test("ao voltar de uma faixa, não mostra as contagens nem a tag de antes", async ({ page }) => {
  await openWith(page, { lastBand: "uma-tarde" });
  await expect(band(page, "No meu ritmo")).toContainText("6 sugestões");

  // Daqui em diante o GET só responde quando o teste soltar, já com a escolha
  // feita na faixa: uma sugestão a menos e a tag nela.
  let release!: () => void;
  const released = new Promise<void>((resolve) => (release = resolve));
  await page.route("**/api/discover", async (route) => {
    await released;
    await route.fulfill({
      json: {
        firstName: "Alana",
        bands: BAND_CODES.map((code) => ({
          code,
          count: code === "no-meu-ritmo" ? 5 : FIGMA_COUNTS[code],
        })),
        lastBand: "no-meu-ritmo",
      },
    });
  });

  await band(page, "No meu ritmo").click();
  await expect(page).toHaveURL(/\/descobrir\/no-meu-ritmo$/);
  // Com cacheComponents o Next guarda o Descobrir escondido; na volta ele busca de novo.
  // Nem por um quadro a contagem de antes pode aparecer.
  const seen = await watchFrames(page, ["6 sugestões"]);
  const refetch = page.waitForRequest("**/api/discover");
  await page.goBack();
  await refetch;

  // Enquanto a resposta não chega, nada de antes aparece no meio.
  await expect(page).toHaveURL(/\/descobrir$/);
  await expect(band(page, "No meu ritmo")).toHaveCount(0);
  await expect(page.getByText("da última vez")).toHaveCount(0);

  release();
  await expect(band(page, "No meu ritmo")).toContainText("5 sugestões");
  await expect(band(page, "No meu ritmo")).toContainText("da última vez");
  await expect(page.getByText("da última vez")).toHaveCount(1);
  expect(await seen()).toEqual([]);
});

test("no toque, a tag não pula de faixa enquanto o Descobrir está à vista", async ({ page }) => {
  const saved = await openWith(page, { lastBand: "uma-tarde" });
  await expect(band(page, "Uma tarde")).toContainText("da última vez");

  // Segura a navegação: o toque acontece (o Link vê o defaultPrevented e não
  // navega), mas o Descobrir continua na tela, como no instante antes da troca.
  await page.evaluate(() =>
    document.addEventListener("click", (event) => event.preventDefault(), { capture: true }),
  );
  await band(page, "No meu ritmo").click();

  await expect.poll(() => saved).toEqual(["no-meu-ritmo"]);
  await expect(page).toHaveURL(/\/descobrir$/);
  await expect(band(page, "Uma tarde")).toContainText("da última vez");
  await expect(page.getByText("da última vez")).toHaveCount(1);
});

test("faixa vazia não grava nada ao ser tocada", async ({ page }) => {
  const saved = await openWith(page, { counts: { "uma-tarde": 0 } });

  await page.getByText("Uma tarde").click();

  await expect(page).toHaveURL(/\/descobrir$/);
  expect(saved).toEqual([]);
});

test("dá para escolher uma faixa só com o teclado, com foco visível", async ({ page }) => {
  await openWith(page);
  await expect(band(page, "Primeiros passos")).toBeVisible();

  // A marca não é link: o primeiro Tab vai para o avatar, o segundo para a primeira faixa.
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Seu perfil" })).toBeFocused();
  await page.keyboard.press("Tab");
  const first = band(page, "Primeiros passos");
  await expect(first).toBeFocused();
  const outline = await first.evaluate((element) => getComputedStyle(element).outlineStyle);
  expect(outline).toBe("solid");

  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/descobrir\/primeiros-passos$/);
});

for (const width of [360, 1366]) {
  test(`cabe em ${width} px sem rolagem horizontal`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await openWith(page);
    await expect(band(page, "Grande desafio")).toBeVisible();

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await expect(page.getByRole("navigation", { name: "Navegação principal" })).toBeInViewport();
  });
}
