import { expect, test, type Page } from "@playwright/test";

// #103 · A06·2 Sugestões e A06·2a Não é pra mim (motivo). Usa os dados de teste de lib/sugestoes.ts.

type Mock = NonNullable<typeof globalThis.__NISE_MOCK_SUGESTOES__>;

async function open(page: Page, band = "uma-tarde", mock: Mock = {}) {
  await page.addInitScript((value) => {
    globalThis.__NISE_MOCK_SUGESTOES__ = value as typeof globalThis.__NISE_MOCK_SUGESTOES__;
  }, mock);
  await page.goto(`/descobrir/${band}`);
}

function choices(page: Page) {
  return page.evaluate(() => globalThis.__NISE_ESCOLHAS__ ?? []);
}

const pill = (page: Page) => page.getByRole("link", { name: /^Meu filé/ });
// O Next tem um anunciador de rota com role="alert"; os avisos da tela ficam dentro do <main>.
const alert = (page: Page) => page.getByRole("main").getByRole("alert");
const button = (page: Page, name: string) => page.getByRole("button", { name, exact: true });

test("mostra o cabeçalho, o contador e o card da sugestão", async ({ page }) => {
  await open(page);

  const back = page.getByRole("link", { name: /^Uma tarde/ });
  await expect(back).toHaveAttribute("href", "/descobrir");
  await expect(pill(page)).toContainText("5");
  await expect(pill(page)).toHaveAttribute("href", "/file");
  await expect(page.getByText("Sugestão 1 de 8")).toBeVisible();

  // A terceira é a do Figma.
  await button(page, "Talvez depois").click();
  await button(page, "Talvez depois").click();
  await expect(page.getByText("Sugestão 3 de 8")).toBeVisible();

  const card = page.getByRole("article");
  await expect(card).toContainText("Curso online");
  await expect(card.getByRole("heading", { name: "Lógica de programação com Python" })).toBeVisible();
  await expect(card).toContainText("Plataforma de cursos gratuitos · exemplo");
  for (const chip of ["Online", "~10 horas", "Grátis"]) {
    await expect(card.getByText(chip, { exact: true })).toBeVisible();
  }
  // A idade mínima tem " anos" só para o leitor de tela.
  await expect(card.getByText("13+ anos")).toHaveText("13+ anos");
  await expect(card).toContainText("Por que pra você: você curtiu Programação e IA");
});

test("sem \"por que pra você\", o card não mostra a caixa", async ({ page }) => {
  await open(page, "primeiros-passos");
  await button(page, "Talvez depois").click();
  await button(page, "Talvez depois").click();

  await expect(page.getByRole("heading", { name: "Mulheres que criaram a computação" })).toBeVisible();
  await expect(page.getByText("Por que pra você")).toHaveCount(0);
});

test("\"Quero fazer\" guarda a escolha, sobe o Meu filé e mostra a próxima", async ({ page }) => {
  await open(page);

  await button(page, "Quero fazer").click();

  await expect(page.getByText("Sugestão 2 de 8")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Um jogo da velha no navegador" })).toBeVisible();
  await expect(pill(page)).toContainText("6");
  expect(await choices(page)).toEqual([{ id: "uma-tarde-1", choice: "quero-fazer" }]);
});

test("\"Talvez depois\" guarda a escolha e não mexe no Meu filé", async ({ page }) => {
  await open(page);

  await button(page, "Talvez depois").click();

  await expect(page.getByText("Sugestão 2 de 8")).toBeVisible();
  await expect(pill(page)).toContainText("5");
  expect(await choices(page)).toEqual([{ id: "uma-tarde-1", choice: "talvez-depois" }]);
});

test("\"Não é pra mim\" abre a folha com os seis motivos e envia o escolhido", async ({ page }) => {
  await open(page);

  await button(page, "Não é pra mim").click();
  const sheet = page.getByRole("dialog", { name: "Tudo bem! Quer contar o motivo?" });
  await expect(sheet).toBeVisible();
  await expect(sheet).toContainText("É opcional, mas ajuda a gente a acertar nas próximas sugestões.");
  await expect(sheet.getByRole("group", { name: "Motivos" }).getByRole("button")).toHaveText([
    "Já conheço",
    "Muito difícil",
    "Muito fácil",
    "Não curto o tema",
    "Sem tempo agora",
    "Outro motivo",
  ]);

  // Sem motivo marcado, "Enviar" fica bloqueado; "Pular" serve para seguir sem motivo.
  await expect(sheet.getByRole("button", { name: "Enviar" })).toBeDisabled();
  await sheet.getByRole("button", { name: "Muito difícil" }).click();
  await expect(sheet.getByRole("button", { name: "Muito difícil" })).toHaveAttribute("aria-pressed", "true");
  await sheet.getByRole("button", { name: "Enviar" }).click();

  await expect(sheet).toBeHidden();
  await expect(page.getByText("Sugestão 2 de 8")).toBeVisible();
  await expect(pill(page)).toContainText("5");
  expect(await choices(page)).toEqual([{ id: "uma-tarde-1", choice: "nao-e-pra-mim", reason: "muito-dificil" }]);
});

test("\"Pular\" fecha a folha e guarda sem motivo", async ({ page }) => {
  await open(page);

  await button(page, "Não é pra mim").click();
  await page.getByRole("button", { name: "Pular" }).click();

  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page.getByText("Sugestão 2 de 8")).toBeVisible();
  expect(await choices(page)).toEqual([{ id: "uma-tarde-1", choice: "nao-e-pra-mim" }]);
});

