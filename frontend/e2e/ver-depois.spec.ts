import { expect, test, type Page } from "@playwright/test";

// #111 · A06·2b Ver depois. Usa os dados de teste de lib/ver-depois.ts.

type Mock = {
  items?: unknown[];
  delayMs?: number;
};

const HINT = "Toque em “Talvez depois” num cartão de sugestão pra guardar aqui.";

async function openWith(page: Page, mock: Mock) {
  await page.addInitScript((value) => {
    globalThis.__NISE_MOCK_VER_DEPOIS__ = value as typeof globalThis.__NISE_MOCK_VER_DEPOIS__;
  }, mock);
  await page.goto("/ver-depois");
}

function card(page: Page, title: string) {
  return page.getByRole("article", { name: title });
}

function chip(page: Page, name: string) {
  return page.getByRole("group", { name: "Filtrar por faixa" }).getByRole("button", { name, exact: true });
}

test("mostra o título, a frase, os 6 filtros e os itens guardados", async ({ page }) => {
  await page.goto("/ver-depois");

  await expect(page.getByRole("heading", { level: 1, name: "Ver depois" })).toBeVisible();
  await expect(page.getByText("O que você guardou pra decidir com calma.")).toBeVisible();
  const filters = page.getByRole("group", { name: "Filtrar por faixa" }).getByRole("button");
  await expect(filters).toHaveText([
    "Todos",
    "Primeiros passos",
    "Uma tarde",
    "No meu ritmo",
    "Rolê com a galera",
    "Grande desafio",
  ]);
  await expect(chip(page, "Todos")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("article")).toHaveCount(4);
});

test("o cartão mostra tipo e faixa, título, detalhes e as duas ações", async ({ page }) => {
  await page.goto("/ver-depois");
  const item = card(page, "Robótica com Arduino para iniciantes");

  await expect(item).toContainText("Playlist · Primeiros passos");
  await expect(item.getByRole("heading", { name: "Robótica com Arduino para iniciantes" })).toBeVisible();
  await expect(item).toContainText("Online · ~40 min");
  await expect(item.getByRole("button", { name: "+ Quero fazer" })).toBeVisible();
  await expect(item.getByRole("button", { name: "Remover" })).toBeVisible();
  await expect(item).not.toContainText("Inscrições até");
});

test("evento mostra o prazo de inscrição", async ({ page }) => {
  await page.goto("/ver-depois");

  await expect(card(page, "Hackathon Meninas na Tecnologia")).toContainText("Hackathon · Grande desafio");
  await expect(card(page, "Hackathon Meninas na Tecnologia")).toContainText("Inscrições até 30 de outubro");
});

test("escolher uma faixa mostra só os itens dela", async ({ page }) => {
  await page.goto("/ver-depois");

  await chip(page, "Grande desafio").click();
  await expect(chip(page, "Grande desafio")).toHaveAttribute("aria-pressed", "true");
  await expect(chip(page, "Todos")).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByRole("article")).toHaveCount(1);
  await expect(card(page, "Hackathon Meninas na Tecnologia")).toBeVisible();

  await chip(page, "Todos").click();
  await expect(page.getByRole("article")).toHaveCount(4);
});

test("faixa sem itens deixa só a dica", async ({ page }) => {
  await page.goto("/ver-depois");

  await chip(page, "Uma tarde").click();
  await expect(page.getByRole("article")).toHaveCount(0);
  await expect(page.getByText(HINT)).toBeVisible();
});

test("+ Quero fazer tira o cartão da lista e avisa que foi pro filé", async ({ page }) => {
  await page.goto("/ver-depois");

  await card(page, "Lógica de programação com Python").getByRole("button", { name: "+ Quero fazer" }).click();
  await expect(card(page, "Lógica de programação com Python")).toHaveCount(0);
  await expect(page.getByRole("article")).toHaveCount(3);
  await expect(page.getByText("Lógica de programação com Python foi pro seu filé.")).toBeAttached();
});

