import { expect, test, type Page } from "@playwright/test";
import type { FileSection, ThemeCode } from "../lib/file";
import { mockActivityApi } from "./activity-api";
import { mockDiscoverApi } from "./discover-api";
import { type MockFileItem, mockFileApi } from "./file-api";
import { watchFrames } from "./frames";
import { mockTermsApi } from "./terms-api";

// #115 e #117 · A06·3 Seu filé, pela rota GET /api/file (#116), simulada em file-api.ts.
// Algumas telas levam ao Descobrir (A06·1), que lê as contagens do back (#88).
test.beforeEach(async ({ page }) => {
  await mockDiscoverApi(page);
  await mockFileApi(page);
});

/** Abre o filé com outra resposta do back. A rota mais nova vale. */
async function openWith(page: Page, options: Parameters<typeof mockFileApi>[1]) {
  await mockFileApi(page, options);
  await page.goto("/file");
}

function section(page: Page, name: string) {
  return page.getByRole("region", { name });
}

function item(page: Page, title: string) {
  return page.getByRole("article").filter({ has: page.getByRole("heading", { level: 3, name: title }) });
}

function makeItem(id: string, itemSection: FileSection, theme: ThemeCode | null = "programacao"): MockFileItem {
  return {
    id: `curadoria-${id}`,
    title: `Item ${id}`,
    theme,
    typeLabel: "Curso online",
    details: "Online · ~1 h",
    deadline: null,
    section: itemSection,
  };
}

test("mostra o título, o texto e os links para o Descobrir e para Por que filé?", async ({ page }) => {
  await page.goto("/file");

  await expect(page.getByRole("heading", { level: 1, name: "Seu filé" })).toBeVisible();
  await expect(page.getByText("No seu ritmo, sem pressa.")).toBeVisible();
  await expect(page.getByRole("link", { name: "O que é o filé?" })).toHaveAttribute("href", "/por-que-file");

  await page.getByRole("link", { name: "Descobrir mais sugestões" }).click();
  await expect(page).toHaveURL(/\/descobrir$/);
});

test("as três seções têm contador; Concluídos começa fechada", async ({ page }) => {
  await page.goto("/file");

  const sections = page.getByRole("main").getByRole("heading", { level: 2 });
  await expect(sections).toHaveText(["Em andamento1", "Próximas aventuras3", "Concluídos3"]);

  await expect(page.getByRole("button", { name: "Recolher Em andamento" })).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("button", { name: "Recolher Próximas aventuras" })).toHaveAttribute(
    "aria-expanded",
    "true",
  );
  await expect(page.getByRole("button", { name: "Mostrar Concluídos" })).toHaveAttribute("aria-expanded", "false");

  await expect(item(page, "Lógica de programação com Python")).toBeVisible();
  await expect(item(page, "IA para iniciantes")).toBeVisible();
  await expect(item(page, "Oficina de Scratch")).toBeHidden();
});

test("Recolher e Mostrar abrem e fecham a seção", async ({ page }) => {
  await page.goto("/file");

  await page.getByRole("button", { name: "Recolher Próximas aventuras" }).click();
  await expect(item(page, "IA para iniciantes")).toBeHidden();
  await expect(page.getByRole("button", { name: "Mostrar Próximas aventuras" })).toHaveAttribute(
    "aria-expanded",
    "false",
  );

  await page.getByRole("button", { name: "Mostrar Concluídos" }).click();
  await expect(item(page, "Oficina de Scratch")).toBeVisible();
  await expect(page.getByRole("button", { name: "Recolher Concluídos" })).toBeVisible();
});

test("cada item mostra tema e tipo, título e detalhes; o evento mostra o prazo", async ({ page }) => {
  await page.goto("/file");

  const course = item(page, "Lógica de programação com Python");
  await expect(course).toContainText("Programação · Curso online");
  await expect(course).toContainText("Online · ~10 h");
  await expect(course).not.toContainText("Inscrições até");

  const event = item(page, "Hackathon Meninas na Tecnologia");
  await expect(event).toContainText("Programação · Hackathon");
  await expect(event).toContainText("Presencial · Maceió");
  await expect(event).toContainText("Inscrições até 30/out");
  await expect(page.getByText(/Inscrições até/)).toHaveCount(1);
});

