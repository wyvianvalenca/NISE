import { expect, test, type Page } from "@playwright/test";
import { mockActionPageApi, FULL_ACTION_ID } from "./action-page-api";
import { mockProfileCourseApi } from "./perfil-api";
import { mockTermsApi } from "./terms-api";

// #394 · "Excluir minha conta e meus dados" na A10 (RF-F7.09, D-113): o modal de
// confirmação, o DELETE /api/profile e o aviso na A01. As rotas são simuladas;
// o DELETE é daqui, e os outros métodos de /api/profile seguem para os mocks
// do perfil (route.fallback). Dados fictícios.

const PROFILE = "/perfil";
const OPEN = { name: "Excluir minha conta e meus dados" };

type Answer = 204 | 401 | 500 | "terms_not_accepted";

/**
 * Responde o DELETE /api/profile. Depois de excluir, o perfil passa a dar 401,
 * como o back com o cookie antigo. `hold` segura a resposta até `release()`,
 * para ver o estado "Excluindo…".
 */
async function mockDeleteApi(page: Page, answer: Answer = 204, hold = false) {
  const calls = { count: 0, release: () => {} };
  const gate = new Promise<void>((resolve) => {
    calls.release = resolve;
  });
  let deleted = false;

  await page.route("**/api/profile", async (route) => {
    if (route.request().method() !== "DELETE") return route.fallback();
    calls.count += 1;
    if (hold) await gate;
    if (answer === 204) {
      deleted = true;
      return route.fulfill({ status: 204, body: "" });
    }
    if (answer === "terms_not_accepted") {
      return route.fulfill({ status: 403, json: { error: "terms_not_accepted" } });
    }
    if (answer === 401) {
      deleted = true;
      return route.fulfill({ status: 401, json: { detail: "Não autenticada" } });
    }
    return route.fulfill({ status: 500, body: "" });
  });
  await page.route("**/api/profile/details", (route) =>
    deleted
      ? route.fulfill({ status: 401, json: { detail: "Não autenticada" } })
      : route.fallback(),
  );

  return calls;
}

function dialog(page: Page) {
  return page.getByRole("dialog", { name: "Excluir sua conta?" });
}

async function openModal(page: Page) {
  await page.goto(PROFILE);
  await page.getByRole("button", OPEN).click();
  await expect(dialog(page)).toBeVisible();
}

test("o botão abre o modal com o texto e os dois botões, sem pedir senha", async ({ page }) => {
  await mockProfileCourseApi(page);
  const calls = await mockDeleteApi(page);
  await openModal(page);

  const modal = dialog(page);
  await expect(modal.getByRole("heading", { name: "Excluir sua conta?" })).toBeVisible();
  await expect(
    modal.getByText("Seu filé, suas respostas e seus dados saem da NISE. Isso não dá pra desfazer."),
  ).toBeVisible();
  await expect(modal.getByRole("button", { name: "Cancelar" })).toBeVisible();
  await expect(modal.getByRole("button", { name: "Excluir conta", exact: true })).toBeVisible();
  await expect(modal.locator("input")).toHaveCount(0);
  expect(calls.count).toBe(0);
});

test("Cancelar fecha, devolve o foco ao botão e não faz requisição", async ({ page }) => {
  await mockProfileCourseApi(page);
  const calls = await mockDeleteApi(page);
  await openModal(page);

  // O foco vai para dentro da janela ao abrir.
  await expect(dialog(page).locator(":focus")).toHaveCount(1);

  await dialog(page).getByRole("button", { name: "Cancelar" }).click();

  await expect(dialog(page)).toBeHidden();
  await expect(page.getByRole("button", OPEN)).toBeFocused();
  await expect(page).toHaveURL(/\/perfil$/);
  expect(calls.count).toBe(0);
});

test("Esc fecha e não faz requisição", async ({ page }) => {
  await mockProfileCourseApi(page);
  const calls = await mockDeleteApi(page);
  await openModal(page);

  await page.keyboard.press("Escape");

  await expect(dialog(page)).toBeHidden();
  await expect(page.getByRole("button", OPEN)).toBeFocused();
  expect(calls.count).toBe(0);
});