test("fechar a folha pelo X ou pelo Esc não guarda nada e volta o foco ao botão", async ({ page }) => {
  await open(page);

  await button(page, "Não é pra mim").click();
  await page.getByRole("button", { name: "Fechar" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();

  await button(page, "Não é pra mim").click();
  await page.getByRole("button", { name: "Já conheço" }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(button(page, "Não é pra mim")).toBeFocused();

  // Ao abrir de novo, nenhum motivo vem marcado.
  await button(page, "Não é pra mim").click();
  await expect(page.getByRole("button", { name: "Já conheço" })).toHaveAttribute("aria-pressed", "false");

  await expect(page.getByText("Sugestão 1 de 8")).toBeVisible();
  expect(await choices(page)).toEqual([]);
});

test("depois da última sugestão mostra o fim da faixa com as duas saídas", async ({ page }) => {
  await open(page, "uma-tarde", { count: 2 });

  await button(page, "Quero fazer").click();
  await expect(page.getByText("Sugestão 2 de 2")).toBeVisible();
  await button(page, "Talvez depois").click();

  const heading = page.getByRole("heading", { name: "Você viu todas as sugestões de Uma tarde" });
  await expect(heading).toBeVisible();
  await expect(heading).toBeFocused();
  await expect(page.getByText("Por enquanto, é isso por aqui.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Quero fazer" })).toHaveCount(0);

  await expect(page.getByRole("link", { name: "Ver o que salvei pra depois" })).toHaveAttribute("href", "/ver-depois");
  await page.getByRole("link", { name: "Escolher outra categoria" }).click();
  await expect(page).toHaveURL("/descobrir");
});

test("faixa sem sugestões mostra \"Por enquanto, nada marcado.\"", async ({ page }) => {
  await open(page, "grande-desafio", { count: 0 });

  await expect(page.getByRole("heading", { name: "Por enquanto, nada marcado." })).toBeVisible();
  await expect(page.getByText("Por enquanto, é isso por aqui.")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Escolher outra categoria" })).toHaveAttribute("href", "/descobrir");
});

test("mostra o carregamento enquanto as sugestões chegam", async ({ page }) => {
  await open(page, "uma-tarde", { delayMs: 800 });

  await expect(page.getByText("Carregando…")).toBeVisible();
  await expect(page.getByText("Sugestão 1 de 8")).toBeVisible();
  await expect(page.getByText("Carregando…")).toHaveCount(0);
});

test("os botões ficam bloqueados enquanto a escolha é guardada", async ({ page }) => {
  await open(page, "uma-tarde", { delayMs: 500 });
  await expect(page.getByText("Sugestão 1 de 8")).toBeVisible();

  await button(page, "Quero fazer").click();
  await expect(button(page, "Talvez depois")).toBeDisabled();
  await expect(page.getByText("Sugestão 2 de 8")).toBeVisible();
  await expect(button(page, "Talvez depois")).toBeEnabled();
  expect(await choices(page)).toHaveLength(1);
});

test("se a busca falha, avisa e \"Tentar de novo\" carrega as sugestões", async ({ page }) => {
  await open(page, "uma-tarde", { failLoad: true });

  await expect(alert(page)).toContainText("Não foi possível carregar as sugestões.");
  await expect(page.getByText("Carregando…")).toHaveCount(0);
  await expect(button(page, "Quero fazer")).toHaveCount(0);

  // A conexão volta.
  await page.evaluate(() => {
    globalThis.__NISE_MOCK_SUGESTOES__ = { ...globalThis.__NISE_MOCK_SUGESTOES__, failLoad: false };
  });
  await button(page, "Tentar de novo").click();
  await expect(page.getByText("Sugestão 1 de 8")).toBeVisible();
  await expect(alert(page)).toHaveCount(0);
  await expect(pill(page)).toContainText("5");
});

test("se guardar a escolha falha, avisa, mantém a sugestão e deixa tentar de novo", async ({ page }) => {
  await open(page, "uma-tarde", { choiceFailures: 1 });
  await expect(page.getByText("Sugestão 1 de 8")).toBeVisible();

  await button(page, "Quero fazer").click();
  await expect(alert(page)).toHaveText("Não deu pra guardar. Tente de novo.");
  await expect(page.getByText("Sugestão 1 de 8")).toBeVisible();
  await expect(button(page, "Quero fazer")).toBeEnabled();
  await expect(pill(page)).toContainText("5");
  expect(await choices(page)).toEqual([]);

  // A segunda tentativa funciona, e o aviso some.
  await button(page, "Quero fazer").click();
  await expect(page.getByText("Sugestão 2 de 8")).toBeVisible();
  await expect(alert(page)).toHaveCount(0);
  await expect(pill(page)).toContainText("6");
  expect(await choices(page)).toEqual([{ id: "uma-tarde-1", choice: "quero-fazer" }]);
});

test("se guardar o \"Não é pra mim\" falha, a folha fecha e o aviso aparece", async ({ page }) => {
  await open(page, "uma-tarde", { choiceFailures: 1 });

  await button(page, "Não é pra mim").click();
  await page.getByRole("button", { name: "Muito fácil" }).click();
  await page.getByRole("button", { name: "Enviar" }).click();

  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(alert(page)).toHaveText("Não deu pra guardar. Tente de novo.");
  await expect(page.getByText("Sugestão 1 de 8")).toBeVisible();
  expect(await choices(page)).toEqual([]);
});

test("tocar numa faixa do Descobrir abre as sugestões dela", async ({ page }) => {
  await page.goto("/descobrir");
  await page.getByRole("link", { name: /^No meu ritmo/ }).click();

  await expect(page).toHaveURL("/descobrir/no-meu-ritmo");
  await expect(page.getByText("Sugestão 1 de 6")).toBeVisible();
});

test("faixa que não existe mostra a página 404", async ({ page }) => {
  // O status HTTP fica 200: com Cache Components a página vem em streaming e o 404 chega depois.
  await page.goto("/descobrir/nao-existe");
  await expect(page.getByText("This page could not be found.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Quero fazer" })).toHaveCount(0);
});

test("dá para escolher só com o teclado, com foco visível", async ({ page }) => {
  await open(page);
  await expect(page.getByText("Sugestão 1 de 8")).toBeVisible();

  // Voltar, Meu filé, Não é pra mim, Talvez depois, Quero fazer.
  for (let i = 0; i < 5; i++) await page.keyboard.press("Tab");
  const want = button(page, "Quero fazer");
  await expect(want).toBeFocused();
  await expect(want).toHaveCSS("outline-style", "solid");
  await page.keyboard.press("Enter");
  await expect(page.getByText("Sugestão 2 de 8")).toBeVisible();

  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Enter");
  const sheet = page.getByRole("dialog");
  await expect(sheet).toBeVisible();
  await page.keyboard.press("Tab"); // do X para o primeiro motivo
  await page.keyboard.press("Space");
  await expect(sheet.getByRole("button", { name: "Já conheço" })).toHaveAttribute("aria-pressed", "true");
  expect(await choices(page)).toHaveLength(1);
});

for (const width of [360, 1366]) {
  test(`em ${width} px não rola de lado e os três botões aparecem`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 360 ? 740 : 768 });
    await open(page);
    await expect(page.getByText("Sugestão 1 de 8")).toBeVisible();

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    for (const name of ["Não é pra mim", "Talvez depois", "Quero fazer"]) {
      await expect(button(page, name)).toBeInViewport({ ratio: 1 });
    }
  });
}
