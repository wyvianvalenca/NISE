import { expect, test, type Page } from "@playwright/test";
import { mockDiscoverApi } from "./discover-api";
import { mockSuggestionsApi } from "./suggestions-api";

// #103 e #105 · A06·2 Sugestões e A06·2a Não é pra mim (motivo), com as rotas da #104 simuladas
// em suggestions-api.ts.

type Options = Parameters<typeof mockSuggestionsApi>[1];

async function open(page: Page, band = "uma-tarde", options: Options = {}) {
  const api = await mockSuggestionsApi(page, options);
  await page.goto(`/descobrir/${band}`);
  return api;
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
  const api = await open(page);

  await button(page, "Quero fazer").click();

  await expect(page.getByText("Sugestão 2 de 8")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Um jogo da velha no navegador" })).toBeVisible();
  await expect(pill(page)).toContainText("6");
  expect(api.choices).toEqual([{ id: "curadoria-1", choice: "quero-fazer" }]);
});

test("\"Talvez depois\" guarda a escolha e não mexe no Meu filé", async ({ page }) => {
  const api = await open(page);

  await button(page, "Talvez depois").click();

  await expect(page.getByText("Sugestão 2 de 8")).toBeVisible();
  await expect(pill(page)).toContainText("5");
  expect(api.choices).toEqual([{ id: "curadoria-1", choice: "talvez-depois" }]);
});

test("\"Não é pra mim\" abre a folha com os seis motivos e envia o escolhido", async ({ page }) => {
  const api = await open(page);

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
  expect(api.choices).toEqual([{ id: "curadoria-1", choice: "nao-e-pra-mim", reason: "muito-dificil" }]);
});

test("\"Pular\" fecha a folha e guarda sem motivo", async ({ page }) => {
  const api = await open(page);

  await button(page, "Não é pra mim").click();
  await page.getByRole("button", { name: "Pular" }).click();

  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page.getByText("Sugestão 2 de 8")).toBeVisible();
  expect(api.choices).toEqual([{ id: "curadoria-1", choice: "nao-e-pra-mim" }]);
});