test("o clique no véu fecha e não faz requisição", async ({ page }) => {
  await mockProfileCourseApi(page);
  const calls = await mockDeleteApi(page);
  await openModal(page);

  await page.mouse.click(4, 4);

  await expect(dialog(page)).toBeHidden();
  expect(calls.count).toBe(0);
});

test("Excluir conta chama uma vez, leva à A01 com o aviso, que some sozinho", async ({ page }) => {
  await mockProfileCourseApi(page);
  const calls = await mockDeleteApi(page, 204, true);
  await page.goto("/termos");
  await openModal(page);

  const confirm = dialog(page).getByRole("button", { name: "Excluir conta", exact: true });
  await confirm.dblclick();

  // Enquanto exclui: o botão espera, e nada fecha a janela.
  const waiting = dialog(page).getByRole("button", { name: "Excluindo…" });
  await expect(waiting).toBeDisabled();
  await expect(dialog(page).getByRole("button", { name: "Cancelar" })).toBeDisabled();
  await page.keyboard.press("Escape");
  await page.mouse.click(4, 4);
  await expect(dialog(page)).toBeVisible();

  calls.release();

  await expect(page).toHaveURL(/\/\?conta=excluida$/);
  await expect(page.getByRole("status")).toHaveText("Sua conta foi excluída");
  expect(calls.count).toBe(1);

  // Some sozinho e tira o parâmetro da URL.
  await expect(page.getByRole("status")).toHaveCount(0, { timeout: 10_000 });
  await expect(page).toHaveURL(/\/$/);

  // Recarregar não mostra o aviso de novo.
  await page.reload();
  await expect(page.getByRole("status")).toHaveCount(0);
});

test("a A01 sem o parâmetro não mostra o aviso", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByText("Sua conta foi excluída")).toHaveCount(0);
});

test('"voltar" não mostra o perfil: a sessão acabou', async ({ page }) => {
  await mockProfileCourseApi(page);
  await mockDeleteApi(page);
  await page.goto("/termos");
  await openModal(page);

  await dialog(page).getByRole("button", { name: "Excluir conta", exact: true }).click();
  await expect(page).toHaveURL(/\/\?conta=excluida$/);

  // O perfil saiu do histórico (router.replace).
  await page.goBack();
  await expect(page).not.toHaveURL(/\/perfil$/);
  await expect(page.getByRole("heading", { name: "Perfil", level: 1 })).toHaveCount(0);

  // E se ela abrir o perfil de novo, a rota dá 401 e ela vai para o início.
  await page.goto(PROFILE);
  await expect(page).toHaveURL(/\/$/);
});

test("se excluir falhar, o modal fica aberto com o erro e a conta continua", async ({ page }) => {
  await mockProfileCourseApi(page);
  const calls = await mockDeleteApi(page, 500);
  await openModal(page);

  await dialog(page).getByRole("button", { name: "Excluir conta", exact: true }).click();

  await expect(dialog(page).getByRole("alert")).toHaveText(
    "Não deu pra excluir agora. Tente de novo.",
  );
  await expect(dialog(page)).toBeVisible();
  await expect(page).toHaveURL(/\/perfil$/);
  await expect(
    dialog(page).getByRole("button", { name: "Excluir conta", exact: true }),
  ).toBeEnabled();
  expect(calls.count).toBe(1);

  // Fechar tira o erro: da próxima vez o modal abre limpo.
  await dialog(page).getByRole("button", { name: "Cancelar" }).click();
  await page.getByRole("button", OPEN).click();
  await expect(dialog(page).getByRole("alert")).toHaveCount(0);
});

test("sem rede, o modal fica aberto com o erro", async ({ page }) => {
  await mockProfileCourseApi(page);
  await page.route("**/api/profile", (route) =>
    route.request().method() === "DELETE" ? route.abort() : route.fallback(),
  );
  await openModal(page);

  await dialog(page).getByRole("button", { name: "Excluir conta", exact: true }).click();

  await expect(dialog(page).getByRole("alert")).toBeVisible();
  await expect(dialog(page)).toBeVisible();
});

// Sem sessão válida a conta NÃO foi excluída: a tela nunca pode dizer que foi.
test("401 na exclusão (sessão vencida) vai para o início e não diz que a conta foi excluída", async ({
  page,
}) => {
  await mockProfileCourseApi(page);
  await mockDeleteApi(page, 401);
  await openModal(page);

  await dialog(page).getByRole("button", { name: "Excluir conta", exact: true }).click();

  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByText("Sua conta foi excluída")).toHaveCount(0);
});

