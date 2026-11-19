import { expect, test, type Page } from "@playwright/test";
import type { ActivityStatus } from "../lib/atividade";
import { mockActivityApi } from "./activity-api";
import { mockFileApi } from "./file-api";

// #120 · A06·4a Atividade e a celebração da A06·5, com as rotas da #121 simuladas
// em activity-api.ts (integração na #122).

// "Fechar" e "Tirar do filé" levam ao filé (A06·3), que lê GET /api/file (#116).
test.beforeEach(async ({ page }) => {
  await mockFileApi(page);
});

type Options = Parameters<typeof mockActivityApi>[1];

const PYTHON = "curadoria-1";

async function open(page: Page, id: string, options: Options = {}) {
  const sent = await mockActivityApi(page, options);
  await page.goto(`/file/${id}`);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  return sent;
}

function startAs(status: ActivityStatus): Options {
  return { status: { [PYTHON]: status } };
}

function button(page: Page, name: string) {
  return page.getByRole("button", { name, exact: true });
}

function siteLink(page: Page) {
  return page.getByRole("link", { name: /site/ });
}

test("mostra o detalhe da atividade com o que o Figma pede", async ({ page }) => {
  await open(page, PYTHON, startAs("next"));

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
  await open(page, "curadoria-3");

  await expect(page.getByText("Por que pra você")).toHaveCount(0);
});

test("próxima aventura: ir pro site, marcar como iniciada e tirar do filé", async ({ page }) => {
  await open(page, PYTHON, startAs("next"));

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
  await open(page, PYTHON, startAs("concluded"));

  await expect(page.getByRole("main").getByText("Concluído")).toBeVisible();
  await expect(siteLink(page)).toHaveText(/Ver no site do curso/);
  await expect(page.getByRole("main").getByRole("button")).toHaveCount(0);
});

test("o que não é curso fala só em \"site\"", async ({ page }) => {
  await open(page, "curadoria-3");

  await expect(siteLink(page)).toHaveText(/^Ir pro site/);
  await expect(siteLink(page)).not.toHaveText(/curso/);
});

test("o botão do site abre outra aba e não muda o status", async ({ page }) => {
  const sent = await open(page, PYTHON, startAs("next"));

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
  expect(sent.statusChanges).toEqual([]);
});

test("\"Marcar como iniciada\" troca o status e os botões, e leva o foco ao título", async ({ page }) => {
  const sent = await open(page, PYTHON, startAs("next"));

  await button(page, "Marcar como iniciada").click();

  await expect(page.getByRole("main").getByText("Em andamento")).toBeVisible();
  await expect(siteLink(page)).toHaveText(/Continuar no site do curso/);
  await expect(button(page, "Marcar como concluída")).toBeVisible();
  await expect(button(page, "Marcar como iniciada")).toHaveCount(0);
  await expect(page.getByRole("heading", { level: 1 })).toBeFocused();
  await expect(page.getByText("Atividade marcada como iniciada.")).toBeAttached();
  expect(sent.statusChanges).toEqual([{ id: PYTHON, status: "in_progress" }]);
});

test("enquanto salva, os botões ficam bloqueados", async ({ page }) => {
  await mockActivityApi(page, startAs("next"));
  await page.goto(`/file/${PYTHON}`);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  // Só a mudança de status demora.
  await page.route("**/api/file/*/status", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 400));
    await route.fallback();
  });

  await button(page, "Marcar como iniciada").click();

  await expect(page.getByRole("button", { name: "Salvando…" })).toBeDisabled();
  await expect(button(page, "Tirar do filé")).toBeDisabled();
  await expect(page.getByRole("main").getByText("Em andamento")).toBeVisible();
});

test("\"Marcar como concluída\" abre a celebração, e \"Fechar\" leva ao filé", async ({ page }) => {
  const sent = await open(page, PYTHON);

  await button(page, "Marcar como concluída").click();

  await expect(page).toHaveURL(`/file/${PYTHON}/concluida`);
  await expect(page.getByText("Mais um passo dado")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1, name: "Você conseguiu, Alana!" })).toBeFocused();
  await expect(page.locator("p", { hasText: "Lógica de programação com Python" })).toBeVisible();
  // RN-28: o filé não compara meninas.
  await expect(page.getByText("Outras meninas")).toHaveCount(0);
  expect(sent.statusChanges).toEqual([{ id: PYTHON, status: "concluded" }]);

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
  const sent = await open(page, PYTHON);

  await button(page, "Tirar do filé").click();

  await expect(page).toHaveURL("/file");
  expect(sent.removed).toEqual([PYTHON]);
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

test("se o back recusar o salto, avisa e não muda a tela", async ({ page }) => {
  // A tela mostra "próxima", mas o back já tem a atividade concluída (outra aba, por exemplo).
  await open(page, PYTHON, startAs("next"));
  await page.route("**/api/file/*/status", (route) =>
    route.fulfill({ status: 409, json: { error: "invalid_status_change" } }),
  );

  await button(page, "Marcar como iniciada").click();

  await expect(page.getByRole("alert").filter({ hasText: /./ })).toHaveText("Não deu para salvar agora. Tente de novo.");
  await expect(page.getByRole("main").getByText("Próxima aventura")).toBeVisible();
});

test("mostra \"Carregando…\" enquanto busca a atividade", async ({ page }) => {
  await mockActivityApi(page, { delayMs: 800 });
  await page.goto(`/file/${PYTHON}`);

  await expect(page.getByText("Carregando…")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});

test("atividade que não está no filé", async ({ page }) => {
  await mockActivityApi(page);
  await page.goto("/file/curadoria-99");

  await expect(page.getByText("Essa atividade não está no seu filé.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Seu filé" })).toBeVisible();
});

test("se não carregar, avisa e tenta de novo", async ({ page }) => {
  await mockActivityApi(page, { failure: 500 });
  await page.goto(`/file/${PYTHON}`);

  await expect(page.getByRole("alert").filter({ hasText: /./ })).toContainText("Não foi possível carregar");
  // A conexão voltou: a nova rota vale para a próxima busca.
  await mockActivityApi(page);
  await page.getByRole("button", { name: "Tentar novamente" }).click();

  await expect(page.getByRole("heading", { level: 1, name: "Lógica de programação com Python" })).toBeVisible();
});

test("sem sessão, leva para a página inicial", async ({ page }) => {
  await mockActivityApi(page, { failure: 401 });
  await page.goto(`/file/${PYTHON}`);

  await expect(page).toHaveURL("/");
});

test("sem o aceite dos termos, leva aos termos", async ({ page }) => {
  await mockActivityApi(page, { failure: "terms_not_accepted" });
  await page.goto(`/file/${PYTHON}`);

  await expect(page).toHaveURL("/cadastro/termos");
});

test("dá para usar só com o teclado, com foco visível", async ({ page }) => {
  await open(page, PYTHON, startAs("next"));

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
