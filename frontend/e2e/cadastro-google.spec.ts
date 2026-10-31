import { expect, test, type Page } from "@playwright/test";

/**
 * A02b/A02c do cadastro com o Google (#52).
 *
 * O back-end ainda não existe (#47 e #50), então as rotas vêm mockadas aqui.
 * Os dados são fictícios, como manda o CONTRIBUTING: nada de menina real.
 */

const CONTA = { nome: "Alana Oliveira", email: "alana@exemplo.com" };
const CIDADES = [
  { id: "2704302", nome: "Maceió, AL" },
  { id: "2611606", nome: "Recife, PE" },
];

/** Hoje em Maceió, para montar datas de nascimento que não dependem do relógio. */
function hojeEmMaceio(): { ano: number; mes: number; dia: number } {
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

/** Data de nascimento de quem faz exatamente 13 anos hoje. */
function fazTrezeHoje(): string {
  const { ano, mes, dia } = hojeEmMaceio();
  return iso(ano - 13, mes, dia);
}

/** Data de nascimento de quem faz 13 anos amanhã (12 anos e 364 dias). */
function fazTrezeAmanha(): string {
  const { ano, mes, dia } = hojeEmMaceio();
  const amanha = new Date(Date.UTC(ano, mes - 1, dia + 1));
  return iso(
    amanha.getUTCFullYear() - 13,
    amanha.getUTCMonth() + 1,
    amanha.getUTCDate(),
  );
}

type Mocks = {
  /** `null` simula não haver sessão incompleta do Google. */
  pendente?: typeof CONTA | null;
  completar?: { status: number; corpo?: unknown };
};

async function mockarApi(page: Page, mocks: Mocks = {}) {
  const pendente = mocks.pendente === undefined ? CONTA : mocks.pendente;

  await page.route("**/api/auth/cadastro/pendente", (rota) =>
    pendente
      ? rota.fulfill({ json: pendente })
      : rota.fulfill({ status: 404, json: {} }),
  );

  await page.route("**/api/cidades**", (rota) => rota.fulfill({ json: CIDADES }));

  await page.route("**/api/auth/cadastro/completar", (rota) =>
    rota.fulfill({
      status: mocks.completar?.status ?? 200,
      json: mocks.completar?.corpo ?? {},
    }),
  );

  await page.route("**/api/auth/cadastro/descartar", (rota) =>
    rota.fulfill({ status: 204, body: "" }),
  );

  // A tela de termos é da #53; aqui só confirmamos que o fluxo chega nela.
  await page.route("**/cadastro/termos", (rota) =>
    rota.fulfill({
      contentType: "text/html",
      body: "<html lang='pt-BR'><body><h1>Termos</h1></body></html>",
    }),
  );
}

async function preencher(page: Page, dataNascimento: string, cidade: string) {
  await page.getByLabel("Data de nascimento").fill(dataNascimento);
  await page.getByLabel("Cidade").fill(cidade);
  // Espera a lista do IBGE chegar antes de enviar.
  await expect(page.locator("#cidades-ibge option").first()).toBeAttached();
}

test("mostra o nome e o e-mail que vieram do Google", async ({ page }) => {
  await mockarApi(page);
  await page.goto("/cadastro/google");

  await expect(
    page.getByRole("heading", { name: "Só mais um passo" }),
  ).toBeVisible();
  await expect(page.getByText(CONTA.nome)).toBeVisible();
  await expect(page.getByText(CONTA.email)).toBeVisible();
});

test("com 13 anos, segue para os termos", async ({ page }) => {
  await mockarApi(page);
  await page.goto("/cadastro/google");

  await preencher(page, fazTrezeHoje(), "Maceió, AL");
  await page.getByRole("button", { name: "Concluir cadastro" }).click();

  await expect(page).toHaveURL(/\/cadastro\/termos$/);
});

test("faltando um dia para os 13, vai para a A02c e descarta a sessão", async ({
  page,
}) => {
  await mockarApi(page);

  let descartou = false;
  await page.route("**/api/auth/cadastro/descartar", (rota) => {
    descartou = true;
    return rota.fulfill({ status: 204, body: "" });
  });

  // Se a idade passasse batido, o completar seria chamado — queremos que não.
  let completou = false;
  await page.route("**/api/auth/cadastro/completar", (rota) => {
    completou = true;
    return rota.fulfill({ status: 200, json: {} });
  });

  await page.goto("/cadastro/google");
  await preencher(page, fazTrezeAmanha(), "Maceió, AL");
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
  await mockarApi(page, {
    completar: { status: 422, corpo: { erro: "under_13" } },
  });
  await page.goto("/cadastro/google");

  await preencher(page, fazTrezeHoje(), "Maceió, AL");
  await page.getByRole("button", { name: "Concluir cadastro" }).click();

  await expect(page).toHaveURL(/\/cadastro\/idade-minima$/);
});

test("cidade fora da lista do IBGE não passa", async ({ page }) => {
  await mockarApi(page);
  await page.goto("/cadastro/google");

  await page.getByLabel("Data de nascimento").fill(fazTrezeHoje());
  await page.getByLabel("Cidade").fill("Cidade Inventada");
  await page.getByRole("button", { name: "Concluir cadastro" }).click();

  await expect(page.getByText("Escolha uma cidade da lista.")).toBeVisible();
  await expect(page).toHaveURL(/\/cadastro\/google$/);
});

test("'Usar outra conta' descarta a sessão e volta ao Google", async ({
  page,
}) => {
  await mockarApi(page);

  let descartou = false;
  await page.route("**/api/auth/cadastro/descartar", (rota) => {
    descartou = true;
    return rota.fulfill({ status: 204, body: "" });
  });

  let inicioGoogle: string | undefined;
  await page.route("**/api/auth/google/inicio**", (rota) => {
    inicioGoogle = rota.request().url();
    return rota.fulfill({
      contentType: "text/html",
      body: "<html lang='pt-BR'><body><h1>Google</h1></body></html>",
    });
  });

  await page.goto("/cadastro/google");
  await page.getByRole("button", { name: "Usar outra conta" }).click();

  await expect.poll(() => inicioGoogle).toContain("trocar_conta=1");
  expect(descartou).toBe(true);
});

test("sem sessão do Google, oferece entrar de novo", async ({ page }) => {
  await mockarApi(page, { pendente: null });
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
