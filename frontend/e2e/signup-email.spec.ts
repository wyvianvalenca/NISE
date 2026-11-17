import { expect, test, type Page } from "@playwright/test";

/**
 * A01 / A01b / A02 of the email sign-up (#51).
 *
 * The back-end does not exist yet (#48, #50, #68), so the routes are mocked.
 * Fictional data, as CONTRIBUTING requires: no real girl.
 */

const CIDADES = [
  { id: "2704302", name: "Maceió, AL" },
  { id: "2611606", name: "Recife, PE" },
];

const CONVITE = { groupName: "Rendeiras" };

/** Drops accents and case, the same way the back-end compares names. */
function comparable(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

/** Today in Maceió, to build dates that do not depend on the machine clock. */
function todayInMaceio() {
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

function iso(ano: number, mes: number, dia: number) {
  return `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

/** Turning exactly 13 today: passes (RN-03). */
function turnsThirteenToday() {
  const { ano, mes, dia } = todayInMaceio();
  return iso(ano - 13, mes, dia);
}

/** Turning 13 tomorrow: 12 years and 364 days, does not pass. */
function turnsThirteenTomorrow() {
  const { ano, mes, dia } = todayInMaceio();
  const amanha = new Date(Date.UTC(ano, mes - 1, dia + 1));
  return iso(
    amanha.getUTCFullYear() - 13,
    amanha.getUTCMonth() + 1,
    amanha.getUTCDate(),
  );
}

type Mocks = {
  convite?: typeof CONVITE;
  conviteStatus?: number;
  cadastro?: { status: number; corpo?: unknown };
};

async function mockApi(page: Page, mocks: Mocks = {}) {
  // Like the real route (#50): filters by name, ignoring accents and case.
  await page.route("**/api/cities**", (route) => {
    const search = new URL(route.request().url()).searchParams.get("search");
    const found = CIDADES.filter((cidade) =>
      comparable(cidade.name).includes(comparable(search ?? "")),
    );
    return route.fulfill({ json: found });
  });

  await page.route("**/api/invites/**", (route) =>
    mocks.conviteStatus
      ? route.fulfill({ status: mocks.conviteStatus, json: {} })
      : route.fulfill({ json: mocks.convite ?? CONVITE }),
  );

  await page.route("**/api/auth/signup/email", (route) =>
    route.fulfill({
      status: mocks.cadastro?.status ?? 200,
      json: mocks.cadastro?.corpo ?? {},
    }),
  );

  await page.route("**/cadastro/termos", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<html lang='pt-BR'><body><h1>Termos</h1></body></html>",
    }),
  );
}

async function fillForm(
  page: Page,
  dados: { email?: string; senha?: string; nascimento?: string } = {},
) {
  await page.getByLabel("Nome completo").fill("Alana Oliveira");
  await page.getByLabel("E-mail").fill(dados.email ?? "alana@exemplo.com");
  await page.getByLabel("Senha").fill(dados.senha ?? "senhaforte123");
  await page
    .getByLabel("Data de nascimento")
    .fill(dados.nascimento ?? turnsThirteenToday());
  await pickCity(page, "macei", "Maceió, AL");
}

/** Types part of the name and taps the city in the suggestion list. */
async function pickCity(page: Page, typed: string, city: string) {
  await page.getByLabel("Cidade").fill(typed);
  await page.getByRole("option", { name: city }).click();
  await expect(page.getByLabel("Cidade")).toHaveValue(city);
}

test("A01: a home mostra as boas-vindas sem grupo", async ({ page }) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: /Núcleo de Incentivo e Suporte/ }),
  ).toBeVisible();
  await expect(page.getByText(/Convite ·/)).toHaveCount(0);

  await page.getByRole("link", { name: "Criar conta" }).click();
  await expect(page).toHaveURL(/\/criar-conta$/);
});

test("A01b: o convite mostra o nome do grupo e leva o código adiante", async ({
  page,
}) => {
  await mockApi(page);
  await page.goto("/convite/rendeiras-2026");

  await expect(page.getByText("Convite · Rendeiras")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Que bom ter você aqui!" }),
  ).toBeVisible();

  await page
    .getByRole("link", { name: "Aceitar convite e criar conta" })
    .click();
  await expect(page).toHaveURL(/\/criar-conta\?convite=rendeiras-2026$/);
});

test("A01b: convite inválido cai na A01", async ({ page }) => {
  await mockApi(page, { conviteStatus: 404 });
  await page.goto("/convite/nao-existe");

  await expect(page).toHaveURL(/\/$/);
  await expect(
    page.getByRole("heading", { name: /Núcleo de Incentivo e Suporte/ }),
  ).toBeVisible();
});

test("e-mail sem domínio não passa (RF-S2.03)", async ({ page }) => {
  await mockApi(page);

  let enviou = false;
  await page.route("**/api/auth/signup/email", (route) => {
    enviou = true;
    return route.fulfill({ status: 200, json: {} });
  });

  await page.goto("/criar-conta");
  await fillForm(page, { email: "alana@gmail" });
  await page.getByRole("button", { name: "Criar conta" }).click();

  await expect(
    page.getByText("Inclua o domínio, como nome@exemplo.com"),
  ).toBeVisible();
  expect(enviou).toBe(false);
});

test("senha curta não passa", async ({ page }) => {
  await mockApi(page);
  await page.goto("/criar-conta");

  await fillForm(page, { senha: "1234" });
  await page.getByRole("button", { name: "Criar conta" }).click();

  await expect(page.getByText(/pelo menos 8 caracteres/)).toBeVisible();
});

test("cidade fora da lista do IBGE não passa (RN-17)", async ({ page }) => {
  await mockApi(page);
  await page.goto("/criar-conta");

  await page.getByLabel("Nome completo").fill("Alana Oliveira");
  await page.getByLabel("E-mail").fill("alana@exemplo.com");
  await page.getByLabel("Senha").fill("senhaforte123");
  await page.getByLabel("Data de nascimento").fill(turnsThirteenToday());
  await page.getByLabel("Cidade").fill("Cidade Inventada");
  await page.getByRole("button", { name: "Criar conta" }).click();

  await expect(page.getByText("Escolha uma cidade da lista.")).toBeVisible();
});

test("a lista mostra a cidade com acento quando ela digita sem acento", async ({
  page,
}) => {
  await mockApi(page);
  await page.goto("/criar-conta");

  // The native datalist hid these options on Chrome for Android (#50).
  await page.getByLabel("Cidade").fill("maceio");

  await expect(page.getByRole("option", { name: "Maceió, AL" })).toBeVisible();
  await expect(page.getByRole("option", { name: "Recife, PE" })).toHaveCount(0);
});

test("dá para escolher a cidade só com o teclado", async ({ page }) => {
  await mockApi(page);
  await page.goto("/criar-conta");

  const cidade = page.getByLabel("Cidade");
  await cidade.fill("macei");
  await expect(page.getByRole("option", { name: "Maceió, AL" })).toBeVisible();
  await cidade.press("ArrowDown");
  await expect(cidade).toHaveAttribute("aria-activedescendant", /.+/);
  await cidade.press("Enter");

  await expect(cidade).toHaveValue("Maceió, AL");
  await expect(page.getByRole("listbox")).toHaveCount(0);
});

test("o que ela digita antes de a página carregar não se perde", async ({
  page,
}) => {
  await mockApi(page);
  await page.route("**/_next/static/**/*.js", async (route) => {
    await new Promise((ok) => setTimeout(ok, 1500));
    await route.continue();
  });

  await page.goto("/criar-conta", { waitUntil: "commit" });
  await page.getByLabel("Nome completo").fill("Alana Oliveira");
  await page.getByLabel("E-mail").fill("alana@exemplo.com");

  // The button only answers once React has taken over the screen.
  await expect(page.getByRole("button", { name: "Criar conta" })).toBeEnabled({
    timeout: 15000,
  });
  await expect(page.getByLabel("Nome completo")).toHaveValue("Alana Oliveira");
  await expect(page.getByLabel("E-mail")).toHaveValue("alana@exemplo.com");

  // And what she typed earlier counts on submit, not just on screen.
  await page.getByLabel("Senha").fill("senhaforte123");
  await page.getByLabel("Data de nascimento").fill(turnsThirteenToday());
  await pickCity(page, "macei", "Maceió, AL");
  await page.getByRole("button", { name: "Criar conta" }).click();

  await expect(page).toHaveURL(/\/cadastro\/termos$/);
});

test("data impossível pede correção, sem mandar para a A02c", async ({
  page,
}) => {
  await mockApi(page);
  await page.goto("/criar-conta");

  await fillForm(page, { nascimento: "2090-03-16" });
  await page.getByRole("button", { name: "Criar conta" }).click();

  await expect(page.getByText("Confira sua data de nascimento.")).toBeVisible();
  await expect(page).toHaveURL(/\/criar-conta/);
});

test("se a internet cair, o botão volta e ela é avisada", async ({ page }) => {
  await mockApi(page);
  await page.route("**/api/auth/signup/email", (route) => route.abort());

  await page.goto("/criar-conta");
  await fillForm(page);
  await page.getByRole("button", { name: "Criar conta" }).click();

  await expect(page.getByText("Não deu pra criar sua conta agora.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Criar conta" })).toBeEnabled();
});

test("com 13 anos, o cadastro segue para os termos", async ({ page }) => {
  await mockApi(page);
  await page.goto("/criar-conta");

  await fillForm(page);
  await page.getByRole("button", { name: "Criar conta" }).click();

  await expect(page).toHaveURL(/\/cadastro\/termos$/);
});

test("faltando um dia para os 13, vai para a A02c sem enviar nada", async ({
  page,
}) => {
  await mockApi(page);

  let enviou = false;
  await page.route("**/api/auth/signup/email", (route) => {
    enviou = true;
    return route.fulfill({ status: 200, json: {} });
  });

  await page.goto("/criar-conta");
  await fillForm(page, { nascimento: turnsThirteenTomorrow() });
  await page.getByRole("button", { name: "Criar conta" }).click();

  await expect(page).toHaveURL(/\/cadastro\/idade-minima$/);
  expect(enviou).toBe(false);
});

test("se o servidor recusar por idade, também vai para a A02c", async ({
  page,
}) => {
  await mockApi(page, {
    cadastro: { status: 422, corpo: { error: "under_13" } },
  });
  await page.goto("/criar-conta");

  await fillForm(page);
  await page.getByRole("button", { name: "Criar conta" }).click();

  await expect(page).toHaveURL(/\/cadastro\/idade-minima$/);
});

test("e-mail que já tem conta avisa sem criar outra", async ({ page }) => {
  await mockApi(page, { cadastro: { status: 409 } });
  await page.goto("/criar-conta");

  await fillForm(page);
  await page.getByRole("button", { name: "Criar conta" }).click();

  await expect(
    page.getByText("Já existe uma conta com esse e-mail."),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/criar-conta/);
});

test("a rota pública do convite não devolve e-mail de ninguém", async ({
  page,
}) => {
  let resposta: unknown;
  await page.route("**/api/invites/**", async (route) => {
    await route.fulfill({ json: CONVITE });
  });
  page.on("response", async (r) => {
    if (r.url().includes("/api/invites/")) resposta = await r.json();
  });

  await page.goto("/convite/rendeiras-2026");
  await expect(page.getByText("Convite · Rendeiras")).toBeVisible();

  expect(JSON.stringify(resposta ?? {})).not.toContain("@");
  await expect(page.getByLabel("E-mail")).toHaveCount(0);
});

test("o código do convite segue no envio, para a origem sair certa (RN-29)", async ({
  page,
}) => {
  await mockApi(page);

  let corpoEnviado: Record<string, unknown> = {};
  await page.route("**/api/auth/signup/email", (route) => {
    corpoEnviado = route.request().postDataJSON();
    return route.fulfill({ status: 200, json: {} });
  });

  await page.goto("/criar-conta?convite=rendeiras-2026");
  await fillForm(page);
  await page.getByRole("button", { name: "Criar conta" }).click();

  await expect(page).toHaveURL(/\/cadastro\/termos$/);
  expect(corpoEnviado.invite).toBe("rendeiras-2026");
});

test("sem convite, o envio não manda origem de grupo nenhum", async ({
  page,
}) => {
  await mockApi(page);

  let corpoEnviado: Record<string, unknown> = {};
  await page.route("**/api/auth/signup/email", (route) => {
    corpoEnviado = route.request().postDataJSON();
    return route.fulfill({ status: 200, json: {} });
  });

  await page.goto("/criar-conta");
  await fillForm(page);
  await page.getByRole("button", { name: "Criar conta" }).click();

  await expect(page).toHaveURL(/\/cadastro\/termos$/);
  expect(corpoEnviado.invite).toBeUndefined();
});