test("Remover tira o cartão da lista", async ({ page }) => {
  await page.goto("/ver-depois");

  await card(page, "Hackathon Meninas na Tecnologia").getByRole("button", { name: "Remover" }).click();
  await expect(card(page, "Hackathon Meninas na Tecnologia")).toHaveCount(0);
  await expect(page.getByText("Hackathon Meninas na Tecnologia saiu do Ver depois.")).toBeAttached();

  // O item removido também some do filtro da faixa.
  await chip(page, "Grande desafio").click();
  await expect(page.getByRole("article")).toHaveCount(0);
});

test("os botões ficam bloqueados enquanto a escolha é salva", async ({ page }) => {
  await openWith(page, { delayMs: 600 });
  const item = card(page, "Robótica com Arduino para iniciantes");

  await item.getByRole("button", { name: "Remover" }).click();
  await expect(item.getByRole("button", { name: "+ Quero fazer" })).toBeDisabled();
  await expect(item).toHaveCount(0);
});

test("a dica aparece com itens e com a lista vazia", async ({ page }) => {
  await page.goto("/ver-depois");
  await expect(page.getByText(HINT)).toBeVisible();

  await openWith(page, { items: [] });
  await expect(page.getByRole("heading", { level: 1, name: "Ver depois" })).toBeVisible();
  await expect(page.getByRole("article")).toHaveCount(0);
  await expect(page.getByText(HINT)).toBeVisible();
});

test("mostra o carregamento enquanto os itens chegam", async ({ page }) => {
  await openWith(page, { delayMs: 1000 });

  await expect(page.getByText("Carregando…")).toBeVisible();
  await expect(page.getByRole("article").first()).toBeVisible();
  await expect(page.getByText("Carregando…")).toHaveCount(0);
});

test("a barra inferior marca Ver depois; Agenda e o avatar têm destino provisório", async ({ page }) => {
  await page.goto("/ver-depois");
  const nav = page.getByRole("navigation", { name: "Navegação principal" });

  await expect(nav.getByRole("link", { name: "Ver depois" })).toHaveAttribute("aria-current", "page");
  await expect(nav.getByRole("link", { name: "Descobrir" })).not.toHaveAttribute("aria-current", "page");
  await expect(nav.getByRole("link", { name: "Agenda" })).toHaveAttribute("href", "/agenda");
  await expect(page.getByRole("link", { name: "Seu perfil" })).toHaveAttribute("href", "/perfil");
});

test("dá para filtrar e decidir só com o teclado, com foco visível", async ({ page }) => {
  await page.goto("/ver-depois");
  await expect(page.getByRole("article")).toHaveCount(4);

  // Avatar, depois os filtros.
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Seu perfil" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(chip(page, "Todos")).toBeFocused();
  const outline = await chip(page, "Todos").evaluate((element) => getComputedStyle(element).outlineStyle);
  expect(outline).toBe("solid");

  await page.keyboard.press("Tab");
  await page.keyboard.press("Enter");
  await expect(chip(page, "Primeiros passos")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("article")).toHaveCount(1);

  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("article")).toHaveCount(4);

  // Remover o primeiro cartão leva o foco ao "+ Quero fazer" do seguinte.
  const first = card(page, "Hackathon Meninas na Tecnologia");
  await first.getByRole("button", { name: "Remover" }).focus();
  await page.keyboard.press("Enter");
  await expect(first).toHaveCount(0);
  await expect(
    card(page, "Robótica com Arduino para iniciantes").getByRole("button", { name: "+ Quero fazer" }),
  ).toBeFocused();
});

test("quando a lista esvazia, o foco vai para o título", async ({ page }) => {
  await page.goto("/ver-depois");

  await chip(page, "Grande desafio").click();
  await card(page, "Hackathon Meninas na Tecnologia").getByRole("button", { name: "+ Quero fazer" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { level: 1, name: "Ver depois" })).toBeFocused();
});

for (const width of [360, 1366]) {
  test(`cabe em ${width} px sem rolagem horizontal; os filtros rolam para o lado`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto("/ver-depois");
    await expect(page.getByRole("article").first()).toBeVisible();

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await expect(page.getByRole("navigation", { name: "Navegação principal" })).toBeInViewport();

    // Os 6 chips não cabem na largura do celular; o último aparece rolando o grupo.
    await chip(page, "Grande desafio").scrollIntoViewIfNeeded();
    await expect(chip(page, "Grande desafio")).toBeInViewport();
  });
}
