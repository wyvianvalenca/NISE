import { expect, test, type Page } from "@playwright/test";

// #179 · A06·4b Evento, versão "Próxima aventura". Usa os dados de teste de lib/evento.ts.

type Mock = {
  status?: Record<string, "next" | "in_progress" | "concluded">;
  today?: string;
  delayMs?: number;
};

const HACKATHON = "hackathon-meninas-na-tecnologia";
const OFICINA = "oficina-de-robotica-rendeiras";
const MINICURSO = "minicurso-de-sites";

// Com hoje em 15/out/2025, o hackathon cai em 8 e 9/nov (sábado e domingo), como no Figma.
const TODAY = "2025-10-15";

async function open(page: Page, id: string, mock: Mock = {}) {
  await page.addInitScript((value) => {
    globalThis.__NISE_MOCK_EVENTO__ = value as typeof globalThis.__NISE_MOCK_EVENTO__;
  }, { today: TODAY, ...mock });
  await page.goto(`/file/evento/${id}`);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
}

function summary(page: Page) {
  return page.getByRole("list", { name: "Quando e onde" });
}

function signUpLink(page: Page) {
  return page.getByRole("link", { name: /Ir para inscrição/ });
}

test("mostra o evento com o que o Figma pede", async ({ page }) => {
  await open(page, HACKATHON);

  await expect(page.getByRole("link", { name: "Seu filé" })).toHaveAttribute("href", "/file");
  const main = page.getByRole("main");
  await expect(main.getByText("Hackathon", { exact: true })).toBeVisible();
  await expect(main.getByText("Próxima aventura")).toBeVisible();
  await expect(main.getByText("Programação · Grande desafio")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1, name: "Hackathon Meninas na Tecnologia" })).toBeVisible();
  await expect(main.getByText("Organizado por um grupo parceiro")).toBeVisible();

  await expect(summary(page).getByRole("listitem")).toHaveText([
    "8 e 9 de novembroSábado e domingo",
    "MaceióLocal divulgado na inscrição",
    "Inscrições até 30 de outubroFaltam 15 dias",
  ]);

  const chips = page.getByRole("list", { name: "Detalhes" }).getByRole("listitem");
  await expect(chips).toHaveText(["Grátis", "Ensino médio", "Não precisa saber programar"]);

  await expect(
    main.getByText("A inscrição é feita no site dos organizadores. Seus dados da NISE não são enviados."),
  ).toBeVisible();
});

test("evento de um grupo da NISE diz qual grupo organiza", async ({ page }) => {
  await open(page, OFICINA);

  await expect(page.getByText("Organizado pelas Rendeiras do Código · grupo da NISE")).toBeVisible();
  await expect(summary(page).getByRole("listitem").first()).toHaveText(/^21 de outubroTerça$/);
});

test("no último dia das inscrições, avisa que é hoje", async ({ page }) => {
  await open(page, OFICINA);

  await expect(summary(page).getByText("Hoje é o último dia")).toBeVisible();
});

test("com as inscrições fechadas, o evento continua abrindo do filé (RN-36)", async ({ page }) => {
  await open(page, MINICURSO);

  await expect(summary(page).getByRole("listitem")).toHaveText([
    "19 a 21 de outubroDe domingo a terça",
    "OnlineLink divulgado na inscrição",
    "Inscrições foram até 12 de outubroAs inscrições já fecharam",
  ]);
  const chips = page.getByRole("list", { name: "Detalhes" }).getByRole("listitem");
  await expect(chips).toHaveText(["R$ 20", "Ter um computador"]);
});

test("\"Ir para inscrição\" abre o site do grupo em outra aba e não muda o status", async ({ page }) => {
  await open(page, HACKATHON);

  await expect(signUpLink(page)).toHaveAttribute(
    "href",
    "https://example.com/eventos/hackathon-meninas-na-tecnologia",
  );
  await expect(signUpLink(page)).toHaveAttribute("target", "_blank");
  await expect(signUpLink(page)).toHaveAttribute("rel", "noopener noreferrer");
  await expect(signUpLink(page)).toContainText("(abre em outra aba)");

  // Não sai para a internet no teste: a outra aba recebe uma página vazia.
  await page.context().route("https://example.com/**", (route) => route.fulfill({ body: "ok" }));
  const [popup] = await Promise.all([page.waitForEvent("popup"), signUpLink(page).click()]);
  await popup.close();

  await expect(page.getByRole("main").getByText("Próxima aventura")).toBeVisible();
});

test("\"Já me inscrevi\" e \"Tirar do filé\" estão disponíveis (#182)", async ({ page }) => {
  await open(page, HACKATHON);

  await expect(page.getByRole("button", { name: "Já me inscrevi" })).toBeEnabled();
  // Texto em ink (#0a3b48) sobre o papel; teal ali dava 4,26:1, abaixo do AA.
  await expect(page.getByRole("button", { name: "Já me inscrevi" })).toHaveCSS("color", "rgb(10, 59, 72)");
  await expect(page.getByRole("button", { name: "Tirar do filé" })).toBeEnabled();
});

test("um evento que não está no filé dela não abre", async ({ page }) => {
  await page.goto("/file/evento/evento-de-outra-menina");

  await expect(page.getByText("Esse evento não está no seu filé.")).toBeVisible();
});

test("mostra \"Carregando…\" enquanto o evento chega", async ({ page }) => {
  await page.addInitScript(() => {
    globalThis.__NISE_MOCK_EVENTO__ = { delayMs: 600 };
  });
  await page.goto(`/file/evento/${HACKATHON}`);

  await expect(page.getByText("Carregando…")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});

test("\"Abrir\" do hackathon no filé leva a esta tela", async ({ page }) => {
  await page.goto("/file");
  await page.getByRole("link", { name: "Abrir: Hackathon Meninas na Tecnologia" }).click();

  await expect(page).toHaveURL(`/file/evento/${HACKATHON}`);
  await expect(page.getByRole("heading", { level: 1, name: "Hackathon Meninas na Tecnologia" })).toBeVisible();
});

test("dá para usar pelo teclado, com o foco visível", async ({ page }) => {
  await open(page, HACKATHON);

  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Seu filé" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(signUpLink(page)).toBeFocused();
  const outline = await signUpLink(page).evaluate((element) => getComputedStyle(element).outlineStyle);
  expect(outline).not.toBe("none");
});

for (const width of [360, 1366]) {
  test(`cabe em ${width}px sem rolagem lateral`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await open(page, HACKATHON);

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(overflow).toBe(false);
    await expect(signUpLink(page)).toBeVisible();
  });
}
