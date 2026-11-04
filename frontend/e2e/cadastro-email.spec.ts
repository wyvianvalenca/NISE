import { expect, test, type Page } from "@playwright/test";

/**
 * A01 / A01b / A02 do cadastro por e-mail (#51).
 *
 * O back-end ainda não existe (#48, #50, #68), então as rotas vêm mockadas.
 * Dados fictícios, como manda o CONTRIBUTING: nada de menina real.
 */

const CIDADES = [
  { id: "2704302", nome: "Maceió, AL" },
  { id: "2611606", nome: "Recife, PE" },
];

const CONVITE = { grupoNome: "Rendeiras" };

/** Hoje em Maceió, para montar datas que não dependem do relógio da máquina. */
function hojeEmMaceio() {
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

/** Quem faz exatamente 13 anos hoje: passa (RN-03). */
function fazTrezeHoje() {
  const { ano, mes, dia } = hojeEmMaceio();
  return iso(ano - 13, mes, dia);
}

/** Quem faz 13 amanhã: 12 anos e 364 dias, não passa. */
function fazTrezeAmanha() {
  const { ano, mes, dia } = hojeEmMaceio();
  const amanha = new Date(Date.UTC(ano, mes - 1, dia + 1));
  return iso(
    amanha.getUTCFullYear() - 13,
    amanha.getUTCMonth() + 1,
    amanha.getUTCDate(),
  );
}

type Mocks = {
  convite?: typeof CONVITE & { emailImportado?: string };
  conviteStatus?: number;
  cadastro?: { status: number; corpo?: unknown };
};

async function mockarApi(page: Page, mocks: Mocks = {}) {
  await page.route("**/api/cidades**", (rota) => rota.fulfill({ json: CIDADES }));

  await page.route("**/api/convites/**", (rota) =>
    mocks.conviteStatus
      ? rota.fulfill({ status: mocks.conviteStatus, json: {} })
      : rota.fulfill({ json: mocks.convite ?? CONVITE }),
  );

  await page.route("**/api/auth/cadastro/email", (rota) =>
    rota.fulfill({
      status: mocks.cadastro?.status ?? 200,
      json: mocks.cadastro?.corpo ?? {},
    }),
  );

  await page.route("**/cadastro/termos", (rota) =>
    rota.fulfill({
      contentType: "text/html",
      body: "<html lang='pt-BR'><body><h1>Termos</h1></body></html>",
    }),
  );
}

async function preencherFormulario(
  page: Page,
  dados: { email?: string; senha?: string; nascimento?: string } = {},
) {
  await page.getByLabel("Nome completo").fill("Alana Oliveira");
  await page.getByLabel("E-mail").fill(dados.email ?? "alana@exemplo.com");
  await page.getByLabel("Senha").fill(dados.senha ?? "senhaforte123");
  await page
    .getByLabel("Data de nascimento")
    .fill(dados.nascimento ?? fazTrezeHoje());
  await page.getByLabel("Cidade").fill("Maceió, AL");
  await expect(page.locator("#cidades-ibge option").first()).toBeAttached();
}

test("A01: a home mostra as boas-vindas sem grupo", async ({ page }) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: /Núcleo de Incentivo e Suporte/ }),
  ).toBeVisible();
  await expect(page.getByText(/Convite ·/)).toHaveCount(0);

  await page.getByRole("button", { name: "Criar conta" }).click();
  await expect(page).toHaveURL(/\/criar-conta$/);
});

test("A01b: o convite mostra o nome do grupo e leva o código adiante", async ({
  page,
}) => {
  await mockarApi(page);
  await page.goto("/convite/rendeiras-2026");

  await expect(page.getByText("Convite · Rendeiras")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Que bom ter você aqui!" }),
  ).toBeVisible();

  await page
    .getByRole("button", { name: "Aceitar convite e criar conta" })
    .click();
  await expect(page).toHaveURL(/\/criar-conta\?convite=rendeiras-2026$/);
});

test("A01b: convite inválido cai na A01", async ({ page }) => {
  await mockarApi(page, { conviteStatus: 404 });
  await page.goto("/convite/nao-existe");

  await expect(page).toHaveURL(/\/$/);
  await expect(
    page.getByRole("heading", { name: /Núcleo de Incentivo e Suporte/ }),
  ).toBeVisible();
});

test("e-mail sem domínio não passa (RF-S2.03)", async ({ page }) => {
  await mockarApi(page);

  let enviou = false;
  await page.route("**/api/auth/cadastro/email", (rota) => {
    enviou = true;
    return rota.fulfill({ status: 200, json: {} });
  });

  await page.goto("/criar-conta");
  await preencherFormulario(page, { email: "alana@gmail" });
  await page.getByRole("button", { name: "Criar conta" }).click();

  await expect(
    page.getByText("Inclua o domínio, como nome@exemplo.com"),
  ).toBeVisible();
  expect(enviou).toBe(false);
});

test("senha curta não passa", async ({ page }) => {
  await mockarApi(page);
  await page.goto("/criar-conta");

  await preencherFormulario(page, { senha: "1234" });
  await page.getByRole("button", { name: "Criar conta" }).click();

  await expect(page.getByText(/pelo menos 8 caracteres/)).toBeVisible();
});

