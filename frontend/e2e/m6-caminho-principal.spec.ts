import { expect, test, type Page } from "@playwright/test";

/**
 * E2E · M6 event sign-up, main path (#198). Covers #178, #182, #186, #190 and #194.
 *
 * The routes of the back-end (#180, #184, #188, #192, #196) do not exist yet, so the
 * screens use the test data of lib/evento.ts and lib/file.ts. The test base links the
 * two, as the back-end will: the items of the filé come from the status that the event
 * screens save (the "banco" of lib/evento.ts, in the sessionStorage of the tab). So
 * what she does on an event shows up in the right section of her filé.
 *
 * The data is fictional (never real data of a girl): an outside event and a NISE group
 * event in her "Próximas aventuras", and one of each that already happened, with her
 * signed up. "Today" is fixed, so the dates do not depend on the clock. The dates of
 * the test data are counted from "today", so one event cannot cross its date in a test:
 * the paths after the date use the events that already happened.
 */

type EventStatus = "next" | "in_progress" | "concluded";

/** The four events of the test base, with the ids of lib/evento.ts. */
const OUTSIDE = "hackathon-meninas-na-tecnologia";
const GROUP = "oficina-de-robotica-rendeiras";
const OUTSIDE_PAST = "hackathon-cidades-inteligentes";
const GROUP_PAST = "oficina-de-jogos-rendeiras";

// With today on 15/oct/2025, the outside event is on 8 and 9/nov and its sign-up ends on 30/oct.
const TODAY = "2025-10-15";

const START_STATUS: Record<string, EventStatus> = {
  [OUTSIDE]: "next",
  [GROUP]: "next",
  [OUTSIDE_PAST]: "in_progress",
  [GROUP_PAST]: "in_progress",
};

/** An item of her filé, in the shape of lib/file.ts, without the status: it comes from the base. */
type FileItem = {
  id: string;
  title: string;
  theme: "programacao" | "robotica" | "jogos";
  type: string;
  details: string;
  deadline?: string;
};

/** Her filé: the four events. */
const FILE_ITEMS: FileItem[] = [
  {
    id: OUTSIDE,
    title: "Hackathon Meninas na Tecnologia",
    theme: "programacao",
    type: "Hackathon",
    details: "Presencial · Maceió",
    deadline: "2025-10-30",
  },
  {
    id: GROUP,
    title: "Oficina de robótica com sucata",
    theme: "robotica",
    type: "Oficina",
    details: "Presencial · Arapiraca",
    deadline: TODAY,
  },
  {
    id: OUTSIDE_PAST,
    title: "Hackathon Cidades Inteligentes",
    theme: "programacao",
    type: "Hackathon",
    details: "Presencial · Maceió",
  },
  {
    id: GROUP_PAST,
    title: "Oficina de jogos com Scratch",
    theme: "jogos",
    type: "Oficina",
    details: "Presencial · Maceió",
  },
];

// The key of the "banco" of lib/evento.ts.
const STORAGE_KEY = "nise-mock-evento";

async function serve(page: Page): Promise<void> {
  // Never goes out to the internet: the sign-up site opens as an empty page.
  await page.context().route("https://example.com/**", (route) => route.fulfill({ body: "ok" }));

  await page.addInitScript(
    ({ today, status, items, key }) => {
      globalThis.__NISE_MOCK_EVENTO__ = { today, status };

      const fileStatus = { next: "proxima", in_progress: "em-andamento", concluded: "concluido" } as const;
      globalThis.__NISE_MOCK_FILE__ = {
        // Read on every load of the filé, like the route of #114 will.
        get items() {
          const saved = sessionStorage.getItem(key);
          const base = saved
            ? (JSON.parse(saved) as { status: Record<string, EventStatus>; removed: string[] })
            : { status, removed: [] };
          return items
            .filter((item) => !base.removed.includes(item.id))
            .map((item) => ({
              ...item,
              kind: "event" as const,
              status: fileStatus[base.status[item.id] ?? status[item.id]],
            }));
        },
      };
    },
    { today: TODAY, status: START_STATUS, items: FILE_ITEMS, key: STORAGE_KEY },
  );
}

/** The coordinator saves the attendance of the NISE group event (#135): present or absent. */
async function saveAttendance(page: Page, id: string, present: boolean): Promise<void> {
  await page.evaluate(
    ({ id, present, status, key }) => {
      const saved = sessionStorage.getItem(key);
      const base = saved ? JSON.parse(saved) : { status, removed: [] };
      if (present) base.status[id] = "concluded";
      else base.removed.push(id);
      sessionStorage.setItem(key, JSON.stringify(base));
    },
    { id, present, status: START_STATUS, key: STORAGE_KEY },
  );
}

