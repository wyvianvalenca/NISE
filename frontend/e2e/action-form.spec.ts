import { expect, test, type Page } from "@playwright/test";
import { mockActionsListApi, type ActionsListApi } from "./actions-list-api";

/**
 * K02, the form that registers an action (#212).
 *
 * The save is POST /api/actions, mocked in actions-list-api.ts together with the
 * IBGE city search. Fictional data only.
 */

const FORM_URL = "/coordenacao/acoes/nova";
const CITIES = [
  { id: "2704302", name: "Maceió, AL" },
  { id: "2700300", name: "Arapiraca, AL" },
];

let api: ActionsListApi;

test.beforeEach(async ({ page }) => {
  api = await mockActionsListApi(page);
  await page.route("**/api/cities**", (route) => {
    const search = new URL(route.request().url()).searchParams.get("search") ?? "";
    const plain = (text: string) =>
      text
        .toLowerCase()
        .normalize("NFD")
        .replace(/\p{Diacritic}/gu, "");
    return route.fulfill({ json: CITIES.filter((city) => plain(city.name).includes(plain(search))) });
  });
});

async function pickCity(page: Page, search = "Mace") {
  await page.getByRole("combobox", { name: "Cidade" }).fill(search);
  await page.getByRole("option", { name: "Maceió, AL" }).click();
}

/** Fills every required field of an open, in-person action. */
async function fillRequired(page: Page) {
  await page.getByLabel("Nome da ação").fill("Oficina de robótica");
  await page.getByRole("button", { name: "Oficina" }).click();
  await page.getByLabel("Data", { exact: true }).fill("2027-03-10");
  await pickCity(page);
  await page.getByLabel("Link de inscrição").fill("https://forms.example/robotica");
}

const save = (page: Page) => page.getByRole("button", { name: "Salvar, importo depois" });

test("shows the title, the line and the fields in the order of the Figma", async ({ page }) => {
  await page.goto(FORM_URL);

  await expect(page.getByRole("heading", { name: "Nova ação", level: 1 })).toBeVisible();
  await expect(page.getByText("Leva uns 5 minutos. O que está em Mais detalhes é opcional.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Ações", exact: true }).last()).toHaveAttribute("href", "/coordenacao/acoes");

  const labels = await page.locator("form label, form legend, form button[aria-expanded]").allTextContents();
  const order = ["Nome da ação", "Tipo", "Data", "Cidade", "Quem pode ver na NISE?", "Link de inscrição", "Tags", "Mais detalhes"];
  const positions = order.map((text) => labels.findIndex((label) => label.startsWith(text)));
  expect(positions.every((position) => position >= 0)).toBe(true);
  expect(positions).toEqual([...positions].sort((a, b) => a - b));

  await expect(page.getByRole("radio", { name: /Aberta ao público/ })).toBeChecked();
  await expect(page.getByRole("button", { name: "Oficina" })).toHaveAttribute("aria-pressed", "false");
  for (const type of ["Oficina", "Palestra", "Minicurso", "Hackathon", "Visita", "Acolhimento", "Outro"]) {
    await expect(page.getByRole("button", { name: type, exact: true })).toBeVisible();
  }
});

test("in person asks for the city and online removes the field", async ({ page }) => {
  await page.goto(FORM_URL);
  const city = page.getByRole("combobox", { name: "Cidade" });

  await expect(city).toBeVisible();
  await page.getByRole("radio", { name: "Online" }).click();
  await expect(city).toHaveCount(0);

  await page.getByRole("radio", { name: "Presencial" }).click();
  await expect(city).toBeVisible();
  await expect(city).toHaveValue("");
});

test("an in-person action needs a city from the list, free text is refused", async ({ page }) => {
  await page.goto(FORM_URL);
  await fillRequired(page);
  await page.getByRole("combobox", { name: "Cidade" }).fill("Cidade que não existe");
  await save(page).click();

  await expect(page).toHaveURL(FORM_URL);
  await expect(page.getByText("Escolha uma cidade da lista.")).toBeVisible();
});

