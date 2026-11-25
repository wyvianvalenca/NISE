import { expect, test, type Page } from "@playwright/test";
import { signedIn } from "./session";
import { mockActionsListApi, type ActionsListApi } from "./actions-list-api";

/**
 * K02 filled in, to edit an action (#222).
 *
 * Action 1 of the mock (actions-list-api.ts) is an open, in-person action of one
 * day with a city, times, tags and an audience; action 2 is a closed online
 * one of two days. GET and PUT /api/actions/{id} and the IBGE city search are
 * mocked. Fictional data only.
 */

const CITIES = [{ id: "2704302", name: "Maceió, AL" }];

let api: ActionsListApi;

test.beforeEach(async ({ page }) => {
  await signedIn(page);
  api = await mockActionsListApi(page);
  await page.route("**/api/cities**", (route) => route.fulfill({ json: CITIES }));
});

const save = (page: Page) => page.getByRole("button", { name: "Salvar, importo depois" });

test("opens with every field filled in with the saved action", async ({ page }) => {
  await page.goto("/coordenacao/acoes/1/editar");

  await expect(page.getByLabel("Nome da ação")).toHaveValue("Introdução à robótica");
  await expect(page.getByRole("button", { name: "Oficina", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByLabel("Data", { exact: true })).toHaveValue("2026-10-24");
  await expect(page.getByRole("radio", { name: "Presencial" })).toHaveAttribute("aria-checked", "true");
  await expect(page.getByRole("combobox", { name: "Cidade" })).toHaveValue("Maceió, AL");
  await expect(page.getByRole("radio", { name: /Aberta ao público/ })).toBeChecked();
  await expect(page.getByLabel("Link de inscrição")).toHaveValue("https://forms.gle/rendeiras-robotica");
  await expect(page.getByRole("button", { name: "Robótica", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "Dados", exact: true })).toHaveAttribute("aria-pressed", "false");

  await expect(page.getByRole("button", { name: /Mais detalhes/ })).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByLabel("Começa às")).toHaveValue("14:00");
  await expect(page.getByLabel("Termina às")).toHaveValue("17:00");
  await expect(page.getByRole("button", { name: "Ensino médio" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "Graduação" })).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByText("51/300")).toBeVisible();
});

test("an online action opens with no city field and its end date shown", async ({ page }) => {
  await page.goto("/coordenacao/acoes/2/editar");

  await expect(page.getByLabel("Nome da ação")).toHaveValue("Roda de conversa sobre carreira");
  await expect(page.getByRole("combobox", { name: "Cidade" })).toHaveCount(0);
  await expect(page.getByRole("radio", { name: /Fechada/ })).toBeChecked();
  await expect(page.getByLabel("Data de fim")).toHaveValue("2026-11-11");
});

test("going online and back to in person keeps the saved city, and it saves", async ({ page }) => {
  await page.goto("/coordenacao/acoes/1/editar");

  await page.getByRole("radio", { name: "Online" }).click();
  await expect(page.getByRole("combobox", { name: "Cidade" })).toHaveCount(0);
  await page.getByRole("radio", { name: "Presencial" }).click();

  await expect(page.getByRole("combobox", { name: "Cidade" })).toHaveValue("Maceió, AL");
  await save(page).click();

  await expect(page).toHaveURL(/\/coordenacao\/acoes\?salva=1$/);
});

test("going online and back, then changing the city text, asks for a city from the list again", async ({ page }) => {
  await page.goto("/coordenacao/acoes/1/editar");

  await page.getByRole("radio", { name: "Online" }).click();
  await page.getByRole("radio", { name: "Presencial" }).click();
  await page.getByRole("combobox", { name: "Cidade" }).fill("Maceio de mentira");
  await save(page).click();

  await expect(page.getByText("Escolha uma cidade da lista.")).toBeVisible();
  await expect(page).toHaveURL(/\/editar$/);
});

test("saving a change goes back to the list and the change stays when it is opened again", async ({ page }) => {
  await page.goto("/coordenacao/acoes/1/editar");
  await page.getByLabel("Nome da ação").fill("Robótica para iniciantes");
  await page.getByRole("button", { name: "Robótica", exact: true }).click();
  await page.getByRole("button", { name: "Dados", exact: true }).click();
  await save(page).click();

  await expect(page).toHaveURL(/\/coordenacao\/acoes\?salva=1$/);

  await page.goto("/coordenacao/acoes/1/editar");
  await expect(page.getByLabel("Nome da ação")).toHaveValue("Robótica para iniciantes");
  await expect(page.getByRole("button", { name: "Dados", exact: true })).toHaveAttribute("aria-pressed", "true");
});