function section(page: Page, name: string) {
  return page.getByRole("region", { name });
}

async function openFile(page: Page) {
  await page.goto("/file");
  await expect(page.getByRole("heading", { level: 1, name: "Seu filé" })).toBeVisible();
}

async function backToFile(page: Page) {
  await page.getByRole("link", { name: "Seu filé" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Seu filé" })).toBeVisible();
}

function button(page: Page, name: string) {
  return page.getByRole("button", { name, exact: true });
}

/** The status chip on the detail: "Status: " is there for screen readers. */
function statusChip(page: Page) {
  return page.getByRole("main").getByText(/^Status: (Próxima aventura|Em andamento|Concluído)$/);
}

function signedUpToast(page: Page) {
  return page.getByRole("status").filter({ hasText: /inscrita|desfazer/i });
}

function didNotGoToast(page: Page) {
  return page.getByRole("status").filter({ hasText: /saiu do seu filé|desfazer/i });
}

async function expectNoSideScroll(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
}

for (const width of [360, 1366]) {
  test.describe(`M6 main path at ${width}px`, () => {
    test.use({ viewport: { width, height: 900 } });

    test("the event: from Abrir, the dates, city, deadline and notice; the site opens in a new tab", async ({
      page,
    }) => {
      await serve(page);
      await openFile(page);

      await section(page, "Próximas aventuras")
        .getByRole("link", { name: "Abrir: Hackathon Meninas na Tecnologia" })
        .click();

      await expect(page).toHaveURL(`/file/evento/${OUTSIDE}`);
      await expect(page.getByRole("heading", { level: 1, name: "Hackathon Meninas na Tecnologia" })).toBeVisible();
      await expect(statusChip(page)).toHaveText("Status: Próxima aventura");
      await expect(page.getByRole("list", { name: "Quando e onde" }).getByRole("listitem")).toHaveText([
        "8 e 9 de novembroSábado e domingo",
        "MaceióLocal divulgado na inscrição",
        "Inscrições até 30 de outubroFaltam 15 dias",
      ]);
      await expect(page.getByText("Seus dados da NISE não são enviados.", { exact: false })).toBeVisible();
      await expectNoSideScroll(page);

      const signUp = page.getByRole("link", { name: /Ir para inscrição/ });
      await expect(signUp).toHaveAttribute("target", "_blank");
      const [popup] = await Promise.all([page.waitForEvent("popup"), signUp.click()]);
      await expect(popup).toHaveURL("https://example.com/eventos/hackathon-meninas-na-tecnologia");
      await popup.close();

      // Opening the site changes nothing: still a "Próxima aventura", here and in the filé.
      await expect(statusChip(page)).toHaveText("Status: Próxima aventura");
      await backToFile(page);
      await expect(section(page, "Próximas aventuras").getByRole("article")).toHaveCount(2);
      await expect(section(page, "Em andamento").getByRole("article")).toHaveCount(2);

      // The NISE group event says which group runs it, and that today is the last day.
      await section(page, "Próximas aventuras")
        .getByRole("link", { name: "Abrir: Oficina de robótica com sucata" })
        .click();
      await expect(page.getByText("Organizado pelas Rendeiras do Código · grupo da NISE")).toBeVisible();
      await expect(page.getByRole("list", { name: "Quando e onde" })).toContainText(
        "Inscrições até 15 de outubroHoje é o último dia",
      );
    });

    test("signing up: back from the site, Sim, me inscrevi moves it to Em andamento", async ({ page }) => {
      await serve(page);
      await openFile(page);
      await page.getByRole("link", { name: "Abrir: Hackathon Meninas na Tecnologia" }).click();

      const [popup] = await Promise.all([
        page.waitForEvent("popup"),
        page.getByRole("link", { name: /Ir para inscrição/ }).click(),
      ]);
      await popup.close();
      // Back on the tab of the NISE: the browser says the page is visible again.
      await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));

      await expect(page).toHaveURL(`/file/evento/${OUTSIDE}/inscricao`);
      await expect(page.getByRole("heading", { level: 1, name: "Conseguiu se inscrever?" })).toBeVisible();
      await expectNoSideScroll(page);
      await button(page, "Sim, me inscrevi").click();

      await expect(page).toHaveURL(`/file/evento/${OUTSIDE}`);
      await expect(statusChip(page)).toHaveText("Status: Em andamento");
      await expect(page.getByRole("main").getByText("Inscrita", { exact: true })).toBeVisible();
      await expect(signedUpToast(page)).toContainText("Você tá inscrita! Agora é só esperar o dia.");

      await backToFile(page);
      await expect(
        section(page, "Em andamento").getByRole("link", { name: "Continuar: Hackathon Meninas na Tecnologia" }),
      ).toBeVisible();
      await expect(section(page, "Próximas aventuras")).not.toContainText("Hackathon Meninas na Tecnologia");
    });

    test("undo and removal: Desfazer, Já me inscrevi and Tirar do filé", async ({ page }) => {
      await serve(page);
      // She reopens the NISE after the site: the A09 opens with a new load.
      await page.goto(`/file/evento/${OUTSIDE}/inscricao`);
      await button(page, "Sim, me inscrevi").click();
      await expect(page).toHaveURL(`/file/evento/${OUTSIDE}`);
      await expect(page.getByRole("main").getByText("Inscrita", { exact: true })).toBeVisible();
      await expect(signedUpToast(page)).toContainText("Você tá inscrita! Agora é só esperar o dia.");
      await expectNoSideScroll(page);

      // "Desfazer" brings it back to "Próximas aventuras".
      await signedUpToast(page).getByRole("button", { name: "Desfazer" }).click();
      await expect(signedUpToast(page)).toHaveCount(0);
      await expect(statusChip(page)).toHaveText("Status: Próxima aventura");
      await backToFile(page);
      await expect(
        section(page, "Próximas aventuras").getByRole("link", { name: "Abrir: Hackathon Meninas na Tecnologia" }),
      ).toBeVisible();

      // "Já me inscrevi" on the detail: the same as "Sim, me inscrevi".
      await page.getByRole("link", { name: "Abrir: Hackathon Meninas na Tecnologia" }).click();
      await button(page, "Já me inscrevi").click();
      await expect(statusChip(page)).toHaveText("Status: Em andamento");
      await expect(page.getByRole("main").getByText("Inscrita", { exact: true })).toBeVisible();
      await expect(signedUpToast(page)).toContainText("Você tá inscrita!");
      await backToFile(page);
      await expect(
        section(page, "Em andamento").getByRole("link", { name: "Continuar: Hackathon Meninas na Tecnologia" }),
      ).toBeVisible();

      // "Tirar do filé" takes it out.
      await page.getByRole("link", { name: "Continuar: Hackathon Meninas na Tecnologia" }).click();
      await button(page, "Tirar do filé").click();
      await expect(page).toHaveURL("/file");
      await expect(page.getByRole("main")).not.toContainText("Hackathon Meninas na Tecnologia");
      await page.goto(`/file/evento/${OUTSIDE}`);
      await expect(page.getByText("Esse evento não está no seu filé.")).toBeVisible();
    });

    test("[Should] the reminder: Me lembra um dia antes stays saved", async ({ page }) => {
      await serve(page);
      await page.goto(`/file/evento/${OUTSIDE}`);
      await button(page, "Já me inscrevi").click();

      const reminder = page.getByRole("checkbox", { name: /Me lembra um dia antes/ });
      await expect(reminder).not.toBeChecked();
      await expect(page.getByText("Um e-mail só, no dia 7 de novembro. Opcional.")).toBeVisible();
      await reminder.check();

      // Back from the filé, the choice is still there. Sending the e-mail is the back-end (#188).
      await backToFile(page);
      await page.getByRole("link", { name: "Continuar: Hackathon Meninas na Tecnologia" }).click();
      await expect(reminder).toBeChecked();
      await expectNoSideScroll(page);
    });

    test("outside event, went: Fui! moves it to Concluídos, colored, with the celebration", async ({ page }) => {
      await serve(page);
      await openFile(page);
      const drawing = page.getByRole("img", { name: /^Seu filé:/ });
      await expect(drawing).toHaveAccessibleName("Seu filé: 0 concluídos, 2 em andamento e 2 próximas aventuras.");
      await expect(drawing.locator('rect[fill^="var(--nise-theme"]')).toHaveCount(0);

      await section(page, "Em andamento")
        .getByRole("link", { name: "Continuar: Hackathon Cidades Inteligentes" })
        .click();
      await expect(page.getByRole("heading", { level: 2, name: "Você foi ao hackathon?" })).toBeVisible();
      await expect(page.getByRole("list", { name: "Quando e onde" })).toContainText("Foi em 7 e 8 de outubro");
      await expectNoSideScroll(page);
      await button(page, "Fui!").click();

      await expect(page).toHaveURL(`/file/evento/${OUTSIDE_PAST}/concluido`);
      await expect(page.getByRole("heading", { level: 1, name: "Você conseguiu, Alana!" })).toBeVisible();
      await expect(page.locator("p", { hasText: "Hackathon Cidades Inteligentes" })).toBeVisible();

      await page.getByRole("link", { name: "Fechar" }).click();
      await expect(page.getByRole("heading", { level: 1, name: "Seu filé" })).toBeVisible();
      await expect(drawing).toHaveAccessibleName("Seu filé: 1 concluído, 1 em andamento e 2 próximas aventuras.");
      await expect(drawing.locator('rect[fill="var(--nise-theme-programacao)"]')).toHaveCount(1);
      await page.getByRole("button", { name: "Mostrar Concluídos" }).click();
      await expect(
        section(page, "Concluídos").getByRole("link", { name: "Ver: Hackathon Cidades Inteligentes" }),
      ).toBeVisible();
    });

    test("outside event, did not go: Não deu takes it off, and Desfazer brings the question back", async ({
      page,
    }) => {
      await serve(page);
      await openFile(page);
      await page.getByRole("link", { name: "Continuar: Hackathon Cidades Inteligentes" }).click();

      await button(page, "Não deu").click();

      await expect(page).toHaveURL("/file");
      await expect(didNotGoToast(page)).toContainText("Hackathon Cidades Inteligentes saiu do seu filé.");
      await expect(page.getByRole("main")).not.toContainText("Hackathon Cidades Inteligentes");
      await expectNoSideScroll(page);

      await didNotGoToast(page).getByRole("button", { name: "Desfazer" }).click();

      await expect(page).toHaveURL(`/file/evento/${OUTSIDE_PAST}`);
      await expect(page.getByRole("heading", { level: 2, name: "Você foi ao hackathon?" })).toBeVisible();
      await backToFile(page);
      await expect(
        section(page, "Em andamento").getByRole("link", { name: "Continuar: Hackathon Cidades Inteligentes" }),
      ).toBeVisible();
    });

    test("NISE group event: waits for the attendance, and goes to Concluídos when she is present", async ({
      page,
    }) => {
      await serve(page);
      await openFile(page);
      await page.getByRole("link", { name: "Continuar: Oficina de jogos com Scratch" }).click();

      await expect(page.getByText("Organizado pelas Rendeiras do Código · grupo da NISE")).toBeVisible();
      await expect(page.getByRole("list", { name: "Quando e onde" })).toContainText(
        "Esperando a lista de presençaQuando o grupo marcar, ele vai pros concluídos do seu filé",
      );
      // No answer from her: the attendance is the coordinator's.
      await expect(page.getByRole("main").getByRole("button")).toHaveCount(0);
      await expectNoSideScroll(page);

      await saveAttendance(page, GROUP_PAST, true);

      await page.reload();
      await expect(statusChip(page)).toHaveText("Status: Concluído");
      await backToFile(page);
      const drawing = page.getByRole("img", { name: /^Seu filé:/ });
      await expect(drawing).toHaveAccessibleName("Seu filé: 1 concluído, 1 em andamento e 2 próximas aventuras.");
      // Jogos has no color in the Figma yet: its concluded square uses the neutral one (lib/file.ts).
      await expect(drawing.locator('rect[fill="var(--nise-muted)"]')).toHaveCount(1);
      await page.getByRole("button", { name: "Mostrar Concluídos" }).click();
      await expect(
        section(page, "Concluídos").getByRole("link", { name: "Ver: Oficina de jogos com Scratch" }),
      ).toBeVisible();
      await expect(section(page, "Em andamento")).not.toContainText("Oficina de jogos com Scratch");
    });

    test("NISE group event: leaves the filé when she is absent", async ({ page }) => {
      await serve(page);
      await page.goto(`/file/evento/${GROUP_PAST}`);
      await expect(page.getByText("Esperando a lista de presença")).toBeVisible();

      await saveAttendance(page, GROUP_PAST, false);

      await page.reload();
      await expect(page.getByText("Esse evento não está no seu filé.")).toBeVisible();
      await openFile(page);
      await expect(page.getByRole("main")).not.toContainText("Oficina de jogos com Scratch");
    });
  });
}
