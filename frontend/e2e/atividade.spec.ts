import { expect, test, type Page } from "@playwright/test";
import type { ActivityStatus } from "../lib/atividade";
import { mockActivityApi } from "./activity-api";
import { FIGMA_ITEMS, mockFileApi } from "./file-api";
import { slowAnimations } from "./frames";
import { watchFrames } from "./frames";
import { mockTermsApi } from "./terms-api";

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

test("ao voltar à atividade, não mostra o status de antes, nem por um quadro", async ({ page }) => {
  await open(page, PYTHON, startAs("next"));
  await expect(page.getByRole("main").getByText("Próxima aventura")).toBeVisible();

  // Ela vai ao filé. Daqui em diante a atividade já vem em andamento (mudou em outro
  // aparelho, por exemplo), mas demora a responder.
  await page.getByRole("link", { name: "Seu filé" }).press("Enter");
  await expect(page).toHaveURL(/\/file$/);
  await mockActivityApi(page, { ...startAs("in_progress"), delayMs: 1500 });

  // Com cacheComponents o Next guarda a atividade escondida; na volta ela busca de novo.
  const seen = await watchFrames(page, ["Próxima aventura"]);
  await page.goBack();

  await expect(page.getByRole("main").getByText("Em andamento")).toBeVisible();
  expect(await seen()).toEqual([]);
});

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

