import { expect, test, type Page } from "@playwright/test";

// #115 · A06·3 Seu filé. Usa os dados de teste de lib/file.ts.

type Item = {
  id: string;
  title: string;
  theme: string;
  type: string;
  details: string;
  deadline?: string;
  status: "em-andamento" | "proxima" | "concluido";
};

type Mock = { items?: Item[]; delayMs?: number };

async function openWith(page: Page, mock: Mock) {
  await page.addInitScript((value) => {
    globalThis.__NISE_MOCK_FILE__ = value as typeof globalThis.__NISE_MOCK_FILE__;
  }, mock);
  await page.goto("/file");
}

function section(page: Page, name: string) {
  return page.getByRole("region", { name });
}

function item(page: Page, title: string) {
  return page.getByRole("article").filter({ has: page.getByRole("heading", { level: 3, name: title }) });
}

function makeItem(id: string, status: Item["status"], theme = "programacao"): Item {
  return { id, title: `Item ${id}`, theme, type: "Curso online", details: "Online · ~1 h", status };
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
  ).toHaveAttribute("href", "/file/logica-de-programacao-com-python");
  await expect(section(page, "Próximas aventuras").getByRole("link", { name: /^Abrir:/ })).toHaveCount(3);
  await expect(section(page, "Concluídos").getByRole("link", { name: /^Ver:/ })).toHaveCount(3);

  await section(page, "Próximas aventuras")
    .getByRole("link", { name: "Abrir: Hackathon Meninas na Tecnologia" })
    .click();
  await expect(page).toHaveURL(/\/file\/hackathon-meninas-na-tecnologia$/);
});

test("cada item fica na seção do seu status", async ({ page }) => {
  await openWith(page, {
    items: [makeItem("a", "concluido"), makeItem("b", "proxima"), makeItem("c", "concluido")],
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
  await openWith(page, { items: [makeItem("a", "proxima")] });

  await expect(section(page, "Em andamento").getByRole("heading", { level: 2 })).toHaveText("Em andamento0");
  await expect(section(page, "Em andamento").getByRole("button")).toHaveCount(0);
  await expect(section(page, "Concluídos").getByRole("button")).toHaveCount(0);
});

test("o desenho pinta com a cor do tema só o que foi concluído", async ({ page }) => {
  await openWith(page, {
    items: [
      makeItem("a", "concluido", "robotica"),
      makeItem("b", "em-andamento", "ia"),
      makeItem("c", "proxima", "ia"),
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
  const items = Array.from({ length: 16 }, (_, index) => makeItem(`n${index}`, "proxima"));
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
