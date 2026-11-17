import { expect, test, type Page } from "@playwright/test";

// #120 · A06·4a Atividade e a celebração da A06·5. Usa os dados de teste de lib/atividade.ts.

type Mock = {
  status?: Record<string, "next" | "in_progress" | "concluded">;
  delayMs?: number;
  failUpdates?: boolean;
};

const PYTHON = "logica-de-programacao-com-python";

async function open(page: Page, id: string, mock: Mock = {}) {
  await page.addInitScript((value) => {
    globalThis.__NISE_MOCK_ATIVIDADE__ = value as typeof globalThis.__NISE_MOCK_ATIVIDADE__;
  }, mock);
  await page.goto(`/file/${id}`);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
}

function button(page: Page, name: string) {
  return page.getByRole("button", { name, exact: true });
}

function siteLink(page: Page) {
  return page.getByRole("link", { name: /site/ });
}

test("mostra o detalhe da atividade com o que o Figma pede", async ({ page }) => {
  await open(page, PYTHON, { status: { [PYTHON]: "next" } });

  await expect(page.getByRole("link", { name: "Seu filé" })).toHaveAttribute("href", "/file");
  const main = page.getByRole("main");
  await expect(main.getByText("Curso online")).toBeVisible();
  await expect(main.getByText("Próxima aventura")).toBeVisible();
  await expect(main.getByText("Programação · No meu ritmo")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1, name: "Lógica de programação com Python" })).toBeVisible();
  await expect(main.getByText("Plataforma de cursos gratuitos · exemplo")).toBeVisible();

  const chips = page.getByRole("list", { name: "Detalhes" }).getByRole("listitem");
  await expect(chips).toHaveText(["Online", "~10 horas", "Grátis", "13+ anos"]);

  await expect(main.getByText("Aprenda a pensar como programadora")).toBeVisible();
  await expect(main.getByText("Por que pra você:")).toBeVisible();
  await expect(main.getByText("Python é a porta de entrada pras duas.", { exact: false })).toBeVisible();
});

test("sem explicação da recomendação, a caixa \"Por que pra você\" não aparece", async ({ page }) => {
  await open(page, "comunidade-de-robotica-no-discord");

  await expect(page.getByText("Por que pra você")).toHaveCount(0);
});

test("próxima aventura: ir pro site, marcar como iniciada e tirar do filé", async ({ page }) => {
  await open(page, PYTHON, { status: { [PYTHON]: "next" } });

  await expect(siteLink(page)).toHaveText(/Ir pro site do curso/);
  await expect(button(page, "Marcar como iniciada")).toBeVisible();
  await expect(button(page, "Tirar do filé")).toBeVisible();
  await expect(button(page, "Marcar como concluída")).toHaveCount(0);
});

test("em andamento: continuar no site, marcar como concluída e tirar do filé", async ({ page }) => {
  await open(page, PYTHON);

  await expect(page.getByRole("main").getByText("Em andamento")).toBeVisible();
  await expect(siteLink(page)).toHaveText(/Continuar no site do curso/);
  await expect(button(page, "Marcar como concluída")).toBeVisible();
  await expect(button(page, "Tirar do filé")).toBeVisible();
  await expect(button(page, "Marcar como iniciada")).toHaveCount(0);
});

test("concluída: só \"Ver no site do curso\"", async ({ page }) => {
  await open(page, "oficina-de-scratch");

  await expect(page.getByRole("main").getByText("Concluído")).toBeVisible();
  await expect(siteLink(page)).toHaveText(/Ver no site do curso/);
  await expect(page.getByRole("main").getByRole("button")).toHaveCount(0);
});

test("o que não é curso fala só em \"site\"", async ({ page }) => {
  await open(page, "comunidade-de-robotica-no-discord");

  await expect(siteLink(page)).toHaveText(/^Ir pro site/);
  await expect(siteLink(page)).not.toHaveText(/curso/);
});

test("o botão do site abre outra aba e não muda o status", async ({ page }) => {
  await open(page, PYTHON, { status: { [PYTHON]: "next" } });

  await expect(siteLink(page)).toHaveAttribute("href", "https://example.com/cursos/logica-com-python");
  await expect(siteLink(page)).toHaveAttribute("target", "_blank");
  await expect(siteLink(page)).toHaveAttribute("rel", "noopener noreferrer");
  await expect(siteLink(page)).toContainText("(abre em outra aba)");

  // Não sai para a internet no teste: a outra aba recebe uma página vazia.
  await page.context().route("https://example.com/**", (route) => route.fulfill({ body: "ok" }));
  const [popup] = await Promise.all([page.waitForEvent("popup"), siteLink(page).click()]);
  await popup.close();

  await expect(page.getByRole("main").getByText("Próxima aventura")).toBeVisible();
  await expect(button(page, "Marcar como iniciada")).toBeVisible();
});

