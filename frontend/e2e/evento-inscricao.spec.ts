import { expect, test, type Page } from "@playwright/test";

// #183 · A09 "Conseguiu se inscrever?" e a versão "Inscrita" da A06·4b.
// Usa os dados de teste de lib/evento.ts.

type Mock = {
  status?: Record<string, "next" | "in_progress" | "concluded">;
  today?: string;
  delayMs?: number;
  failUpdates?: boolean;
  failUndo?: boolean;
};

const HACKATHON = "hackathon-meninas-na-tecnologia";
const OFICINA = "oficina-de-robotica-rendeiras";
const EVENT_PATH = `/file/evento/${HACKATHON}`;
const CHECK_PATH = `${EVENT_PATH}/inscricao`;

// Com hoje em 15/out/2025, o hackathon cai em 8 e 9/nov e as inscrições vão até 30/out.
const TODAY = "2025-10-15";

async function mock(page: Page, value: Mock = {}) {
  await page.addInitScript((mockValue) => {
    globalThis.__NISE_MOCK_EVENTO__ = mockValue as typeof globalThis.__NISE_MOCK_EVENTO__;
  }, { today: TODAY, ...value });
}

async function open(page: Page, path: string, value: Mock = {}) {
  await mock(page, value);
  await page.goto(path);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
}

function button(page: Page, name: string) {
  return page.getByRole("button", { name, exact: true });
}

function toast(page: Page) {
  return page.getByRole("status").filter({ hasText: /inscrita|desfazer/i });
}

test.describe("volta do site de inscrição", () => {
  test("ao voltar do site, a A09 pergunta se ela conseguiu", async ({ page }) => {
    await open(page, EVENT_PATH);
    await page.context().route("https://example.com/**", (route) => route.fulfill({ body: "ok" }));

    const [popup] = await Promise.all([
      page.waitForEvent("popup"),
      page.getByRole("link", { name: /Ir para inscrição/ }).click(),
    ]);
    await popup.close();
    // Volta para a aba da NISE: o navegador avisa que a página ficou visível de novo.
    await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));

    await expect(page).toHaveURL(CHECK_PATH);
    await expect(page.getByRole("heading", { level: 1, name: "Conseguiu se inscrever?" })).toBeVisible();
  });

  test("na mesma aba, \"Sim, me inscrevi\" volta ao evento com o aviso", async ({ page }) => {
    await open(page, EVENT_PATH);
    await page.context().route("https://example.com/**", (route) => route.fulfill({ body: "ok" }));

    const [popup] = await Promise.all([
      page.waitForEvent("popup"),
      page.getByRole("link", { name: /Ir para inscrição/ }).click(),
    ]);
    await popup.close();
    await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
    await expect(page).toHaveURL(CHECK_PATH);

    // O evento já foi aberto nesta aba, então o Next reaproveita a tela montada.
    await button(page, "Sim, me inscrevi").click();

    await expect(page).toHaveURL(EVENT_PATH);
    await expect(page.getByRole("main").getByText("Inscrita", { exact: true })).toBeVisible();
    await expect(toast(page)).toContainText("Você tá inscrita! Agora é só esperar o dia.");
  });

  test("sem ter ido ao site, voltar à aba não abre a A09", async ({ page }) => {
    await open(page, EVENT_PATH);

    await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));

    await expect(page).toHaveURL(EVENT_PATH);
  });

  test("reabrir o evento depois de ir ao site também pergunta, uma vez só", async ({ page }) => {
    await open(page, EVENT_PATH);
    await page.evaluate((id) => sessionStorage.setItem("nise-saiu-para-inscricao", id), HACKATHON);

    await page.reload();
    await expect(page).toHaveURL(CHECK_PATH);

    await page.getByRole("link", { name: "Ainda não" }).click();
    await expect(page).toHaveURL(EVENT_PATH);
    await expect(page.getByRole("main").getByText("Próxima aventura")).toBeVisible();
  });
});