test("cidade fora da lista do IBGE não passa (RN-17)", async ({ page }) => {
  await mockarApi(page);
  await page.goto("/criar-conta");

  await page.getByLabel("Nome completo").fill("Alana Oliveira");
  await page.getByLabel("E-mail").fill("alana@exemplo.com");
  await page.getByLabel("Senha").fill("senhaforte123");
  await page.getByLabel("Data de nascimento").fill(fazTrezeHoje());
  await page.getByLabel("Cidade").fill("Cidade Inventada");
  await page.getByRole("button", { name: "Criar conta" }).click();

  await expect(page.getByText("Escolha uma cidade da lista.")).toBeVisible();
});

test("data impossível pede correção, sem mandar para a A02c", async ({
  page,
}) => {
  await mockarApi(page);
  await page.goto("/criar-conta");

  await preencherFormulario(page, { nascimento: "2090-03-16" });
  await page.getByRole("button", { name: "Criar conta" }).click();

  await expect(page.getByText("Confira sua data de nascimento.")).toBeVisible();
  await expect(page).toHaveURL(/\/criar-conta/);
});

test("se a internet cair, o botão volta e ela é avisada", async ({ page }) => {
  await mockarApi(page);
  await page.route("**/api/auth/cadastro/email", (rota) => rota.abort());

  await page.goto("/criar-conta");
  await preencherFormulario(page);
  await page.getByRole("button", { name: "Criar conta" }).click();

  await expect(page.getByText("Não deu pra criar sua conta agora.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Criar conta" })).toBeEnabled();
});

test("com 13 anos, o cadastro segue para os termos", async ({ page }) => {
  await mockarApi(page);
  await page.goto("/criar-conta");

  await preencherFormulario(page);
  await page.getByRole("button", { name: "Criar conta" }).click();

  await expect(page).toHaveURL(/\/cadastro\/termos$/);
});

test("faltando um dia para os 13, vai para a A02c sem enviar nada", async ({
  page,
}) => {
  await mockarApi(page);

  let enviou = false;
  await page.route("**/api/auth/cadastro/email", (rota) => {
    enviou = true;
    return rota.fulfill({ status: 200, json: {} });
  });

  await page.goto("/criar-conta");
  await preencherFormulario(page, { nascimento: fazTrezeAmanha() });
  await page.getByRole("button", { name: "Criar conta" }).click();

  await expect(page).toHaveURL(/\/cadastro\/idade-minima$/);
  expect(enviou).toBe(false);
});

test("se o servidor recusar por idade, também vai para a A02c", async ({
  page,
}) => {
  await mockarApi(page, {
    cadastro: { status: 422, corpo: { erro: "under_13" } },
  });
  await page.goto("/criar-conta");

  await preencherFormulario(page);
  await page.getByRole("button", { name: "Criar conta" }).click();

  await expect(page).toHaveURL(/\/cadastro\/idade-minima$/);
});

test("e-mail que já tem conta avisa sem criar outra", async ({ page }) => {
  await mockarApi(page, { cadastro: { status: 409 } });
  await page.goto("/criar-conta");

  await preencherFormulario(page);
  await page.getByRole("button", { name: "Criar conta" }).click();

  await expect(
    page.getByText("Já existe uma conta com esse e-mail."),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/criar-conta/);
});

test("e-mail vindo de importação já vem preenchido (RF-F2.02)", async ({
  page,
}) => {
  await mockarApi(page, {
    convite: { ...CONVITE, emailImportado: "alana.importada@exemplo.com" },
  });
  await page.goto("/criar-conta?convite=rendeiras-2026");

  await expect(page.getByLabel("E-mail")).toHaveValue(
    "alana.importada@exemplo.com",
  );
});

test("o código do convite segue no envio, para a origem sair certa (RN-29)", async ({
  page,
}) => {
  await mockarApi(page);

  let corpoEnviado: Record<string, unknown> = {};
  await page.route("**/api/auth/cadastro/email", (rota) => {
    corpoEnviado = rota.request().postDataJSON();
    return rota.fulfill({ status: 200, json: {} });
  });

  await page.goto("/criar-conta?convite=rendeiras-2026");
  await preencherFormulario(page);
  await page.getByRole("button", { name: "Criar conta" }).click();

  await expect(page).toHaveURL(/\/cadastro\/termos$/);
  expect(corpoEnviado.convite).toBe("rendeiras-2026");
});

test("sem convite, o envio não manda origem de grupo nenhum", async ({
  page,
}) => {
  await mockarApi(page);

  let corpoEnviado: Record<string, unknown> = {};
  await page.route("**/api/auth/cadastro/email", (rota) => {
    corpoEnviado = rota.request().postDataJSON();
    return rota.fulfill({ status: 200, json: {} });
  });

  await page.goto("/criar-conta");
  await preencherFormulario(page);
  await page.getByRole("button", { name: "Criar conta" }).click();

  await expect(page).toHaveURL(/\/cadastro\/termos$/);
  expect(corpoEnviado.convite).toBeUndefined();
});