test("the link is required for an open action, optional for a closed one", async ({ page }) => {
  await page.goto(FORM_URL);
  await fillRequired(page);
  await page.getByLabel("Link de inscrição").fill("");
  await save(page).click();

  await expect(page).toHaveURL(FORM_URL);
  await expect(page.getByText("Obrigatório pra ações abertas.", { exact: true })).toBeVisible();

  await page.getByRole("radio", { name: /Fechada/ }).click();
  await expect(page.getByText("Obrigatório pra ações abertas.", { exact: true })).toHaveCount(0);
  await save(page).click();
  await expect(page).toHaveURL(/\/coordenacao\/acoes\?salva=\d+$/);
});

test("the link must start with https, open or closed", async ({ page }) => {
  await page.goto(FORM_URL);
  await fillRequired(page);

  for (const visibility of [/Aberta ao público/, /Fechada/]) {
    await page.getByRole("radio", { name: visibility }).click();
    await page.getByLabel("Link de inscrição").fill("http://forms.example/robotica");
    await save(page).click();
    await expect(page).toHaveURL(FORM_URL);
    await expect(page.getByLabel("Link de inscrição")).toHaveAttribute("aria-invalid", "true");
    await expect(page.getByText("O link precisa começar com https://")).toBeVisible();
  }
});

test("an end date before the start date is refused next to the field", async ({ page }) => {
  await page.goto(FORM_URL);
  await fillRequired(page);
  await page.getByRole("button", { name: /Mais detalhes/ }).click();
  await page.getByRole("button", { name: "+ Dura mais de um dia" }).click();
  await page.getByLabel("Data de fim").fill("2027-03-09");
  await save(page).click();

  await expect(page).toHaveURL(FORM_URL);
  const end = page.getByLabel("Data de fim");
  await expect(end).toBeFocused();
  await expect(end).toHaveAccessibleDescription("A data de fim não pode ser antes da data de início.");

  await end.fill("2027-03-10");
  await expect(page.getByText("A data de fim não pode ser antes")).toHaveCount(0);
});

test("the description counts what she types and stops at 300", async ({ page }) => {
  await page.goto(FORM_URL);
  await page.getByRole("button", { name: /Mais detalhes/ }).click();
  const description = page.getByLabel("Descrição");

  await expect(page.getByText("0/300")).toBeVisible();
  await description.fill("Vamos montar um robô.");
  await expect(page.getByText("21/300")).toBeVisible();

  await description.fill("a".repeat(400));
  await expect(page.getByText("300/300")).toBeVisible();
  await expect(description).toHaveValue("a".repeat(300));
});

test("tags and audiences take more than one choice and can be removed", async ({ page }) => {
  await page.goto(FORM_URL);
  const topics = ["Programação", "Robótica", "Inteligência artificial", "Dados", "Cibersegurança", "Jogos", "Sites e apps", "Design e criação"];
  for (const topic of topics) {
    await expect(page.getByRole("button", { name: topic, exact: true })).toBeVisible();
  }

  const robotics = page.getByRole("button", { name: "Robótica", exact: true });
  const data = page.getByRole("button", { name: "Dados", exact: true });
  await robotics.click();
  await data.click();
  await expect(robotics).toHaveAttribute("aria-pressed", "true");
  await expect(data).toHaveAttribute("aria-pressed", "true");
  await robotics.click();
  await expect(robotics).toHaveAttribute("aria-pressed", "false");
  await expect(data).toHaveAttribute("aria-pressed", "true");

  await page.getByRole("button", { name: /Mais detalhes/ }).click();
  const middle = page.getByRole("button", { name: "Ensino médio" });
  const technical = page.getByRole("button", { name: "Curso técnico" });
  await middle.click();
  await technical.click();
  await expect(middle).toHaveAttribute("aria-pressed", "true");
  await expect(technical).toHaveAttribute("aria-pressed", "true");
});

test("an empty form shows one message per required field and focuses the first", async ({ page }) => {
  await page.goto(FORM_URL);
  await save(page).click();

  await expect(page).toHaveURL(FORM_URL);
  const name = page.getByLabel("Nome da ação");
  await expect(name).toBeFocused();
  await expect(name).toHaveAccessibleDescription("Dê um nome à ação.");
  await expect(page.getByLabel("Data", { exact: true })).toHaveAccessibleDescription("Escolha a data.");
  await expect(page.getByRole("combobox", { name: "Cidade" })).toHaveAccessibleDescription("Escolha uma cidade da lista.");
  await expect(page.getByLabel("Link de inscrição")).toHaveAccessibleDescription(/Obrigatório pra ações abertas\./);
  await expect(page.getByText("Escolha o tipo da ação.")).toBeVisible();
});