test("sem o aceite dos termos atuais, leva ao aceite", async ({ page }) => {
  await mockProfileCourseApi(page);
  await mockTermsApi(page);
  await mockDeleteApi(page, "terms_not_accepted");
  await openModal(page);

  await dialog(page).getByRole("button", { name: "Excluir conta", exact: true }).click();

  await expect(page).toHaveURL(/\/cadastro\/termos$/);
});

test("por teclado: Tab fica dentro do modal e Enter confirma", async ({ page }) => {
  await mockProfileCourseApi(page);
  const calls = await mockDeleteApi(page);
  await openModal(page);

  const cancel = dialog(page).getByRole("button", { name: "Cancelar" });
  const confirm = dialog(page).getByRole("button", { name: "Excluir conta", exact: true });
  // Ao abrir, o foco já está dentro; Tab anda pelos dois botões e volta ao primeiro.
  await page.keyboard.press("Tab");
  await expect(confirm).toBeFocused();
  await expect(confirm).toHaveCSS("outline-style", "solid");
  // Depois do último botão o foco não cai na página atrás do modal.
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", OPEN)).not.toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(confirm).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(cancel).toBeFocused();
  await expect(cancel).toHaveCSS("outline-style", "solid");

  await confirm.focus();
  await page.keyboard.press("Enter");

  await expect(page).toHaveURL(/\/\?conta=excluida$/);
  expect(calls.count).toBe(1);
});

test("os dois botões têm a mesma largura e Excluir conta usa o vermelho do erro", async ({
  page,
}) => {
  await mockProfileCourseApi(page);
  await mockDeleteApi(page);
  await openModal(page);

  const cancel = dialog(page).getByRole("button", { name: "Cancelar" });
  const confirm = dialog(page).getByRole("button", { name: "Excluir conta", exact: true });
  const [cancelBox, confirmBox] = [await cancel.boundingBox(), await confirm.boundingBox()];
  expect(Math.abs(cancelBox!.width - confirmBox!.width)).toBeLessThan(1);

  const errorColor = await page.evaluate(() => {
    const probe = document.createElement("div");
    probe.style.background = "var(--nise-error)";
    document.body.append(probe);
    const color = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return color;
  });
  await expect(confirm).toHaveCSS("background-color", errorColor);
});

for (const width of [360, 1366]) {
  test(`modal e aviso cabem em ${width} px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await mockProfileCourseApi(page);
    await mockDeleteApi(page);
    await openModal(page);

    const box = await dialog(page).boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(width);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);

    await dialog(page).getByRole("button", { name: "Excluir conta", exact: true }).click();
    await expect(page.getByRole("status")).toHaveText("Sua conta foi excluída");
    const toast = await page.getByRole("status").boundingBox();
    expect(toast!.x).toBeGreaterThanOrEqual(0);
    expect(toast!.x + toast!.width).toBeLessThanOrEqual(width);
  });
}

// A linha anonimizada na lista de inscritas da coordenadora (C4): o nome é o
// rótulo e o e-mail reservado não aparece.
test("a coordenadora vê o registro anonimizado com o e-mail como traço", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 900 });
  await mockActionPageApi(page);
  await page.route(/\/api\/actions\/\d+\/registrations(\?.*)?$/, (route) =>
    route.request().method() === "GET"
      ? route.fulfill({
          json: {
            items: [
              {
                id: 1,
                name: "Registro anonimizado",
                email: "registro-9@anonimizado.invalid",
                whatsapp: null,
                study_stage: null,
                school_year: null,
              },
            ],
            total: 1,
            columns: [],
          },
        })
      : route.fallback(),
  );
  await page.goto(`/coordenacao/acoes/${FULL_ACTION_ID}`);

  const row = page.getByRole("table").locator("tbody tr");
  await expect(row).toHaveCount(1);
  await expect(row.getByRole("cell").nth(0)).toHaveText("Registro anonimizado");
  await expect(row.getByRole("cell").nth(1)).toHaveText("—");
  await expect(page.getByText("anonimizado.invalid")).toHaveCount(0);
  expect(await page.content()).not.toContain("anonimizado.invalid");
});
