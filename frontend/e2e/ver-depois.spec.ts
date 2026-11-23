import { expect, test, type Page } from "@playwright/test";
import { mockDiscoverApi } from "./discover-api";
import { watchFrames } from "./frames";
import { mockLaterApi, SAVED_ITEMS } from "./later-api";
import { mockTermsApi } from "./terms-api";

// #111 e #113 · A06·2b Ver depois, pela rota GET /api/later (#112) e pelas rotas da escolha
// (PUT e DELETE /api/file/{id}), simuladas em later-api.ts.
// Algumas telas levam ao Descobrir (A06·1), que lê as contagens do back (#88).
test.beforeEach(async ({ page }) => {
  await mockDiscoverApi(page);
  await mockLaterApi(page);
});

const HINT = "Toque em “Talvez depois” num cartão de sugestão pra guardar aqui.";

/** Abre o Ver depois com outra resposta do back. A rota mais nova vale. */
async function openWith(page: Page, options: Parameters<typeof mockLaterApi>[1]) {
  const api = await mockLaterApi(page, options);
  await page.goto("/ver-depois");
  return api;
}

function card(page: Page, title: string) {
  return page.getByRole("article", { name: title });
}

/** O aviso de erro da escolha. Fica no main: o Next tem outro role="alert", o anúncio de rota. */
function failure(page: Page) {
  return page.getByRole("main").getByRole("alert");
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

test("+ Quero fazer guarda a escolha no back e o item não volta ao recarregar", async ({ page }) => {
  const api = await openWith(page, {});

  await card(page, "Lógica de programação com Python").getByRole("button", { name: "+ Quero fazer" }).click();
  await expect(card(page, "Lógica de programação com Python")).toHaveCount(0);
  expect(api.choices).toEqual([{ id: "curadoria-3", choice: "quero-fazer" }]);

  await page.reload();
  await expect(page.getByRole("article")).toHaveCount(3);
  await expect(card(page, "Lógica de programação com Python")).toHaveCount(0);
});

test("Remover apaga a escolha no back e o item não volta ao recarregar", async ({ page }) => {
  const api = await openWith(page, {});

  await card(page, "Oficina: seu primeiro site").getByRole("button", { name: "Remover" }).click();
  await expect(card(page, "Oficina: seu primeiro site")).toHaveCount(0);
  expect(api.removed).toEqual(["acao-4"]);
  expect(api.choices).toEqual([]);

  await page.reload();
  await expect(page.getByRole("article")).toHaveCount(3);
});

test("se a escolha não é salva, o cartão fica, avisa e o foco volta ao cartão", async ({ page }) => {
  const api = await openWith(page, { choiceFailures: 1 });
  const item = card(page, "Robótica com Arduino para iniciantes");

  await item.getByRole("button", { name: "+ Quero fazer" }).focus();
  await page.keyboard.press("Enter");
  await expect(failure(page)).toHaveText("Não deu pra guardar. Tente de novo.");
  await expect(item).toBeVisible();
  await expect(item.getByRole("button", { name: "+ Quero fazer" })).toBeFocused();

  // Tentar de novo funciona e tira o aviso.
  await page.keyboard.press("Enter");
  await expect(item).toHaveCount(0);
  await expect(failure(page)).toHaveCount(0);
  expect(api.choices).toEqual([{ id: "curadoria-2", choice: "quero-fazer" }]);
});

test("se Remover falha, o cartão fica e avisa", async ({ page }) => {
  await openWith(page, { choiceFailures: 1 });
  const item = card(page, "Hackathon Meninas na Tecnologia");

  await item.getByRole("button", { name: "Remover" }).click();
  await expect(failure(page)).toHaveText("Não deu pra remover. Tente de novo.");
  await expect(item).toBeVisible();
});

test("o avatar usa o nome que vem do back", async ({ page }) => {
  await openWith(page, { firstName: "Bia" });

  await expect(page.getByRole("button", { name: "Sua conta" })).toHaveText("B");
});

test("quando a lista não carrega, mostra o erro e tenta de novo", async ({ page }) => {
  await openWith(page, { failure: 500 });

  await expect(page.getByRole("heading", { name: "Não foi possível carregar" })).toBeVisible();
  await mockLaterApi(page);
  await page.getByRole("button", { name: "Tentar novamente" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Ver depois" })).toBeVisible();
  await expect(page.getByRole("article")).toHaveCount(4);
});

test("ao voltar ao Ver depois, não mostra a lista de antes, nem por um quadro", async ({ page }) => {
  await page.goto("/ver-depois");
  await expect(card(page, "Hackathon Meninas na Tecnologia")).toBeVisible();

  // Ela vai ao Descobrir e decide o hackathon por lá. Daqui em diante a lista já vem sem ele,
  // mas demora a responder.
  await page.getByRole("navigation").getByRole("link", { name: "Descobrir" }).click();
  await expect(page).toHaveURL(/\/descobrir$/);
  await mockLaterApi(page, { items: SAVED_ITEMS.slice(1), delayMs: 1500 });

  // Com cacheComponents o Next guarda o Ver depois escondido; na volta ele busca de novo.
  const seen = await watchFrames(page, ["Hackathon Meninas na Tecnologia"]);
  await page.goBack();

  await expect(card(page, "Robótica com Arduino para iniciantes")).toBeVisible();
  await expect(card(page, "Hackathon Meninas na Tecnologia")).toHaveCount(0);
  expect(await seen()).toEqual([]);
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

test("os botões ficam bloqueados enquanto a escolha é salva", async ({ page }) => {
  await openWith(page, { delayMs: 600 });
  const item = card(page, "Robótica com Arduino para iniciantes");

  await item.getByRole("button", { name: "Remover" }).click();
  await expect(item.getByRole("button", { name: "+ Quero fazer" })).toBeDisabled();
  await expect(item).toHaveCount(0);
});

test("sem nada guardado mostra o estado vazio, sem filtros nem dica", async ({ page }) => {
  await openWith(page, { items: [] });

  await expect(page.getByRole("heading", { level: 1, name: "Ver depois" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Nada guardado por enquanto" })).toBeVisible();
  await expect(
    page.getByText("Quando uma sugestão parecer legal mas não for a hora, toque em “Talvez depois” e ela fica aqui."),
  ).toBeVisible();
  await expect(page.getByRole("group", { name: "Filtrar por faixa" })).toHaveCount(0);
  await expect(page.getByText(HINT)).toHaveCount(0);

  await page.getByRole("link", { name: "Ver sugestões" }).click();
  await expect(page).toHaveURL("/descobrir");
});

test("Ver sugestões mantém o texto ink no hover", async ({ page }) => {
  await openWith(page, { items: [] });

  const action = page.getByRole("link", { name: "Ver sugestões" });
  await action.hover();
  // ink sobre tealSoft dá 9,56:1; teal ali dava 4,06:1, abaixo do AA.
  await expect(action).toHaveCSS("color", "rgb(10, 59, 72)");
});

test("com itens mostra a lista e a dica; ao decidir o último, aparece o estado vazio", async ({ page }) => {
  await page.goto("/ver-depois");
  await expect(page.getByRole("article")).toHaveCount(4);
  await expect(page.getByText(HINT)).toBeVisible();

  for (const title of [
    "Hackathon Meninas na Tecnologia",
    "Robótica com Arduino para iniciantes",
    "Lógica de programação com Python",
    "Oficina: seu primeiro site",
  ]) {
    await card(page, title).getByRole("button", { name: "Remover" }).click();
    await expect(card(page, title)).toHaveCount(0);
  }
  await expect(page.getByRole("heading", { name: "Nada guardado por enquanto" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 1, name: "Ver depois" })).toBeFocused();
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
  // O avatar abre o menu da conta; o perfil fica dentro dele.
  await page.getByRole("button", { name: "Sua conta" }).click();
  await expect(page.getByRole("link", { name: "Ver perfil" })).toHaveAttribute("href", "/perfil");
});

test("dá para filtrar e decidir só com o teclado, com foco visível", async ({ page }) => {
  await page.goto("/ver-depois");
  await expect(page.getByRole("article")).toHaveCount(4);

  // Avatar, depois os filtros.
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Sua conta" })).toBeFocused();
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