test("a ação é Continuar em andamento, Abrir nas próximas e Ver nos concluídos", async ({ page }) => {
  await page.goto("/file");
  await page.getByRole("button", { name: "Mostrar Concluídos" }).click();

  await expect(
    section(page, "Em andamento").getByRole("link", { name: "Continuar: Lógica de programação com Python" }),
  ).toHaveAttribute("href", "/file/curadoria-1");
  await expect(section(page, "Próximas aventuras").getByRole("link", { name: /^Abrir:/ })).toHaveCount(3);
  await expect(section(page, "Concluídos").getByRole("link", { name: /^Ver:/ })).toHaveCount(3);

  // A atividade (#119) é a tela de verdade: sem simular a rota dela, ela consultaria um back
  // local, se houver um rodando.
  await mockActivityApi(page);
  await section(page, "Próximas aventuras")
    .getByRole("link", { name: "Abrir: Hackathon Meninas na Tecnologia" })
    .click();
  await expect(page).toHaveURL(/\/file\/curadoria-2$/);
});

test("cada item fica na seção do seu status", async ({ page }) => {
  await openWith(page, {
    items: [makeItem("a", "concluded"), makeItem("b", "next"), makeItem("c", "concluded")],
  });

  await expect(page.getByRole("main").getByRole("heading", { level: 2 })).toHaveText([
    "Em andamento0",
    "Próximas aventuras1",
    "Concluídos2",
  ]);
  await expect(section(page, "Próximas aventuras").getByRole("heading", { name: "Item b" })).toBeVisible();
  await page.getByRole("button", { name: "Mostrar Concluídos" }).click();
  await expect(section(page, "Concluídos").getByRole("heading", { level: 3 })).toHaveText(["Item a", "Item c"]);
});

test("seção vazia mostra 0 e não tem Recolher nem Mostrar", async ({ page }) => {
  await openWith(page, { items: [makeItem("a", "next")] });

  await expect(section(page, "Em andamento").getByRole("heading", { level: 2 })).toHaveText("Em andamento0");
  await expect(section(page, "Em andamento").getByRole("button")).toHaveCount(0);
  await expect(section(page, "Concluídos").getByRole("button")).toHaveCount(0);
});

test("o desenho pinta com a cor do tema só o que foi concluído", async ({ page }) => {
  await openWith(page, {
    items: [
      makeItem("a", "concluded", "robotica"),
      makeItem("b", "in_progress", "ia"),
      makeItem("c", "next", "ia"),
    ],
  });

  const drawing = page.getByRole("img", {
    name: "Seu filé: 1 concluído, 1 em andamento e 1 próxima aventura.",
  });
  await expect(drawing).toBeVisible();
  // Só o concluído usa uma cor de tema; o centro é "Seu começo".
  await expect(drawing.locator('rect[fill^="var(--nise-theme"]')).toHaveCount(1);
  await expect(drawing.locator('rect[fill="var(--nise-theme-robotica)"]')).toHaveCount(1);
  await expect(drawing.locator('rect[fill="var(--nise-ink)"]')).toHaveCount(1);
  // Em andamento: metade teal. Próxima: borda teal. Sobram 11 casas vazias.
  await expect(drawing.locator("path")).toHaveCount(1);
  await expect(drawing.locator('rect[stroke="var(--nise-teal)"]')).toHaveCount(2);
  await expect(drawing.locator("rect[stroke-dasharray]")).toHaveCount(11);
});