test("the type error takes the focus when it is the first problem", async ({ page }) => {
  await page.goto(FORM_URL);
  await page.getByLabel("Nome da ação").fill("Oficina de robótica");
  await save(page).click();

  await expect(page.getByRole("button", { name: "Oficina", exact: true })).toBeFocused();
});

test("saving goes back to the list with the id of the action", async ({ page }) => {
  await page.goto(FORM_URL);
  await fillRequired(page);
  await save(page).click();

  await expect(page).toHaveURL(/\/coordenacao\/acoes\?salva=\d+$/);
  expect(api.saved).toEqual([
    {
      method: "POST",
      id: null,
      body: {
        name: "Oficina de robótica",
        type: "oficina",
        starts_on: "2027-03-10",
        ends_on: null,
        format: "in_person",
        city_ibge_code: 2704302,
        visibility: "open",
        registration_url: "https://forms.example/robotica",
        starts_at_time: null,
        ends_at_time: null,
        address: null,
        description: null,
        topics: [],
        audiences: [],
      },
    },
  ]);
});

test("an online action saves with no city", async ({ page }) => {
  await page.goto(FORM_URL);
  await page.getByLabel("Nome da ação").fill("Palestra online");
  await page.getByRole("button", { name: "Palestra" }).click();
  await page.getByLabel("Data", { exact: true }).fill("2027-04-01");
  await page.getByRole("radio", { name: "Online" }).click();
  await page.getByLabel("Link de inscrição").fill("https://forms.example/palestra");
  await save(page).click();

  await expect(page).toHaveURL(/\/coordenacao\/acoes\?salva=\d+$/);
  expect(api.saved[0].body).toMatchObject({ format: "online", city_ibge_code: null });
});

test("a failed save keeps what she typed and says so", async ({ page }) => {
  api.saveStatus = 500;
  await page.goto(FORM_URL);
  await fillRequired(page);
  await page.getByRole("button", { name: "Robótica", exact: true }).click();
  await save(page).click();

  await expect(page.getByRole("alert").filter({ hasText: "Não deu pra salvar" })).toHaveText("Não deu pra salvar. Tente de novo.");
  await expect(page).toHaveURL(FORM_URL);
  await expect(page.getByLabel("Nome da ação")).toHaveValue("Oficina de robótica");
  await expect(page.getByLabel("Link de inscrição")).toHaveValue("https://forms.example/robotica");
  await expect(page.getByRole("combobox", { name: "Cidade" })).toHaveValue("Maceió, AL");
  await expect(page.getByRole("button", { name: "Robótica", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(save(page)).toBeEnabled();
});

test("the whole form works by keyboard with a visible focus", async ({ page }) => {
  await page.goto(FORM_URL);

  await page.getByLabel("Nome da ação").focus();
  await page.keyboard.type("Oficina de robótica");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Oficina", exact: true })).toBeFocused();
  await page.keyboard.press("Space");
  await expect(page.getByRole("button", { name: "Oficina", exact: true })).toHaveAttribute("aria-pressed", "true");

  const focused = page.getByRole("button", { name: "Palestra", exact: true });
  await focused.focus();
  const outline = await focused.evaluate((el) => {
    const style = getComputedStyle(el);
    return { style: style.outlineStyle, width: parseFloat(style.outlineWidth) };
  });
  expect(outline.style).not.toBe("none");
  expect(outline.width).toBeGreaterThanOrEqual(2);

  const details = page.getByRole("button", { name: /Mais detalhes/ });
  await details.focus();
  await page.keyboard.press("Enter");
  await expect(details).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByLabel("Começa às")).toBeVisible();
});

test("has no horizontal scroll at 1366 px, with the details open", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto(FORM_URL);
  await page.getByRole("button", { name: /Mais detalhes/ }).click();

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBe(0);
});
