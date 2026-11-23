import { expect, test, type Page } from "@playwright/test";

/**
 * A15 "Entre na NISE" (#330).
 *
 * The login route is mocked with the contract of the real back-end: 200 with
 * the account and `nextPath`, or 401 for any wrong pair. Fictional data, as
 * CONTRIBUTING requires.
 */

const CONTA = {
  id: 1,
  email: "alana@exemplo.com",
  name: "Alana Ficticia",
  role: "girl",
  nextPath: "/por-que-file",
};

/** Mocks POST /api/auth/login and returns the bodies it received. */
async function mockLogin(page: Page, status = 200) {
  const enviados: unknown[] = [];

  await page.route("**/api/auth/login", (route) => {
    enviados.push(route.request().postDataJSON());
    return status === 200
      ? route.fulfill({ json: CONTA })
      : route.fulfill({
          status,
          json: { detail: "E-mail ou senha incorretos" },
        });
  });

  return enviados;
}

async function fillForm(page: Page, email: string, senha: string) {
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha").fill(senha);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
}

test("A15: entra com e-mail e senha e vai para a tela que o servidor disse", async ({
  page,
}) => {
  const enviados = await mockLogin(page);
  await page.goto("/entrar");

  await expect(
    page.getByRole("heading", { name: "Entre na NISE" }),
  ).toBeVisible();
  await fillForm(page, " alana@exemplo.com ", "senha-ficticia");

  await expect(page).toHaveURL(/\/por-que-file$/);
  expect(enviados).toEqual([
    { email: "alana@exemplo.com", password: "senha-ficticia" },
  ]);
});

test("A15: e-mail ou senha errados mostram o aviso e liberam o botão", async ({
  page,
}) => {
  await mockLogin(page, 401);
  await page.goto("/entrar");

  await fillForm(page, "alana@exemplo.com", "senha-errada");

  await expect(page.getByText("E-mail ou senha incorretos.")).toBeVisible();
  await expect(page).toHaveURL(/\/entrar$/);
  await expect(
    page.getByRole("button", { name: "Entrar", exact: true }),
  ).toBeEnabled();
});

test("A15: campos vazios ou e-mail sem domínio nem chegam ao servidor", async ({
  page,
}) => {
  const enviados = await mockLogin(page);
  await page.goto("/entrar");

  await fillForm(page, "alana@gmail", "");

  await expect(
    page.getByText("Inclua o domínio, como nome@exemplo.com"),
  ).toBeVisible();
  await expect(page.getByText("Preencha sua senha.")).toBeVisible();
  expect(enviados).toEqual([]);
});

test("A15: a volta do Google com erro mostra o aviso", async ({ page }) => {
  await page.goto("/entrar?erro=google");

  await expect(
    page.getByText("Não deu pra entrar com o Google. Tente de novo."),
  ).toBeVisible();
});

test("A15: os links levam ao Google, ao cadastro e à recuperação", async ({
  page,
}) => {
  await page.goto("/entrar");

  await expect(
    page.getByRole("link", { name: "Entrar com o Google" }),
  ).toHaveAttribute("href", "/api/auth/google/login");
  await expect(page.getByRole("link", { name: "Criar conta" })).toHaveAttribute(
    "href",
    "/criar-conta",
  );
  await expect(
    page.getByRole("link", { name: "Esqueci minha senha" }),
  ).toHaveAttribute("href", "/entrar/recuperar");
});