test("com mais de 14 itens, o desenho mostra 14 e as listas mostram todos", async ({ page }) => {
  const items = Array.from({ length: 16 }, (_, index) => makeItem(`${index}`, "next"));
  await openWith(page, { items });

  const drawing = page.getByRole("img", { name: /^Seu filé: 0 concluídos, 0 em andamento e 16 próximas aventuras\.$/ });
  await expect(drawing.locator('rect[stroke="var(--nise-teal)"]')).toHaveCount(14);
  await expect(drawing.locator("rect[stroke-dasharray]")).toHaveCount(0);
  await expect(section(page, "Próximas aventuras").getByRole("article")).toHaveCount(16);
});

test("a legenda explica o desenho e mostra os temas do filé", async ({ page }) => {
  await page.goto("/file");

  const legend = page.getByRole("list", { name: "Legenda do filé" });
  for (const text of [
    "Seu começo",
    "Concluído (cor do tema)",
    "Em andamento",
    "Próximas aventuras",
    "Programação",
    "Robótica",
    "IA",
  ]) {
    await expect(legend.getByText(text, { exact: true })).toBeVisible();
  }
});

test("não há barra de progresso nem porcentagem (RN-28)", async ({ page }) => {
  await page.goto("/file");
  await expect(item(page, "IA para iniciantes")).toBeVisible();

  await expect(page.getByRole("progressbar")).toHaveCount(0);
  await expect(page.getByRole("main")).not.toContainText("%");
});

test("a barra inferior marca Filé; Agenda e o avatar têm destino provisório", async ({ page }) => {
  await page.goto("/file");
  const nav = page.getByRole("navigation", { name: "Navegação principal" });

  await expect(nav.getByRole("link", { name: "Filé" })).toHaveAttribute("aria-current", "page");
  await expect(nav.getByRole("link", { name: "Descobrir" })).not.toHaveAttribute("aria-current", "page");
  await expect(nav.getByRole("link", { name: "Agenda" })).toHaveAttribute("href", "/agenda");
  await expect(page.getByRole("link", { name: "Seu perfil" })).toHaveAttribute("href", "/perfil");
});

test("mostra o carregamento enquanto o filé chega", async ({ page }) => {
  await openWith(page, { delayMs: 1000 });

  await expect(page.getByText("Carregando…")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1, name: "Seu filé" })).toBeVisible();
  await expect(page.getByText("Carregando…")).toHaveCount(0);
});

test("o desenho segue a ordem e os temas que o back manda", async ({ page }) => {
  // Fora de ordem de propósito: o back devolve os quadradinhos já na ordem do desenho.
  await openWith(page, {
    items: [makeItem("a", "next", "ia"), makeItem("b", "concluded", "ia"), makeItem("c", "concluded", "programacao")],
  });

  const drawing = page.getByRole("img", { name: /^Seu filé:/ });
  // As duas primeiras casas (as de cima do centro) são os concluídos, Programação antes de IA.
  await expect(drawing.locator('rect[x="138"][y="92"]')).toHaveAttribute("fill", "var(--nise-theme-programacao)");
  await expect(drawing.locator('rect[x="92"][y="92"]')).toHaveAttribute("fill", "var(--nise-theme-ia)");
});

test("item sem tema usa a cor neutra e mostra só o tipo", async ({ page }) => {
  await openWith(page, { items: [makeItem("a", "concluded", null)] });
  await page.getByRole("button", { name: "Mostrar Concluídos" }).click();

  const card = item(page, "Item a");
  await expect(card.getByText("Curso online", { exact: true })).toBeVisible();
  await expect(page.getByRole("img", { name: /^Seu filé:/ }).locator('rect[fill="var(--nise-muted)"]')).toHaveCount(1);
});