test("a removed tag is gone after saving", async ({ page }) => {
  await page.goto("/coordenacao/acoes/1/editar");
  await page.getByRole("button", { name: "Robótica", exact: true }).click();
  await save(page).click();
  await expect(page).toHaveURL(/salva=1$/);

  await page.goto("/coordenacao/acoes/1/editar");
  await expect(page.getByRole("button", { name: "Robótica", exact: true })).toHaveAttribute("aria-pressed", "false");
});

test("applies the same validation as the registration", async ({ page }) => {
  await page.goto("/coordenacao/acoes/1/editar");
  await page.getByLabel("Nome da ação").fill("");
  await page.getByLabel("Link de inscrição").fill("http://forms.example/robotica");
  await save(page).click();

  await expect(page).toHaveURL("/coordenacao/acoes/1/editar");
  const name = page.getByLabel("Nome da ação");
  await expect(name).toBeFocused();
  await expect(name).toHaveAccessibleDescription("Dê um nome à ação.");
  await expect(page.getByLabel("Link de inscrição")).toHaveAccessibleDescription(/O link precisa começar com https:\/\//);
});

test("an end date before the start date is refused", async ({ page }) => {
  await page.goto("/coordenacao/acoes/2/editar");
  await page.getByLabel("Data de fim").fill("2026-11-09");
  await save(page).click();

  const end = page.getByLabel("Data de fim");
  await expect(end).toBeFocused();
  await expect(end).toHaveAccessibleDescription("A data de fim não pode ser antes da data de início.");
});

test("a failed save keeps the changes", async ({ page }) => {
  api.saveStatus = 500;
  await page.goto("/coordenacao/acoes/1/editar");
  await page.getByLabel("Nome da ação").fill("Outro nome");
  await save(page).click();

  await expect(page.getByRole("alert").filter({ hasText: "Não deu pra salvar" })).toBeVisible();
  await expect(page.getByLabel("Nome da ação")).toHaveValue("Outro nome");
});

test("an action that does not exist is the 404 page", async ({ page }) => {
  await page.goto("/coordenacao/acoes/999/editar");

  await expect(page.getByText("This page could not be found.")).toBeVisible();
  await expect(page.getByLabel("Nome da ação")).toHaveCount(0);
});

test("an id that is not a number is the 404 page", async ({ page }) => {
  await page.goto("/coordenacao/acoes/abc/editar");

  await expect(page.getByText("This page could not be found.")).toBeVisible();
});

test("the back link leaves without saving", async ({ page }) => {
  await page.goto("/coordenacao/acoes/1/editar");
  await page.getByLabel("Nome da ação").fill("Não deve salvar");
  await page.getByRole("link", { name: "Ações", exact: true }).last().click();
  await expect(page).toHaveURL(/\/coordenacao\/acoes$/);

  await page.goto("/coordenacao/acoes/1/editar");
  await expect(page.getByLabel("Nome da ação")).toHaveValue("Introdução à robótica");
});

test("has no horizontal scroll at 1366 px", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto("/coordenacao/acoes/1/editar");
  await expect(page.getByLabel("Nome da ação")).toBeVisible();

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBe(0);
});

test("saving sends the whole form to PUT, with the times as HH:MM and empty fields as null", async ({ page }) => {
  await page.goto("/coordenacao/acoes/1/editar");
  await page.getByLabel("Nome da ação").fill("Robótica para iniciantes");
  await save(page).click();
  await expect(page).toHaveURL(/salva=1$/);

  expect(api.saved).toEqual([
    {
      method: "PUT",
      id: 1,
      body: {
        name: "Robótica para iniciantes",
        type: "oficina",
        starts_on: "2026-10-24",
        ends_on: null,
        format: "in_person",
        city_ibge_code: 2704302,
        visibility: "open",
        registration_url: "https://forms.gle/rendeiras-robotica",
        starts_at_time: "14:00",
        ends_at_time: "17:00",
        address: "Campus de exemplo, Laboratório de Robótica",
        description: "Vamos montar e programar um robô simples, em dupla.",
        topics: ["robotica"],
        audiences: ["medio", "tecnico"],
      },
    },
  ]);
});

test("a server error while loading offers Tentar novamente", async ({ page }) => {
  // Fails until she taps "Tentar novamente", not only on the first call: in dev,
  // StrictMode runs the effect twice and the first request is aborted and ignored.
  let failing = true;
  await page.route("**/api/actions/1", (route) =>
    failing ? route.fulfill({ status: 500, json: { detail: "Erro" } }) : route.fallback(),
  );
  await page.goto("/coordenacao/acoes/1/editar");

  await expect(page.getByRole("main").getByRole("alert")).toContainText("Não foi possível carregar a ação.");
  failing = false;
  await page.getByRole("button", { name: "Tentar novamente" }).click();
  await expect(page.getByLabel("Nome da ação")).toHaveValue("Introdução à robótica");
});