test.describe("A09", () => {
  test("mostra o evento, a pergunta, o prazo e o aviso da RN-19", async ({ page }) => {
    await open(page, CHECK_PATH);

    await expect(page.getByRole("link", { name: "Evento" })).toHaveAttribute("href", EVENT_PATH);
    const main = page.getByRole("main");
    await expect(main.getByText("Grupo parceiro")).toBeVisible();
    await expect(main.getByText("Hackathon Meninas na Tecnologia")).toBeVisible();
    await expect(main.getByText("8 e 9 de nov · Maceió")).toBeVisible();
    await expect(main.getByText("Você foi pro site dos organizadores.", { exact: false })).toBeVisible();
    await expect(page.getByRole("list", { name: "Prazo" })).toHaveText(
      "Inscrições até 30 de outFaltam 15 dias, dá tempo de voltar depois",
    );
    await expect(main.getByText("Seus dados da NISE não são enviados pra lá.", { exact: false })).toBeVisible();
  });

  test("num evento de grupo da NISE, fala do site do grupo", async ({ page }) => {
    await open(page, `/file/evento/${OFICINA}/inscricao`);

    await expect(page.getByText("Você foi pro site das Rendeiras do Código.", { exact: false })).toBeVisible();
    await expect(page.getByRole("list", { name: "Prazo" })).toContainText("Hoje é o último dia");
  });

  test("\"Sim, me inscrevi\" marca \"Inscrita\" e abre o evento com o aviso", async ({ page }) => {
    await open(page, CHECK_PATH);

    await button(page, "Sim, me inscrevi").click();

    await expect(page).toHaveURL(EVENT_PATH);
    const main = page.getByRole("main");
    await expect(main.getByText("Em andamento")).toBeVisible();
    await expect(main.getByText("Inscrita", { exact: true })).toBeVisible();
    await expect(toast(page)).toContainText("Você tá inscrita! Agora é só esperar o dia.");
  });

  test("\"Ainda não\" volta ao evento, que continua em \"Próximas aventuras\"", async ({ page }) => {
    await open(page, CHECK_PATH);

    await page.getByRole("link", { name: "Ainda não" }).click();

    await expect(page).toHaveURL(EVENT_PATH);
    await expect(page.getByRole("main").getByText("Próxima aventura")).toBeVisible();
  });

  test("\"Abrir o site de novo\" abre o link em outra aba", async ({ page }) => {
    await open(page, CHECK_PATH);

    const again = page.getByRole("link", { name: /Abrir o site de novo/ });
    await expect(again).toHaveAttribute("href", "https://example.com/eventos/hackathon-meninas-na-tecnologia");
    await expect(again).toHaveAttribute("target", "_blank");
    // Texto em ink sobre o papel; teal ali dava 4,26:1, abaixo do AA.
    await expect(again).toHaveCSS("color", "rgb(10, 59, 72)");
  });

  test("se o envio falha, avisa e ela pode tentar de novo no mesmo lugar (RF-S2.15)", async ({ page }) => {
    await open(page, CHECK_PATH, { failUpdates: true });

    await button(page, "Sim, me inscrevi").click();

    await expect(page.getByRole("main").getByRole("alert")).toHaveText("Não deu pra enviar. Tente de novo.");
    await expect(page).toHaveURL(CHECK_PATH);
    await expect(button(page, "Sim, me inscrevi")).toBeEnabled();
  });

  test("um evento já marcado não pergunta de novo: abre o evento", async ({ page }) => {
    await mock(page, { status: { [HACKATHON]: "in_progress" } });
    await page.goto(CHECK_PATH);

    await expect(page).toHaveURL(EVENT_PATH);
    await expect(page.getByRole("main").getByText("Inscrita", { exact: true })).toBeVisible();
  });
});

