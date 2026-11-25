import { expect, test, type Page } from "@playwright/test";

/**
 * CV02 "Crie sua conta" from the coordinator invite (#455), on the computer.
 *
 * The routes are mocked with the contract of the real back-end, so these tests
 * run without it. The walkthrough against the real back-end is recorded in the
 * PR. Fictional data, as CONTRIBUTING requires.
 */

test.use({ viewport: { width: 1366, height: 768 } });

const INVITE = {
  name: "Ana Exemplo",
  email: "ana.exemplo@example.com",
  group_name: "Rendeiras do Código",
  expires_at: "2026-12-12T15:00:00Z",
};

type Mocks = { checkStatus?: number; signupStatus?: number; signupError?: string };

/** Mocks the check and the sign-up. Returns the bodies sent to the sign-up. */
async function mockInviteApi(page: Page, mocks: Mocks = {}) {
  const sent: Record<string, unknown>[] = [];
  await page.route("**/api/auth/coordinator-invite/check", (route) => {
    const status = mocks.checkStatus ?? 200;
    return route.fulfill({
      status,
      json: status === 200 ? INVITE : { error: "invite_not_found" },
    });
  });
  await page.route("**/api/auth/signup/coordinator", (route) => {
    sent.push(route.request().postDataJSON());
    if (mocks.signupStatus && mocks.signupStatus !== 201) {
      return route.fulfill({
        status: mocks.signupStatus,
        json: { error: mocks.signupError },
      });
    }
    return route.fulfill({
      status: 201,
      json: {
        id: 1,
        email: INVITE.email,
        name: "Ana Souza",
        role: "coordinator",
        nextPath: "/coordenacao/acoes",
      },
    });
  });
  // The destination is another screen, not under test here.
  await page.route("**/coordenacao/acoes**", (route) =>
    route.fulfill({ body: "<h1>Ações</h1>", contentType: "text/html" }),
  );
  return sent;
}

async function fillAndSend(page: Page) {
  await page.getByLabel("Senha", { exact: true }).fill("senhaforte123");
  await page.getByLabel("Repita a senha").fill("senhaforte123");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Criar conta" }).click();
}

test("shows the group, the locked e-mail and the name from the invite", async ({ page }) => {
  await mockInviteApi(page);
  await page.goto("/convite/coordenadora?token=abc");

  await expect(page.getByText("Você foi convidada pra coordenar na NISE")).toBeVisible();
  await expect(page.getByText("Convite da equipe NISE")).toBeVisible();
  await expect(page.getByText("Vale até 12 de dezembro")).toBeVisible();
  await expect(page.getByText("Você vai entrar como coordenadora das")).toBeVisible();
  await expect(page.getByLabel("E-mail")).toHaveValue(INVITE.email);
  await expect(page.getByLabel("E-mail")).toHaveAttribute("readonly", "");
  await expect(page.getByText("É o e-mail do convite. Não dá pra trocar.")).toBeVisible();
  await expect(page.getByLabel("Seu nome")).toHaveValue(INVITE.name);
  await expect(page.getByText(`Use a conta Google de ${INVITE.email}`)).toBeVisible();
});

test("creates the account with a password and goes to Ações", async ({ page }) => {
  const sent = await mockInviteApi(page);
  await page.goto("/convite/coordenadora?token=abc");

  await page.getByLabel("Seu nome").fill("Ana Souza");
  await fillAndSend(page);

  await expect(page).toHaveURL(/\/coordenacao\/acoes/);
  expect(sent).toHaveLength(1);
  expect(sent[0]).toMatchObject({
    token: "abc",
    name: "Ana Souza",
    password: "senhaforte123",
    acceptedTerms: true,
  });
  expect(sent[0]).not.toHaveProperty("email");
});

test("does not send with a short password, different passwords or the box unchecked", async ({
  page,
}) => {
  const sent = await mockInviteApi(page);
  await page.goto("/convite/coordenadora?token=abc");

  await page.getByLabel("Senha", { exact: true }).fill("curta");
  await page.getByLabel("Repita a senha").fill("outra");
  await page.getByRole("button", { name: "Criar conta" }).click();

  await expect(page.getByText("A senha precisa de pelo menos 8 caracteres.")).toBeVisible();
  await expect(page.getByText("As senhas não são iguais.")).toBeVisible();
  await expect(page.getByText(/Marque que leu e aceita/)).toBeVisible();
  expect(sent).toHaveLength(0);
});

test("a name left empty is refused", async ({ page }) => {
  const sent = await mockInviteApi(page);
  await page.goto("/convite/coordenadora?token=abc");

  await page.getByLabel("Seu nome").fill("");
  await fillAndSend(page);

  await expect(page.getByText("Preencha seu nome completo.")).toBeVisible();
  expect(sent).toHaveLength(0);
});

test("Google needs the box checked and carries the invite", async ({ page }) => {
  await mockInviteApi(page);
  await page.goto("/convite/coordenadora?token=abc");

  const google = page.getByRole("link", { name: /Continuar com o Google/ });
  await expect(google).toHaveAttribute("href", /coordinator_invite=abc/);
  await expect(google).toHaveAttribute("href", /terms_version=/);

  await google.click();
  await expect(page.getByText(/Marque que leu e aceita/)).toBeVisible();
});

test("shows the Google error when the account is not the invite's", async ({ page }) => {
  await mockInviteApi(page);
  await page.goto("/convite/coordenadora?token=abc&erro=google_email_mismatch");

  await expect(page.getByText(/Essa conta Google não é a do convite/)).toBeVisible();
});

test("a link that does not exist does not show the form", async ({ page }) => {
  await mockInviteApi(page, { checkStatus: 404 });
  await page.goto("/convite/coordenadora?token=nada");

  await expect(page.getByText("Esse link não vale")).toBeVisible();
  await expect(page.getByRole("button", { name: "Criar conta" })).toHaveCount(0);
});

test("a link used meanwhile stops the sign-up", async ({ page }) => {
  await mockInviteApi(page, { signupStatus: 410, signupError: "invite_used" });
  await page.goto("/convite/coordenadora?token=abc");

  await fillAndSend(page);

  await expect(page.getByText("Esse link não vale")).toBeVisible();
});
