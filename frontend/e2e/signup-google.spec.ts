import { expect, test, type Page } from "@playwright/test";

/**
 * A02b/A02c of the Google sign-up (#52).
 *
 * The back-end does not exist yet (#68 and #50), so the routes are mocked.
 * Fictional data, as CONTRIBUTING requires: no real girl.
 */

const CONTA = { name: "Alana Oliveira", email: "alana@exemplo.com" };
const CIDADES = [
  { id: "2704302", name: "Maceió, AL" },
  { id: "2611606", name: "Recife, PE" },
];

/** Today in Maceió, to build birth dates that do not depend on the clock. */
function todayInMaceio(): { ano: number; mes: number; dia: number } {
  const [ano, mes, dia] = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Maceio",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(new Date())
    .split("-")
    .map(Number);

  return { ano, mes, dia };
}

function iso(ano: number, mes: number, dia: number): string {
  return `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

/** Birth date of someone turning exactly 13 today. */
function turnsThirteenToday(): string {
  const { ano, mes, dia } = todayInMaceio();
  return iso(ano - 13, mes, dia);
}

/** Birth date of someone turning 13 tomorrow (12 years and 364 days). */
function turnsThirteenTomorrow(): string {
  const { ano, mes, dia } = todayInMaceio();
  const amanha = new Date(Date.UTC(ano, mes - 1, dia + 1));
  return iso(
    amanha.getUTCFullYear() - 13,
    amanha.getUTCMonth() + 1,
    amanha.getUTCDate(),
  );
}

type Mocks = {
  /** `null` simulates having no incomplete Google session. */
  pendente?: typeof CONTA | null;
  completar?: { status: number; corpo?: unknown };
};

async function mockApi(page: Page, mocks: Mocks = {}) {
  const pendente = mocks.pendente === undefined ? CONTA : mocks.pendente;

  await page.route("**/api/auth/signup/pending", (route) =>
    pendente
      ? route.fulfill({ json: pendente })
      : route.fulfill({ status: 404, json: {} }),
  );

  await page.route("**/api/cities**", (route) => route.fulfill({ json: CIDADES }));

  await page.route("**/api/auth/signup/complete", (route) =>
    route.fulfill({
      status: mocks.completar?.status ?? 200,
      json: mocks.completar?.corpo ?? {},
    }),
  );

  await page.route("**/api/auth/signup/discard", (route) =>
    route.fulfill({ status: 204, body: "" }),
  );

  await page.route("**/cadastro/termos", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<html lang='pt-BR'><body><h1>Termos</h1></body></html>",
    }),
  );
}

async function fill(page: Page, dataNascimento: string, cidade: string) {
  await page.getByLabel("Data de nascimento").fill(dataNascimento);
  await page.getByLabel("Cidade").fill(cidade);
  await expect(page.locator("#cidades-ibge option").first()).toBeAttached();
}

test("mostra o nome e o e-mail que vieram do Google", async ({ page }) => {
  await mockApi(page);
  await page.goto("/cadastro/google");

  await expect(
    page.getByRole("heading", { name: "Só mais um passo" }),
  ).toBeVisible();
  await expect(page.getByText(CONTA.name)).toBeVisible();
  await expect(page.getByText(CONTA.email)).toBeVisible();
});

test("com 13 anos, segue para os termos", async ({ page }) => {
  await mockApi(page);
  await page.goto("/cadastro/google");

  await fill(page, turnsThirteenToday(), "Maceió, AL");
  await page.getByRole("button", { name: "Concluir cadastro" }).click();

  await expect(page).toHaveURL(/\/cadastro\/termos$/);
});

test("faltando um dia para os 13, vai para a A02c e descarta a sessão", async ({
  page,
}) => {
  await mockApi(page);

  let descartou = false;
  await page.route("**/api/auth/signup/discard", (route) => {
    descartou = true;
    return route.fulfill({ status: 204, body: "" });
  });

  let completou = false;
  await page.route("**/api/auth/signup/complete", (route) => {
    completou = true;
    return route.fulfill({ status: 200, json: {} });
  });

  await page.goto("/cadastro/google");
  await fill(page, turnsThirteenTomorrow(), "Maceió, AL");
  await page.getByRole("button", { name: "Concluir cadastro" }).click();

  await expect(page).toHaveURL(/\/cadastro\/idade-minima$/);
  await expect(
    page.getByRole("heading", { name: "Ainda não dá pra criar sua conta" }),
  ).toBeVisible();
  expect(descartou).toBe(true);
  expect(completou).toBe(false);
});

test("se o servidor recusar por idade, também vai para a A02c", async ({
  page,
}) => {
  await mockApi(page, {
    completar: { status: 422, corpo: { error: "under_13" } },
  });
  await page.goto("/cadastro/google");

  await fill(page, turnsThirteenToday(), "Maceió, AL");
  await page.getByRole("button", { name: "Concluir cadastro" }).click();

  await expect(page).toHaveURL(/\/cadastro\/idade-minima$/);
});

test("cidade fora da lista do IBGE não passa", async ({ page }) => {
  await mockApi(page);
  await page.goto("/cadastro/google");

  await page.getByLabel("Data de nascimento").fill(turnsThirteenToday());
  await page.getByLabel("Cidade").fill("Cidade Inventada");
  await page.getByRole("button", { name: "Concluir cadastro" }).click();

  await expect(page.getByText("Escolha uma cidade da lista.")).toBeVisible();
  await expect(page).toHaveURL(/\/cadastro\/google$/);
});

test("'Usar outra conta' descarta a sessão e volta ao Google", async ({
  page,
}) => {
  await mockApi(page);

  let descartou = false;
  await page.route("**/api/auth/signup/discard", (route) => {
    descartou = true;
    return route.fulfill({ status: 204, body: "" });
  });

  let inicioGoogle: string | undefined;
  await page.route("**/api/auth/google/login**", (route) => {
    inicioGoogle = route.request().url();
    return route.fulfill({
      contentType: "text/html",
      body: "<html lang='pt-BR'><body><h1>Google</h1></body></html>",
    });
  });

  await page.goto("/cadastro/google");
  await page.getByRole("button", { name: "Usar outra conta" }).click();

  await expect.poll(() => inicioGoogle).toContain("switch_account=1");
  expect(descartou).toBe(true);
});

test("data impossível pede correção, sem mandar para a A02c", async ({
  page,
}) => {
  await mockApi(page);

  let descartou = false;
  await page.route("**/api/auth/signup/discard", (route) => {
    descartou = true;
    return route.fulfill({ status: 204, body: "" });
  });

  await page.goto("/cadastro/google");
  await fill(page, "2090-03-16", "Maceió, AL");
  await page.getByRole("button", { name: "Concluir cadastro" }).click();

  await expect(page.getByText("Confira sua data de nascimento.")).toBeVisible();
  await expect(page).toHaveURL(/\/cadastro\/google$/);
  expect(descartou).toBe(false);
});

test("se a internet cair, o botão volta e ela é avisada", async ({ page }) => {
  await mockApi(page);
  await page.route("**/api/auth/signup/complete", (route) => route.abort());

  await page.goto("/cadastro/google");
  await fill(page, turnsThirteenToday(), "Maceió, AL");
  await page.getByRole("button", { name: "Concluir cadastro" }).click();

  await expect(page.getByText("Não deu pra concluir agora.")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Concluir cadastro" }),
  ).toBeEnabled();
});

test("cidade escrita sem acento e em minúscula também vale", async ({
  page,
}) => {
  await mockApi(page);
  await page.goto("/cadastro/google");

  await fill(page, turnsThirteenToday(), "maceio, al");
  await page.getByRole("button", { name: "Concluir cadastro" }).click();

  await expect(page).toHaveURL(/\/cadastro\/termos$/);
});

test("sem sessão do Google, oferece entrar de novo", async ({ page }) => {
  await mockApi(page, { pendente: null });
  await page.goto("/cadastro/google");

  await expect(
    page.getByRole("link", { name: "Entrar com o Google" }),
  ).toBeVisible();
});

test("a A02c avisa que nada foi guardado", async ({ page }) => {
  await page.goto("/cadastro/idade-minima");

  await expect(
    page.getByRole("heading", { name: "Ainda não dá pra criar sua conta" }),
  ).toBeVisible();
  await expect(
    page.getByText("Não guardamos os dados que você preencheu."),
  ).toBeVisible();
});