test.describe("detalhe do evento", () => {
  test("\"Já me inscrevi\" tem o mesmo resultado de \"Sim, me inscrevi\"", async ({ page }) => {
    await open(page, EVENT_PATH);

    await button(page, "Já me inscrevi").click();

    const main = page.getByRole("main");
    await expect(main.getByText("Em andamento")).toBeVisible();
    await expect(main.getByText("Inscrita", { exact: true })).toBeVisible();
    await expect(toast(page)).toContainText("Você tá inscrita!");
    await expect(page.getByRole("heading", { level: 1 })).toBeFocused();
  });

  test("a versão \"Inscrita\" mostra quando falta e onde, e só \"Tirar do filé\"", async ({ page }) => {
    await open(page, EVENT_PATH, { status: { [HACKATHON]: "in_progress" } });

    await expect(page.getByRole("list", { name: "Quando e onde" }).getByRole("listitem")).toHaveText([
      "8 e 9 de novembroSábado e domingo · faltam 24 dias",
      "MaceióO local chega no e-mail das organizadoras",
    ]);
    await expect(page.getByRole("link", { name: /Ir para inscrição/ })).toHaveCount(0);
    await expect(page.getByRole("main").getByRole("button")).toHaveText(["Tirar do filé"]);
    // Sem vir da A09, o aviso não aparece.
    await expect(toast(page)).toHaveCount(0);
  });

  test("\"Desfazer\" volta o evento para \"Próxima aventura\"", async ({ page }) => {
    await open(page, EVENT_PATH);
    await button(page, "Já me inscrevi").click();

    await toast(page).getByRole("button", { name: "Desfazer" }).click();

    await expect(toast(page)).toHaveCount(0);
    await expect(page.getByRole("main").getByText("Próxima aventura")).toBeVisible();
    await expect(button(page, "Já me inscrevi")).toBeEnabled();
  });

  test("se desfazer falha, avisa e deixa tentar de novo", async ({ page }) => {
    await open(page, EVENT_PATH, { failUndo: true });
    await button(page, "Já me inscrevi").click();

    await toast(page).getByRole("button", { name: "Desfazer" }).click();

    await expect(toast(page)).toContainText("Não deu pra desfazer.");
    await expect(toast(page).getByRole("button", { name: "Tentar de novo" })).toBeVisible();
    await expect(page.getByRole("main").getByText("Inscrita", { exact: true })).toBeVisible();
  });

  test("o aviso some sozinho depois de uns 5 segundos", async ({ page }) => {
    await page.clock.install();
    await open(page, EVENT_PATH);
    await button(page, "Já me inscrevi").click();
    await expect(toast(page)).toBeVisible();

    await page.mouse.move(0, 0);
    await page.clock.runFor(5100);

    await expect(toast(page)).toHaveCount(0);
    await expect(page.getByRole("main").getByText("Inscrita", { exact: true })).toBeVisible();
  });

  for (const status of ["next", "in_progress"] as const) {
    test(`"Tirar do filé" tira o evento (${status}) e leva ao filé`, async ({ page }) => {
      await open(page, EVENT_PATH, { status: { [HACKATHON]: status } });

      await button(page, "Tirar do filé").click();

      await expect(page).toHaveURL("/file");
      await page.goto(EVENT_PATH);
      await expect(page.getByText("Esse evento não está no seu filé.")).toBeVisible();
    });
  }

  test("se marcar falha, avisa e ela pode tentar de novo", async ({ page }) => {
    await open(page, EVENT_PATH, { failUpdates: true });

    await button(page, "Já me inscrevi").click();

    await expect(page.getByRole("main").getByRole("alert")).toHaveText("Não deu pra enviar. Tente de novo.");
    await expect(page.getByRole("main").getByText("Próxima aventura")).toBeVisible();
  });

  test("dá para usar o aviso pelo teclado, com o foco visível", async ({ page }) => {
    await open(page, EVENT_PATH);
    await button(page, "Já me inscrevi").click();

    // O foco está no título; o aviso é o último na ordem do Tab.
    const undo = toast(page).getByRole("button", { name: "Desfazer" });
    for (let step = 0; step < 6 && !(await undo.evaluate((element) => element === document.activeElement)); step++) {
      await page.keyboard.press("Tab");
    }
    await expect(undo).toBeFocused();
    const outline = await undo.evaluate((element) => getComputedStyle(element).outlineStyle);
    expect(outline).not.toBe("none");
    await page.keyboard.press("Enter");
    await expect(page.getByRole("main").getByText("Próxima aventura")).toBeVisible();
  });
});

for (const width of [360, 1366]) {
  test(`A09 e a versão "Inscrita" cabem em ${width}px sem rolagem lateral`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await open(page, CHECK_PATH);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
    await expect(button(page, "Sim, me inscrevi")).toBeInViewport();

    await button(page, "Sim, me inscrevi").click();
    await expect(toast(page)).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
  });
}