test("\"Marcar como iniciada\" troca o status e os botões, e leva o foco ao título", async ({ page }) => {
  await open(page, PYTHON, { status: { [PYTHON]: "next" } });

  await button(page, "Marcar como iniciada").click();

  await expect(page.getByRole("main").getByText("Em andamento")).toBeVisible();
  await expect(siteLink(page)).toHaveText(/Continuar no site do curso/);
  await expect(button(page, "Marcar como concluída")).toBeVisible();
  await expect(button(page, "Marcar como iniciada")).toHaveCount(0);
  await expect(page.getByRole("heading", { level: 1 })).toBeFocused();
  await expect(page.getByText("Atividade marcada como iniciada.")).toBeAttached();
});

test("enquanto salva, os botões ficam bloqueados", async ({ page }) => {
  await open(page, PYTHON, { status: { [PYTHON]: "next" }, delayMs: 400 });

  await button(page, "Marcar como iniciada").click();

  await expect(page.getByRole("button", { name: "Salvando…" })).toBeDisabled();
  await expect(button(page, "Tirar do filé")).toBeDisabled();
  await expect(page.getByRole("main").getByText("Em andamento")).toBeVisible();
});

test("\"Marcar como concluída\" abre a celebração, e \"Fechar\" leva ao filé", async ({ page }) => {
  await open(page, PYTHON);

  await button(page, "Marcar como concluída").click();

  await expect(page).toHaveURL(`/file/${PYTHON}/concluida`);
  await expect(page.getByText("Mais um passo dado")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1, name: "Você conseguiu, Alana!" })).toBeFocused();
  await expect(page.locator("p", { hasText: "Lógica de programação com Python" })).toBeVisible();
  // RN-28: o filé não compara meninas.
  await expect(page.getByText("Outras meninas")).toHaveCount(0);

  await page.getByRole("link", { name: "Fechar" }).click();
  await expect(page).toHaveURL("/file");
});

test("depois de concluir, voltar ao detalhe mostra a atividade concluída", async ({ page }) => {
  await open(page, PYTHON);

  await button(page, "Marcar como concluída").click();
  await expect(page).toHaveURL(`/file/${PYTHON}/concluida`);
  await page.goBack();

  await expect(page.getByRole("main").getByText("Concluído")).toBeVisible();
  await expect(page.getByRole("main").getByRole("button")).toHaveCount(0);
});

test("\"Tirar do filé\" tira a atividade e leva ao filé", async ({ page }) => {
  await open(page, PYTHON);

  await button(page, "Tirar do filé").click();

  await expect(page).toHaveURL("/file");
  await page.goBack();
  await expect(page.getByText("Essa atividade não está no seu filé.")).toBeVisible();
});

test("se não der para salvar, avisa e continua na tela", async ({ page }) => {
  await open(page, PYTHON, { failUpdates: true });

  await button(page, "Marcar como concluída").click();

  await expect(page.getByRole("alert").filter({ hasText: /./ })).toHaveText("Não deu para salvar agora. Tente de novo.");
  await expect(page).toHaveURL(`/file/${PYTHON}`);
  await expect(button(page, "Marcar como concluída")).toBeEnabled();
});

test("mostra \"Carregando…\" enquanto busca a atividade", async ({ page }) => {
  await page.addInitScript(() => {
    globalThis.__NISE_MOCK_ATIVIDADE__ = { delayMs: 800 };
  });
  await page.goto(`/file/${PYTHON}`);

  await expect(page.getByText("Carregando…")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});

test("atividade que não está no filé", async ({ page }) => {
  await page.goto("/file/nao-existe");

  await expect(page.getByText("Essa atividade não está no seu filé.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Seu filé" })).toBeVisible();
});

test("dá para usar só com o teclado, com foco visível", async ({ page }) => {
  await open(page, PYTHON, { status: { [PYTHON]: "next" } });

  const order = ["Seu filé", "Ir pro site do curso", "Marcar como iniciada", "Tirar do filé"];
  for (const name of order) {
    await page.keyboard.press("Tab");
    const focused = page.locator(":focus");
    await expect(focused).toContainText(name);
    const outline = await focused.evaluate((el) => getComputedStyle(el).outlineStyle);
    expect(outline).toBe("solid");
  }

  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("main").getByText("Em andamento")).toBeVisible();
});

for (const width of [360, 1366]) {
  test(`cabe em ${width}px sem rolagem lateral`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await open(page, PYTHON);

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await expect(button(page, "Marcar como concluída")).toBeInViewport();
  });
}