test("fechar a folha pelo X ou pelo Esc não guarda nada e volta o foco ao botão", async ({ page }) => {
  const api = await open(page);

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
  expect(api.choices).toEqual([]);
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

  const heading = page.getByRole("heading", { name: "Por enquanto, nada marcado." });
  await expect(heading).toBeVisible();
  await expect(page.getByText("Por enquanto, é isso por aqui.")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Escolher outra categoria" })).toHaveAttribute("href", "/descobrir");
  // Ela acabou de chegar: o foco não pula para o título.
  await expect(heading).not.toBeFocused();
});

test("o link secundário do fim da faixa mantém o texto ink no hover", async ({ page }) => {
  await open(page, "grande-desafio", { count: 0 });

  const secondary = page.getByRole("link", { name: "Ver o que salvei pra depois" });
  await secondary.hover();
  // ink sobre tealSoft dá 9,56:1; teal ali dava 4,06:1, abaixo do AA.
  await expect(secondary).toHaveCSS("color", "rgb(10, 59, 72)");
});

test("uma espera curta não mostra nada no lugar do card", async ({ page }) => {
  await open(page, "uma-tarde", { delayMs: 500 });

  await expect(page.getByText("Sugestão 1 de 8")).toBeVisible();
  await expect(page.getByText("Tecendo seu filé…")).toHaveCount(0);
});

test("uma espera longa mostra o Tecendo seu filé… (#81)", async ({ page }) => {
  await open(page, "uma-tarde", { delayMs: 2500 });

  await expect(page.getByRole("heading", { name: "Tecendo seu filé…" })).toBeVisible();
  await expect(page.getByText("Sugestão 1 de 8")).toBeVisible();
  await expect(page.getByText("Tecendo seu filé…")).toHaveCount(0);
});

test("os botões ficam bloqueados enquanto a escolha é guardada", async ({ page }) => {
  const api = await open(page, "uma-tarde", { delayMs: 500 });
  await expect(page.getByText("Sugestão 1 de 8")).toBeVisible();

  await button(page, "Quero fazer").click();
  await expect(button(page, "Talvez depois")).toBeDisabled();
  await expect(page.getByText("Sugestão 2 de 8")).toBeVisible();
  await expect(button(page, "Talvez depois")).toBeEnabled();
  expect(api.choices).toHaveLength(1);
});

test("se a busca falha, mostra a E04 e \"Tentar novamente\" carrega as sugestões", async ({ page }) => {
  const api = await open(page, "uma-tarde", { failure: 500 });

  await expect(page.getByRole("heading", { name: "Não foi possível carregar" })).toBeVisible();
  await expect(button(page, "Quero fazer")).toHaveCount(0);

  // A conexão volta.
  api.failure = undefined;
  await button(page, "Tentar novamente").click();
  await expect(page.getByText("Sugestão 1 de 8")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Não foi possível carregar" })).toHaveCount(0);
  await expect(pill(page)).toContainText("5");
});

test("sem sessão, volta para o início", async ({ page }) => {
  await open(page, "uma-tarde", { failure: 401 });

  await expect(page).toHaveURL(/\/$/);
});

test("sem o aceite dos termos, vai para os termos", async ({ page }) => {
  await open(page, "uma-tarde", { failure: "terms_not_accepted" });

  await expect(page).toHaveURL(/\/cadastro\/termos$/);
});

test("ação de grupo sem custo nem idade mínima não mostra esses chips", async ({ page }) => {
  await open(page, "role-com-a-galera", {
    items: [
      {
        id: "acao-7",
        typeLabel: "Oficina",
        title: "Oficina ficticia de robótica",
        source: "Grupo de incentivo · exemplo",
        format: "in_person",
        duration: "1 dia",
        costCents: null,
        minAge: null,
        why: null,
      },
    ],
  });

  const card = page.getByRole("article");
  await expect(card.getByRole("heading", { name: "Oficina ficticia de robótica" })).toBeVisible();
  await expect(card.getByText("Presencial", { exact: true })).toBeVisible();
  await expect(card.getByText("1 dia", { exact: true })).toBeVisible();
  await expect(card.getByText("Grátis")).toHaveCount(0);
  await expect(card.getByText(/\+ anos/)).toHaveCount(0);
  await expect(card.getByText("Por que pra você")).toHaveCount(0);
});

test("o custo vem em centavos e aparece em reais", async ({ page }) => {
  // No meu ritmo: o quinto item custa R$ 30.
  await open(page, "no-meu-ritmo");
  for (let i = 0; i < 4; i++) {
    await button(page, "Talvez depois").click();
    await expect(page.getByText(`Sugestão ${i + 2} de 6`)).toBeVisible();
  }

  await expect(page.getByRole("article").getByText("R$ 30", { exact: true })).toBeVisible();
});

test("se guardar a escolha falha, avisa, mantém a sugestão e deixa tentar de novo", async ({ page }) => {
  const api = await open(page, "uma-tarde", { choiceFailures: 1 });
  await expect(page.getByText("Sugestão 1 de 8")).toBeVisible();

  await button(page, "Quero fazer").click();
  await expect(alert(page)).toHaveText("Não deu pra guardar. Tente de novo.");
  await expect(page.getByText("Sugestão 1 de 8")).toBeVisible();
  await expect(button(page, "Quero fazer")).toBeEnabled();
  await expect(pill(page)).toContainText("5");
  expect(api.choices).toEqual([]);

  // A segunda tentativa funciona, e o aviso some.
  await button(page, "Quero fazer").click();
  await expect(page.getByText("Sugestão 2 de 8")).toBeVisible();
  await expect(alert(page)).toHaveCount(0);
  await expect(pill(page)).toContainText("6");
  expect(api.choices).toEqual([{ id: "curadoria-1", choice: "quero-fazer" }]);
});

test("se guardar o \"Não é pra mim\" falha, a folha fecha e o aviso aparece", async ({ page }) => {
  const api = await open(page, "uma-tarde", { choiceFailures: 1 });

  await button(page, "Não é pra mim").click();
  await page.getByRole("button", { name: "Muito fácil" }).click();
  await page.getByRole("button", { name: "Enviar" }).click();

  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(alert(page)).toHaveText("Não deu pra guardar. Tente de novo.");
  await expect(page.getByText("Sugestão 1 de 8")).toBeVisible();
  expect(api.choices).toEqual([]);
});

test("tocar numa faixa do Descobrir abre as sugestões dela", async ({ page }) => {
  await mockDiscoverApi(page);
  await mockSuggestionsApi(page);
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
  const api = await open(page);
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
  expect(api.choices).toHaveLength(1);
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