test("sem primeiro nome, a celebração diz só \"Você conseguiu!\"", async ({ page }) => {
  await open(page, PYTHON, { ...startAs("in_progress"), firstName: "" });

  await button(page, "Marcar como concluída").click();

  await expect(page.getByRole("heading", { level: 1, name: "Você conseguiu!", exact: true })).toBeVisible();
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

test("iniciar uma atividade preenche o quadradinho dela no filé", async ({ page }) => {
  await mockActivityApi(page);
  await page.goto("/file");
  // Enter, e não clique: o botão do Next no modo dev pode ficar por cima dos links.
  await page.locator("a[href='/file/curadoria-3']").press("Enter");
  await button(page, "Marcar como iniciada").click();
  await expect(page.getByRole("main").getByText("Em andamento")).toBeVisible();

  // De volta ao filé, ela já está em andamento: a metade teal do quadradinho se preenche.
  await mockFileApi(page, {
    items: FIGMA_ITEMS.map((item) => (item.id === "curadoria-3" ? { ...item, section: "in_progress" } : item)),
  });
  await slowAnimations(page);
  await page.getByRole("link", { name: "Seu filé" }).press("Enter");

  await expect(page.locator("[data-filled]")).toHaveAttribute("data-square", "curadoria-3");
  await expect(page.locator("[data-filled]")).toHaveCount(1);
});

test("concluir depois de iniciar não repete o preenchimento da metade no filé", async ({ page }) => {
  const DISCORD = "curadoria-3";
  const comStatus = (section: "in_progress" | "concluded") =>
    FIGMA_ITEMS.map((item) => (item.id === DISCORD ? { ...item, section } : item));
  await mockActivityApi(page);
  await page.goto("/file");

  // Inicia: de volta ao filé, a metade teal se preenche.
  await page.locator(`a[href='/file/${DISCORD}']`).press("Enter");
  await button(page, "Marcar como iniciada").click();
  await expect(page.getByRole("main").getByText("Em andamento")).toBeVisible();
  await mockFileApi(page, { items: comStatus("in_progress") });
  await page.getByRole("link", { name: "Seu filé" }).press("Enter");
  const half = page.locator(`[data-square='${DISCORD}'] path`);
  await expect(half).toBeVisible();
  // Espera o preenchimento terminar.
  await expect.poll(() => half.evaluate((element) => element.getAnimations().length)).toBe(0);

  // Conclui: na volta, registra a cada quadro se a metade voltou a se animar.
  await page.locator(`a[href='/file/${DISCORD}']`).press("Enter");
  await button(page, "Marcar como concluída").click();
  await expect(page).toHaveURL(`/file/${DISCORD}/concluida`);
  await mockFileApi(page, { items: comStatus("concluded"), delayMs: 1000 });
  await page.evaluate((id) => {
    const w = window as unknown as { __metadeDeNovo: number };
    w.__metadeDeNovo = 0;
    const tick = () => {
      const path = document.querySelector(`[data-square='${id}'] path`);
      if (path && path.getAnimations().length > 0) w.__metadeDeNovo += 1;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, DISCORD);
  await slowAnimations(page);
  await page.getByRole("link", { name: "Fechar" }).press("Enter");

  // Só o preenchimento do concluído roda; a metade não aparece se preenchendo de novo.
  await expect(page.locator(`[data-square='${DISCORD}'] path`)).toHaveCount(0);
  await expect(page.locator(`[data-square='${DISCORD}']`)).toHaveAttribute("data-filled", "true");
  expect(await page.evaluate(() => (window as unknown as { __metadeDeNovo: number }).__metadeDeNovo)).toBe(0);
});

test.describe("com a lista rolada para baixo", () => {
  test.use({ viewport: { width: 390, height: 700 } });

  /** Abre o filé rolado até o fim, com o desenho fora da vista, e entra na atividade. */
  async function openFromTheList(page: Page, id: string) {
    await mockActivityApi(page);
    await page.goto("/file");
    const link = page.locator(`a[href='/file/${id}']`);
    await link.scrollIntoViewIfNeeded();
    await page.locator("main").evaluate((main) => main.parentElement!.scrollTo(0, main.parentElement!.scrollHeight));
    await expect(page.getByRole("img", { name: /^Seu filé:/ })).not.toBeInViewport();
    await link.press("Enter");
  }

  test("ao voltar com uma mudança, o desenho entra na tela antes de animar", async ({ page }) => {
    await openFromTheList(page, "curadoria-3");
    await button(page, "Marcar como iniciada").click();
    await expect(page.getByRole("main").getByText("Em andamento")).toBeVisible();
    await mockFileApi(page, {
      items: FIGMA_ITEMS.map((item) => (item.id === "curadoria-3" ? { ...item, section: "in_progress" } : item)),
    });
    await slowAnimations(page);
    await page.getByRole("link", { name: "Seu filé" }).press("Enter");

    const drawing = page.getByRole("img", { name: /^Seu filé:/ });
    await expect(drawing).toBeInViewport({ ratio: 1 });
    // A metade só começa a crescer com o desenho já à vista.
    await expect(page.locator("[data-filled]")).toHaveAttribute("data-square", "curadoria-3");
    await expect(page.locator("[data-filled]")).toHaveCount(0);
  });

  test("ao voltar sem mudança, a tela fica onde estava", async ({ page }) => {
    await openFromTheList(page, "curadoria-3");
    await expect(button(page, "Marcar como iniciada")).toBeVisible();
    await page.getByRole("link", { name: "Seu filé" }).press("Enter");

    await expect(page.locator("a[href='/file/curadoria-3']")).toBeVisible();
    await page.waitForTimeout(1000);
    await expect(page.getByRole("img", { name: /^Seu filé:/ })).not.toBeInViewport();
  });
});

test("tirar uma atividade do filé faz o quadradinho dela sair", async ({ page }) => {
  await mockActivityApi(page);
  await page.goto("/file");
  await page.locator("a[href='/file/curadoria-1']").press("Enter");
  await expect(button(page, "Tirar do filé")).toBeVisible();

  await mockFileApi(page, { items: FIGMA_ITEMS.filter((item) => item.id !== PYTHON) });
  await slowAnimations(page);
  await button(page, "Tirar do filé").click();

  // No filé, o quadradinho dela faz o caminho de volta na casa antiga e depois some.
  await expect(page).toHaveURL("/file");
  await expect(page.locator(`[data-leaving='${PYTHON}']`)).toBeAttached();
  await expect(page.locator(`[data-leaving='${PYTHON}']`)).toHaveCount(0);
  await expect(page.locator(`[data-square='${PYTHON}']`)).toHaveCount(0);
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
  // A tela dos termos é a de verdade: sem simular a rota dela, ela consultaria um back
  // local, se houver um rodando, e sairia dos termos (o teste falhava às vezes).
  await mockTermsApi(page);
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
