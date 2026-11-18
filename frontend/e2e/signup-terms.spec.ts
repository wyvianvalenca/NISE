import { expect, test } from "@playwright/test";
import { TERMS_VERSION } from "../lib/signup-api";
import { mockTermsApi } from "./terms-api";

// #53 · A04·1 Como usamos seus dados. As rotas dos termos (#91) são simuladas em terms-api.ts.

test("menina que veio de um grupo lê que a liderança do grupo vê os dados dela (RN-01)", async ({ page }) => {
  await mockTermsApi(page);
  await page.goto("/cadastro/termos");

  await expect(page.getByText("Etapa 1 de 3")).toBeVisible();
  await expect(page.getByText("O que coletamos")).toBeVisible();
  await expect(page.getByText("Pra que usamos")).toBeVisible();
  await expect(page.getByText("A liderança do grupo Rendeiras do Código")).toBeVisible();
});

test("menina que veio sozinha lê que os grupos só veem números gerais (RN-04)", async ({ page }) => {
  await mockTermsApi(page, { origin: { kind: "self" } });
  await page.goto("/cadastro/termos");

  await expect(page.getByText("Os grupos de incentivo cadastrados no NISE só veem números gerais")).toBeVisible();
  await expect(page.getByText("A liderança do grupo")).toHaveCount(0);
});

test("o link dos termos completos abre em outra aba", async ({ page }) => {
  await mockTermsApi(page);
  await page.goto("/cadastro/termos");

  const link = page.getByRole("link", { name: /Ler os termos completos/ });
  await expect(link).toHaveAttribute("href", "/termos");
  await expect(link).toHaveAttribute("target", "_blank");
});

test("só continua depois de marcar Li e concordo", async ({ page }) => {
  const acceptedVersions = await mockTermsApi(page);
  await page.goto("/cadastro/termos");

  const button = page.getByRole("button", { name: "Entendi, continuar" });
  await expect(button).toBeDisabled();

  await page.getByRole("checkbox", { name: /Li e concordo/ }).check();
  await expect(button).toBeEnabled();

  await button.click();
  await expect(page).toHaveURL(/\/cadastro\/oportunidades$/);
  // O aceite vai com a versão que ela leu (RF-F7.05).
  expect(acceptedVersions).toEqual([TERMS_VERSION]);
});

test("voltar da Etapa 2 mostra os termos prontos para continuar de novo", async ({ page }) => {
  // O Next guarda a página escondida ao navegar (Activity) e a mostra de volta com o mesmo estado.
  // O "Enviando…" do aceite não pode voltar junto.
  const acceptedVersions = await mockTermsApi(page);
  await page.goto("/cadastro/termos");
  await page.getByRole("checkbox", { name: /Li e concordo/ }).check();
  await page.getByRole("button", { name: "Entendi, continuar" }).click();
  await expect(page).toHaveURL(/\/cadastro\/oportunidades$/);

  await page.getByRole("link", { name: "Etapa anterior" }).click();

  await expect(page).toHaveURL(/\/cadastro\/termos$/);
  const button = page.getByRole("button", { name: "Entendi, continuar" });
  await expect(button).toBeEnabled();
  await button.click();
  await expect(page).toHaveURL(/\/cadastro\/oportunidades$/);
  // Aceitar de novo é inofensivo: o servidor não cria outro registro.
  expect(acceptedVersions).toEqual([TERMS_VERSION, TERMS_VERSION]);
});

test("a página dos termos mostra a versão atual", async ({ page }) => {
  await page.goto("/termos");

  await expect(page.getByRole("heading", { name: "Termos de uso e Política de privacidade" })).toBeVisible();
  await expect(page.getByText(`Versão ${TERMS_VERSION}`)).toBeVisible();
});

test("enquanto o resumo não chega, só aparece o carregamento", async ({ page }) => {
  await mockTermsApi(page);
  // Atrasa o JavaScript, como num celular lento.
  await page.route("**/_next/static/**/*.js", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    await route.continue();
  });
  await page.goto("/cadastro/termos", { waitUntil: "commit" });

  // O HTML do servidor já vem só com o carregamento: nem o texto dos termos, nem a caixa.
  await expect(page.getByText("Carregando…")).toBeVisible();
  await expect(page.getByText("O que coletamos")).toHaveCount(0);
  await expect(page.getByRole("checkbox", { name: /Li e concordo/ })).toHaveCount(0);

  await expect(page.getByText("A liderança do grupo")).toBeVisible({ timeout: 15000 });
  const box = page.getByRole("checkbox", { name: /Li e concordo/ });
  await box.click();
  await expect(box).toBeChecked();
  await expect(page.getByRole("button", { name: "Entendi, continuar" })).toBeEnabled();
});

