import { expect, test, type Page } from "@playwright/test";

/**
 * A16 "Recuperar acesso" and A16b "Crie uma nova senha" (#331).
 *
 * The routes are mocked with the contract of the real back-end: the request
 * always answers 204, the link check answers the account's email or 422
 * invalid_token, and the new password answers `nextPath` or a 422 code.
 * Fictional data, as CONTRIBUTING requires.
 */

const TOKEN = "token-ficticio-do-link";

async function mockForgot(page: Page, status = 204) {
  const enviados: unknown[] = [];

  await page.route("**/api/auth/password/forgot", (route) => {
    enviados.push(route.request().postDataJSON());
    return route.fulfill({ status, body: "" });
  });

  return enviados;
}

async function mockLink(
  page: Page,
  link: { status: number; json: unknown },
  reset: { status: number; json: unknown } = {
    status: 200,
    json: { nextPath: "/coordenacao/acoes" },
  },
) {
  const enviados: unknown[] = [];

  await page.route("**/api/auth/password/reset/check", (route) =>
    route.fulfill(link),
  );
  await page.route("**/api/auth/password/reset", (route) => {
    enviados.push(route.request().postDataJSON());
    return route.fulfill(reset);
  });

  return enviados;
}

const LINK_VALIDO = { status: 200, json: { email: "katia@exemplo.com" } };
const LINK_VENCIDO = { status: 422, json: { error: "invalid_token" } };

// A16

test("A16: pede o link e mostra a confirmação sem dizer se a conta existe", async ({
  page,
}) => {
  const enviados = await mockForgot(page);
  await page.goto("/entrar/recuperar");

  await expect(
    page.getByRole("heading", { name: "Recupere seu acesso" }),
  ).toBeVisible();
  await page.getByLabel("E-mail").fill("katia@exemplo.com");
  await page.getByRole("button", { name: "Enviar link" }).click();

  await expect(
    page.getByRole("heading", { name: "Confira seu e-mail" }),
  ).toBeVisible();
  await expect(page.getByText(/Se katia@exemplo.com tem conta/)).toBeVisible();
  expect(enviados).toEqual([{ email: "katia@exemplo.com" }]);

  await page.getByRole("link", { name: "Voltar para o login" }).click();
  await expect(page).toHaveURL(/\/entrar$/);
});

test("A16: e-mail sem domínio não é enviado", async ({ page }) => {
  const enviados = await mockForgot(page);
  await page.goto("/entrar/recuperar");

  await page.getByLabel("E-mail").fill("katia@gmail");
  await page.getByRole("button", { name: "Enviar link" }).click();

  await expect(
    page.getByText("Inclua o domínio, como nome@exemplo.com"),
  ).toBeVisible();
  expect(enviados).toEqual([]);
});

test("A16: falha de conexão mostra o aviso e deixa tentar de novo", async ({
  page,
}) => {
  await mockForgot(page, 500);
  await page.goto("/entrar/recuperar");

  await page.getByLabel("E-mail").fill("katia@exemplo.com");
  await page.getByRole("button", { name: "Enviar link" }).click();

  await expect(
    page.getByText("Não deu pra mandar o link agora. Tente de novo."),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Enviar link" })).toBeEnabled();
});

test("A16: Voltar leva à A15", async ({ page }) => {
  await page.goto("/entrar/recuperar");

  await page.getByRole("link", { name: "Voltar" }).click();
  await expect(page).toHaveURL(/\/entrar$/);
});

// A16b

test("A16b: mostra a conta do link, salva a senha e entra", async ({ page }) => {
  const enviados = await mockLink(page, LINK_VALIDO);
  await page.goto(`/entrar/nova-senha?token=${TOKEN}`);

  await expect(
    page.getByRole("heading", { name: "Crie uma nova senha" }),
  ).toBeVisible();
  await expect(page.getByText(/Pra conta katia@exemplo.com/)).toBeVisible();

  await page.getByLabel("Nova senha", { exact: true }).fill("senha-nova-123");
  await page.getByLabel("Repita a nova senha").fill("senha-nova-123");
  await page.getByRole("button", { name: "Salvar e entrar" }).click();

  await expect(page).toHaveURL(/\/coordenacao\/acoes$/);
  expect(enviados).toEqual([{ token: TOKEN, password: "senha-nova-123" }]);
});

test("A16b: senha curta ou diferente não é enviada", async ({ page }) => {
  const enviados = await mockLink(page, LINK_VALIDO);
  await page.goto(`/entrar/nova-senha?token=${TOKEN}`);

  await page.getByLabel("Nova senha", { exact: true }).fill("curta");
  await page.getByRole("button", { name: "Salvar e entrar" }).click();
  await expect(
    page.getByText("A senha precisa de pelo menos 8 caracteres."),
  ).toBeVisible();

  await page.getByLabel("Nova senha", { exact: true }).fill("senha-nova-123");
  await page.getByLabel("Repita a nova senha").fill("senha-nova-456");
  await page.getByRole("button", { name: "Salvar e entrar" }).click();
  await expect(page.getByText("As senhas não são iguais.")).toBeVisible();

  expect(enviados).toEqual([]);
});

test("A16b: link vencido ou usado leva a pedir um novo", async ({ page }) => {
  await mockLink(page, LINK_VENCIDO);
  await page.goto(`/entrar/nova-senha?token=${TOKEN}`);

  await expect(
    page.getByRole("heading", { name: "Esse link não vale mais" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Pedir um link novo" }).click();
  await expect(page).toHaveURL(/\/entrar\/recuperar$/);
});

test("A16b: sem token na URL, o link não vale", async ({ page }) => {
  await page.goto("/entrar/nova-senha");

  await expect(
    page.getByRole("heading", { name: "Esse link não vale mais" }),
  ).toBeVisible();
});

test("A16b: o link vence enquanto ela digita", async ({ page }) => {
  await mockLink(page, LINK_VALIDO, LINK_VENCIDO);
  await page.goto(`/entrar/nova-senha?token=${TOKEN}`);

  await page.getByLabel("Nova senha", { exact: true }).fill("senha-nova-123");
  await page.getByLabel("Repita a nova senha").fill("senha-nova-123");
  await page.getByRole("button", { name: "Salvar e entrar" }).click();

  await expect(
    page.getByRole("heading", { name: "Esse link não vale mais" }),
  ).toBeVisible();
});
