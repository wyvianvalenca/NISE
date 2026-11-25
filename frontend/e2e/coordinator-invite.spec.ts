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

type Mocks = { checkStatus?: number; checkError?: string; signupStatus?: number; signupError?: string };

/** Mocks the check and the sign-up. Returns the bodies sent to the sign-up. */
async function mockInviteApi(page: Page, mocks: Mocks = {}) {
  const sent: Record<string, unknown>[] = [];
  await page.route("**/api/auth/coordinator-invite/check", (route) => {
    const status = mocks.checkStatus ?? 200;
    return route.fulfill({
      status,
      json: status === 200 ? INVITE : { error: mocks.checkError ?? "invite_not_found" },
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

test("Google needs the box checked, then sends the invite in the body", async ({ page }) => {
  await mockInviteApi(page);
  const started: Record<string, unknown>[] = [];
  await page.route("**/api/auth/google/coordinator-invite", (route) => {
    started.push(route.request().postDataJSON());
    return route.fulfill({ json: { url: "/google-ficticio" } });
  });
  await page.route("**/google-ficticio", (route) =>
    route.fulfill({ body: "<h1>Google</h1>", contentType: "text/html" }),
  );
  await page.goto("/convite/coordenadora?token=abc");

  // A button, not a link: a middle click cannot skip the terms (RN-40).
  const google = page.getByRole("button", { name: /Continuar com o Google/ });
  await google.click();
  await expect(page.getByText(/Marque que leu e aceita/)).toBeVisible();
  expect(started).toHaveLength(0);

  await page.getByRole("checkbox").check();
  await google.click();
  await expect(page.getByRole("heading", { name: "Google" })).toBeVisible();
  expect(started).toEqual([{ token: "abc", acceptedTerms: true, termsVersion: expect.any(String) }]);
});

test("shows the Google error when the account is not the invite's", async ({ page }) => {
  const checked: Record<string, unknown>[] = [];
  await mockInviteApi(page);
  await page.route("**/api/auth/coordinator-invite/check", (route) => {
    checked.push(route.request().postDataJSON());
    return route.fallback();
  });
  // The way back from Google has no token in the URL; the page kept it.
  await page.addInitScript(() => sessionStorage.setItem("nise.coordinatorInvite", "abc"));
  await page.goto("/convite/coordenadora?erro=google_email_mismatch");

  await expect(page.getByText(/Essa conta Google não é a do convite/)).toBeVisible();
  await expect(page.getByText("Você foi convidada pra coordenar na NISE")).toBeVisible();
  expect(checked[0]).toEqual({ token: "abc" });
});

test("a link that does not exist does not show the form", async ({ page }) => {
  await mockInviteApi(page, { checkStatus: 404 });
  await page.goto("/convite/coordenadora?token=nada");

  await expect(page.getByRole("heading", { name: "Esse convite expirou" })).toBeVisible();
  await expect(page.getByText("Veja o e-mail mais recente")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Criar conta" })).toHaveCount(0);
});

test("a link used meanwhile stops the sign-up", async ({ page }) => {
  await mockInviteApi(page, { signupStatus: 410, signupError: "invite_used" });
  await page.goto("/convite/coordenadora?token=abc");

  await fillAndSend(page);

  await expect(page.getByRole("heading", { name: "Esse convite já foi usado" })).toBeVisible();
});

const PROBLEMS = [
  { status: 410, error: "invite_expired", title: "Esse convite expirou", recovery: false },
  { status: 410, error: "invite_used", title: "Esse convite já foi usado", recovery: true },
  { status: 409, error: "email_has_account", title: "Você já tem conta na NISE", recovery: true },
];

for (const problem of PROBLEMS) {
  test(`${problem.error} opens its screen without data or form`, async ({ page }) => {
    await mockInviteApi(page, { checkStatus: problem.status, checkError: problem.error });
    await page.goto("/convite/coordenadora?token=abc");

    await expect(page.getByRole("heading", { name: problem.title })).toBeVisible();
    await expect(page.getByText(INVITE.group_name)).toHaveCount(0);
    await expect(page.getByText(INVITE.email)).toHaveCount(0);
    await expect(page.locator("input")).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Esqueci minha senha" })).toHaveCount(
      problem.recovery ? 1 : 0,
    );
    await expect(page.getByRole("button", { name: "Pedir novo convite" })).toHaveCount(0);
  });
}

test("a replaced link says to see the latest e-mail", async ({ page }) => {
  await mockInviteApi(page, { checkStatus: 410, checkError: "invite_replaced" });
  await page.goto("/convite/coordenadora?token=abc");

  await expect(page.getByRole("heading", { name: "Esse convite expirou" })).toBeVisible();
  await expect(page.getByText("Veja o e-mail mais recente da NISE.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Entrar com outra conta" })).toHaveAttribute(
    "href",
    "/entrar",
  );
});