test("quando o filé não carrega, mostra o erro e tenta de novo", async ({ page }) => {
  await openWith(page, { failure: 500 });

  await expect(page.getByRole("heading", { name: "Não foi possível carregar" })).toBeVisible();
  await mockFileApi(page);
  await page.getByRole("button", { name: "Tentar novamente" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Seu filé" })).toBeVisible();
  await expect(item(page, "IA para iniciantes")).toBeVisible();
});

test("ao voltar ao filé, não mostra o filé de antes, nem por um quadro", async ({ page }) => {
  await openWith(page, { items: [makeItem("a", "next"), makeItem("b", "next")] });
  await expect(item(page, "Item a")).toBeVisible();

  // Ela vai ao Descobrir e escolhe mais coisas. Daqui em diante o filé já vem com os itens
  // novos, mas demora a responder.
  await page.getByRole("link", { name: "Descobrir mais sugestões" }).click();
  await expect(page).toHaveURL(/\/descobrir$/);
  await mockFileApi(page, {
    items: [makeItem("c", "next"), makeItem("d", "next"), makeItem("e", "next")],
    delayMs: 1500,
  });

  // Com cacheComponents o Next guarda o filé escondido; na volta ele busca de novo.
  const seen = await watchFrames(page, ["Item a"]);
  await page.goBack();

  await expect(item(page, "Item c")).toBeVisible();
  await expect(section(page, "Próximas aventuras").getByRole("article")).toHaveCount(3);
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

test("dá para usar só com o teclado, com foco visível", async ({ page }) => {
  await page.goto("/file");
  await expect(item(page, "IA para iniciantes")).toBeVisible();

  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Seu perfil" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "O que é o filé?" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Descobrir mais sugestões" })).toBeFocused();
  await page.keyboard.press("Tab");
  const toggle = page.getByRole("button", { name: "Recolher Em andamento" });
  await expect(toggle).toBeFocused();
  const outline = await toggle.evaluate((element) => getComputedStyle(element).outlineStyle);
  expect(outline).toBe("solid");

  await page.keyboard.press("Enter");
  await expect(item(page, "Lógica de programação com Python")).toBeHidden();
  await page.keyboard.press("Enter");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Continuar: Lógica de programação com Python" })).toBeFocused();
});

test("os alvos de toque têm pelo menos 44 px", async ({ page }) => {
  await page.goto("/file");
  await page.getByRole("button", { name: "Mostrar Concluídos" }).click();

  const targets = [
    page.getByRole("link", { name: "O que é o filé?" }),
    page.getByRole("button", { name: "Recolher Em andamento" }),
    page.getByRole("link", { name: "Continuar: Lógica de programação com Python" }),
    page.getByRole("link", { name: "Ver: Oficina de Scratch" }),
  ];
  for (const target of targets) {
    const box = await target.boundingBox();
    expect(box?.height).toBeGreaterThanOrEqual(44);
  }
});

for (const width of [360, 1366]) {
  test(`cabe em ${width} px sem rolagem horizontal`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto("/file");
    await page.getByRole("button", { name: "Mostrar Concluídos" }).click();
    await expect(item(page, "Quiz: IA no dia a dia")).toBeVisible();

    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(scrollWidth).toBeLessThanOrEqual(width);
  });
}

test("with no activity, shows the empty card, the link and the drawing, and hides the sections", async ({ page }) => {
  await openWith(page, { items: [] });

  await expect(page.getByRole("heading", { level: 2, name: "Seu filé tá só começando" })).toBeVisible();
  await expect(page.getByText("cada atividade vira um quadradinho")).toBeVisible();
  await expect(page.getByText("No seu ritmo, sem pressa.")).toHaveCount(0);
  await expect(page.getByRole("link", { name: /Descobrir mais sugestões/ })).toBeVisible();
  await expect(page.getByRole("img", { name: /0 concluídos, 0 em andamento e 0 próximas aventuras/ })).toBeVisible();
  for (const name of ["Em andamento", "Próximas aventuras", "Concluídos"]) {
    await expect(section(page, name)).toHaveCount(0);
  }
});

test("with a single activity, the regular screen is back", async ({ page }) => {
  await openWith(page, { items: [makeItem("a", "next")] });

  await expect(page.getByRole("heading", { name: "Seu filé tá só começando" })).toHaveCount(0);
  await expect(page.getByText("No seu ritmo, sem pressa.")).toBeVisible();
  await expect(section(page, "Próximas aventuras")).toBeVisible();
});