test("marcar Li e concordo logo que a página abre não se perde", async ({ page }) => {
  // Sem atrasar o JavaScript: o clique vem logo depois do goto, enquanto a página
  // ainda hidrata e o resumo carrega. Um só clique pode escapar dessa janela, então repetimos.
  await mockTermsApi(page);
  for (let attempt = 1; attempt <= 10; attempt++) {
    await page.goto("/cadastro/termos");

    const box = page.getByRole("checkbox", { name: /Li e concordo/ });
    await box.click();

    await expect(box, `tentativa ${attempt}`).toBeChecked();
    await expect(page.getByRole("button", { name: "Entendi, continuar" })).toBeEnabled();
  }
});

// --- Erros ------------------------------------------------------------------

/** Marca "Li e concordo" e toca em "Entendi, continuar". */
async function accept(page: import("@playwright/test").Page) {
  await page.getByRole("checkbox", { name: /Li e concordo/ }).check();
  await page.getByRole("button", { name: "Entendi, continuar" }).click();
}

test("se os termos mudaram, mostra o resumo de novo e pede o aceite de novo", async ({ page }) => {
  const acceptedVersions = await mockTermsApi(page, { acceptance: 409 });
  await page.goto("/cadastro/termos");

  await accept(page);

  await expect(page.getByText(/^Os termos mudaram/)).toBeVisible();
  await expect(page).toHaveURL(/\/cadastro\/termos$/);
  await expect(page.getByText("A liderança do grupo Rendeiras do Código")).toBeVisible();
  await expect(page.getByRole("checkbox", { name: /Li e concordo/ })).not.toBeChecked();
  await expect(page.getByRole("button", { name: "Entendi, continuar" })).toBeDisabled();
  expect(acceptedVersions).toEqual([TERMS_VERSION]);
});

test("se o resumo não carrega, Tentar de novo busca outra vez", async ({ page }) => {
  await mockTermsApi(page, { summary: 500 });
  await page.goto("/cadastro/termos");

  await expect(page.getByText("Não deu pra carregar quem vê seus dados.")).toBeVisible();
  await expect(page.getByText("O que coletamos")).toHaveCount(0);
  await expect(page.getByRole("checkbox", { name: /Li e concordo/ })).toHaveCount(0);

  await mockTermsApi(page);
  await page.getByRole("button", { name: "Tentar de novo" }).click();

  await expect(page.getByText("A liderança do grupo Rendeiras do Código")).toBeVisible();
  await expect(page.getByRole("checkbox", { name: /Li e concordo/ })).toBeEnabled();
});

test("se o aceite falha, avisa e deixa tentar de novo", async ({ page }) => {
  await mockTermsApi(page, { acceptance: 500 });
  await page.goto("/cadastro/termos");

  await accept(page);

  await expect(page.getByText("Não deu pra salvar. Tente de novo.")).toBeVisible();
  await expect(page).toHaveURL(/\/cadastro\/termos$/);
  await expect(page.getByRole("button", { name: "Entendi, continuar" })).toBeEnabled();
});

test("sem sessão, volta para a página inicial sem mostrar os termos", async ({ page }) => {
  // Anota se o texto dos termos chegou a aparecer, desde o HTML do servidor até o redirecionamento.
  await page.addInitScript(() => {
    new MutationObserver(() => {
      if (location.pathname === "/cadastro/termos" && document.body?.innerText.includes("O que coletamos")) {
        sessionStorage.setItem("viu-os-termos", "sim");
      }
    }).observe(document, { childList: true, subtree: true, characterData: true });
  });
  // A resposta demora um pouco, como numa rede lenta.
  await page.route("**/api/terms/summary", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 800));
    await route.fulfill({ status: 401, json: { detail: "Não autenticada" } });
  });
  await page.goto("/cadastro/termos");

  await expect(page.getByText("Carregando…")).toBeVisible();
  await expect(page).toHaveURL(/localhost:3000\/$/);
  expect(await page.evaluate(() => sessionStorage.getItem("viu-os-termos"))).toBeNull();
});

test("com o cadastro do Google incompleto, volta para completar", async ({ page }) => {
  await mockTermsApi(page, { summary: "incomplete_signup" });
  // A A02b busca o cadastro pendente; aqui basta ela abrir.
  await page.route("**/api/auth/signup/pending", (route) => route.fulfill({ status: 404, json: {} }));
  await page.goto("/cadastro/termos");

  await expect(page).toHaveURL(/\/cadastro\/google$/);
});

test("se a sessão acaba antes do aceite, volta para a página inicial", async ({ page }) => {
  await mockTermsApi(page, { acceptance: 401 });
  await page.goto("/cadastro/termos");

  await accept(page);

  await expect(page).toHaveURL(/localhost:3000\/$/);
});
