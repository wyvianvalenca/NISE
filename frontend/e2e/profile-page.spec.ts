import { expect, test, type Page } from "@playwright/test";
import { mockProfileCourseApi } from "./perfil-api";
import { mockTermsApi } from "./terms-api";

// #391 · A10 "Perfil": conta, interesses, grupo, e-mails, termos e sair. As
// rotas do perfil são simuladas (perfil-api.ts). Dados fictícios.

const PROFILE = "/perfil";

const GOOGLE_ACCOUNT = { hasPassword: false, google: true, email: "alana@exemplo.gmail.com" };
const GROUP_ORIGIN = { origin: { kind: "group", groupName: "Rendeiras do Código" } } as const;

function overflow(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
}

// O botão "Mudar senha" é da #395 e fica escondido até a tela existir (senão levaria a um 404).
test("conta com e-mail e senha: dados, cidade e a linha Senha, sem o botão Mudar senha", async ({
  page,
}) => {
  await mockProfileCourseApi(page);
  await page.goto(PROFILE);

  await expect(page.getByRole("heading", { name: "Perfil", level: 1 })).toBeVisible();
  await expect(
    page.getByText("Sua conta, seu grupo e o que a NISE manda pra você."),
  ).toBeVisible();
  await expect(page.getByText("Alana Ficticia", { exact: true })).toBeVisible();
  await expect(page.getByText("alana@exemplo.com")).toBeVisible();
  await expect(page.getByText("Maceió, AL")).toBeVisible();
  await expect(page.getByText("Você entra com e-mail e senha.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Mudar senha" })).toHaveCount(0);
  await expect(page.getByAltText("Conta Google")).toHaveCount(0);
});

test("conta Google sem senha: logo do Google e sem Mudar senha", async ({ page }) => {
  await mockProfileCourseApi(page, { details: GOOGLE_ACCOUNT });
  await page.goto(PROFILE);

  await expect(page.getByText("alana@exemplo.gmail.com")).toBeVisible();
  await expect(page.getByAltText("Conta Google")).toBeVisible();
  await expect(page.getByRole("link", { name: "Mudar senha" })).toHaveCount(0);
  await expect(page.getByText("Você entra com e-mail e senha.")).toHaveCount(0);
});

test("conta mista mostra o logo do Google e a linha Senha, sem o botão Mudar senha", async ({ page }) => {
  await mockProfileCourseApi(page, { details: { google: true } });
  await page.goto(PROFILE);

  await expect(page.getByAltText("Conta Google")).toBeVisible();
  await expect(page.getByText("Você entra com e-mail e senha.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Mudar senha" })).toHaveCount(0);
});

test("interesses aparecem como chips só de leitura, com Editar", async ({ page }) => {
  await mockProfileCourseApi(page);
  await page.goto(PROFILE);

  const card = page.getByRole("region", { name: "O que te interessa" });
  await expect(card.getByText("Programação", { exact: true })).toBeVisible();
  await expect(card.getByText("Robótica", { exact: true })).toBeVisible();
  await expect(card.getByRole("button")).toHaveCount(0);
  await expect(card.getByText("Momento de estudo: Ensino médio")).toBeVisible();
  await expect(card.getByText("Suas sugestões levam isso em conta.")).toBeVisible();
  await expect(card.getByRole("link", { name: "Editar" })).toHaveAttribute(
    "href",
    "/perfil/interesses",
  );
});

test('"Ainda não sei, me mostra de tudo" aparece como chip', async ({ page }) => {
  await mockProfileCourseApi(page, { details: { allTopics: true, topics: [] } });
  await page.goto(PROFILE);

  await expect(
    page.getByRole("region", { name: "O que te interessa" }).getByText(
      "Ainda não sei, me mostra de tudo",
    ),
  ).toBeVisible();
});

test("veio por convite: nome do grupo e quem vê os dados", async ({ page }) => {
  await mockProfileCourseApi(page, { details: GROUP_ORIGIN });
  await page.goto(PROFILE);

  const card = page.getByRole("region", { name: "Seu grupo" });
  await expect(card.getByText("Rendeiras do Código")).toBeVisible();
  await expect(card.getByText("Você chegou pelo convite delas")).toBeVisible();
  await expect(
    card.getByText(/A liderança do grupo vê seu filé, suas respostas aos questionários/),
  ).toBeVisible();
  await expect(card.getByText(/Outros grupos só veem números gerais/)).toBeVisible();
});

test("sem grupo: não diz que um grupo vai aparecer", async ({ page }) => {
  await mockProfileCourseApi(page);
  await page.goto(PROFILE);

  const card = page.getByRole("region", { name: "Seu grupo" });
  await expect(card.getByText("Você ainda não está num grupo")).toBeVisible();
  await expect(
    card.getByText("Os grupos só veem números gerais seus, sem identificar você."),
  ).toBeVisible();
  await expect(page.getByText(/o grupo aparece aqui/)).toHaveCount(0);
});

const EVENTS = [
  { name: "Oficina de Python", date: "2026-10-11" },
  { name: "Roda de conversa sobre carreira em tecnologia", date: "2026-09-02" },
  { name: "Feira de Ciências", date: "2026-03-30" },
];

test("eventos de que participou: um cartão com nome e data de cada um, na ordem que veio", async ({
  page,
}) => {
  await mockProfileCourseApi(page, { events: EVENTS });
  await page.goto(PROFILE);

  const card = page.getByRole("region", { name: "Eventos de que você participou" });
  await expect(
    card.getByRole("heading", { name: "Eventos de que você participou", level: 2 }),
  ).toBeVisible();
  await expect(card.locator("span")).toHaveText([
    "Oficina de Python",
    "11 de out",
    "Roda de conversa sobre carreira em tecnologia",
    "2 de set",
    "Feira de Ciências",
    "30 de mar",
  ]);
});

test("o cartão de eventos fica entre Seu grupo e Seu caminho", async ({ page }) => {
  await mockProfileCourseApi(page, { events: EVENTS });
  await page.goto(PROFILE);

  await expect(page.getByRole("region", { name: "Eventos de que você participou" })).toBeVisible();
  const titles = await page.locator("main h2").allTextContents();
  const events = titles.indexOf("Eventos de que você participou");
  expect(events).toBe(titles.indexOf("Seu grupo") + 1);
  expect(events).toBe(titles.indexOf("Seu caminho") - 1);
});

test("sem eventos, o cartão some (nem o título)", async ({ page }) => {
  await mockProfileCourseApi(page, { events: [] });
  await page.goto(PROFILE);

  await expect(page.getByRole("region", { name: "Seu caminho" })).toBeVisible();
  await expect(page.getByText("Eventos de que você participou")).toHaveCount(0);
});

test("a rota de eventos falhar não derruba o perfil: só o cartão some", async ({ page }) => {
  await mockProfileCourseApi(page, { events: EVENTS, eventsLoad: 500 });
  await page.goto(PROFILE);

  await expect(page.getByText("Alana Ficticia", { exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Seu caminho" })).toBeVisible();
  await expect(page.getByText("Não foi possível carregar")).toHaveCount(0);
  await expect(page.getByText("Eventos de que você participou")).toHaveCount(0);
});

test("a rota de eventos sem rede também não derruba o perfil", async ({ page }) => {
  await mockProfileCourseApi(page, { events: EVENTS });
  await page.route("**/api/profile/events", (route) => route.abort());
  await page.goto(PROFILE);

  await expect(page.getByRole("region", { name: "Seu caminho" })).toBeVisible();
  await expect(page.getByText("Eventos de que você participou")).toHaveCount(0);
});

test("eventos: sem sessão manda para o início", async ({ page }) => {
  await mockProfileCourseApi(page, { eventsLoad: 401 });
  await page.goto(PROFILE);

  await expect(page).toHaveURL(/\/$/);
});

test("eventos: sem aceitar a versão atual dos termos, manda para o aceite", async ({ page }) => {
  await mockTermsApi(page);
  await mockProfileCourseApi(page, { eventsLoad: "terms_not_accepted" });
  await page.goto(PROFILE);

  await expect(page).toHaveURL(/\/cadastro\/termos$/);
});

test("Seu caminho segue o do #345", async ({ page }) => {
  await mockProfileCourseApi(page, {
    course: { level: "graduacao", course: "Ciência da Computação" },
  });
  await page.goto(PROFILE);

  await expect(page.getByText("Graduação · Ciência da Computação")).toBeVisible();
  await expect(page.getByRole("button", { name: "Mudar curso" })).toBeVisible();
});

test('"Termos de uso" abre a âncora e o "Voltar" da página volta ao perfil', async ({ page }) => {
  await mockProfileCourseApi(page);
  await page.goto(PROFILE);

  await page.getByRole("link", { name: /Termos de uso/ }).click();

  await expect(page).toHaveURL(/\/termos\?de=perfil#uso$/);
  await page.getByRole("link", { name: "Voltar" }).click();
  await expect(page).toHaveURL(/\/perfil$/);
  await expect(page.getByRole("heading", { name: "Perfil", level: 1 })).toBeVisible();
});

test('"Política de privacidade" abre a âncora da política', async ({ page }) => {
  await mockProfileCourseApi(page);
  await page.goto(PROFILE);

  await page.getByRole("link", { name: /Política de privacidade/ }).click();

  await expect(page).toHaveURL(/\/termos\?de=perfil#privacidade$/);
});

test("os termos abertos de fora do perfil não mostram o Voltar", async ({ page }) => {
  await page.goto("/termos");

  await expect(
    page.getByRole("heading", { name: "Termos de uso e Política de privacidade", level: 1 }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Voltar" })).toHaveCount(0);
});

test('"Voltar" do perfil volta para onde ela estava', async ({ page }) => {
  await mockProfileCourseApi(page);
  await page.goto("/termos");
  await page.goto(PROFILE);

  await page.getByRole("button", { name: /Voltar/ }).click();

  await expect(page).toHaveURL(/\/termos$/);
});

test('"Sair da conta" encerra a sessão e leva ao início; "voltar" não reabre o perfil', async ({
  page,
}) => {
  let saiu = false;
  await mockProfileCourseApi(page);
  await page.route("**/api/auth/logout", (route) => {
    saiu = route.request().method() === "POST";
    return route.fulfill({ status: 204, body: "" });
  });
  await page.route("**/api/auth/me", (route) =>
    saiu ? route.fulfill({ status: 401, json: { detail: "Not authenticated" } }) : route.fallback(),
  );
  await page.goto("/termos");
  await page.goto(PROFILE);

  await page.getByRole("button", { name: "Sair da conta" }).click();

  await expect(page).toHaveURL(/\/$/);
  expect(saiu).toBe(true);

  // O perfil saiu do histórico (router.replace): voltar não o reabre.
  await page.goBack();
  await expect(page).not.toHaveURL(/\/perfil$/);
  await expect(page.getByRole("heading", { name: "Perfil", level: 1 })).toHaveCount(0);
});

test("se sair falhar, avisa e continua no perfil", async ({ page }) => {
  await mockProfileCourseApi(page);
  await page.route("**/api/auth/logout", (route) => route.abort());
  await page.goto(PROFILE);

  await page.getByRole("button", { name: "Sair da conta" }).click();

  await expect(page.getByText("Não deu pra sair agora. Tente de novo.")).toBeVisible();
  await expect(page).toHaveURL(/\/perfil$/);
  await expect(page.getByRole("button", { name: "Sair da conta" })).toBeEnabled();
});

// A exclusão em si é testada em profile-delete.spec.ts (#394).
test('"Excluir minha conta e meus dados" só abre o modal de confirmação', async ({ page }) => {
  await mockProfileCourseApi(page);
  await page.goto(PROFILE);

  const remove = page.getByRole("button", { name: "Excluir minha conta e meus dados" });
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await remove.click();

  await expect(page.getByRole("dialog", { name: "Excluir sua conta?" })).toBeVisible();
  await expect(page).toHaveURL(/\/perfil$/);
});

test("sem sessão, o perfil manda para o início", async ({ page }) => {
  await mockProfileCourseApi(page, { detailsLoad: 401 });
  await page.goto(PROFILE);

  await expect(page).toHaveURL(/\/$/);
});

test("sem aceitar a versão atual dos termos, manda para o aceite", async ({ page }) => {
  // A tela dos termos é a de verdade: sem simular a rota dela, ela consultaria um back
  // local, se houver um rodando, e voltaria para o início.
  await mockTermsApi(page);
  await mockProfileCourseApi(page, { detailsLoad: "terms_not_accepted" });
  await page.goto(PROFILE);

  await expect(page).toHaveURL(/\/cadastro\/termos$/);
});

test("falha ao carregar mostra o aviso e Tentar novamente recarrega", async ({ page }) => {
  await mockProfileCourseApi(page, { detailsLoad: 500 });
  await page.goto(PROFILE);

  await expect(page.getByText("Não foi possível carregar")).toBeVisible();

  await mockProfileCourseApi(page);
  await page.getByRole("button", { name: "Tentar novamente" }).click();

  await expect(page.getByRole("heading", { name: "Perfil", level: 1 })).toBeVisible();
  await expect(page.getByText("Alana Ficticia", { exact: true })).toBeVisible();
});

test("o Tab passa por Voltar, Editar, o interruptor, os links, Sair e Excluir, com foco visível", async ({
  page,
}) => {
  // RNF-G.01, RNF-G.02.
  await mockProfileCourseApi(page);
  await page.goto(PROFILE);
  await expect(page.getByRole("heading", { name: "Perfil", level: 1 })).toBeVisible();
  // O título aparece antes dos cartões: sem esperar o último, o Tab começaria com a página pela metade.
  await expect(
    page.getByRole("button", { name: "Excluir minha conta e meus dados" }),
  ).toBeVisible();

  const order = [
    page.getByRole("button", { name: /Voltar/ }),
    page.getByRole("link", { name: "Editar" }),
    page.getByRole("button", { name: "Registrar ingresso" }),
    page.getByRole("switch", { name: "Oportunidades" }),
    page.getByRole("link", { name: /Ver minha agenda/ }),
    page.getByRole("link", { name: /Termos de uso/ }),
    page.getByRole("link", { name: /Política de privacidade/ }),
    page.getByRole("button", { name: "Sair da conta" }),
    page.getByRole("button", { name: "Excluir minha conta e meus dados" }),
  ];

  await order[0].focus();
  for (const [index, item] of order.entries()) {
    await expect(item).toBeFocused();
    await expect(item).toHaveCSS("outline-style", "solid");
    if (index < order.length - 1) await page.keyboard.press("Tab");
  }
});

for (const width of [360, 1366]) {
  test(`cabe em ${width} px sem rolagem lateral`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await mockProfileCourseApi(page, { details: { ...GROUP_ORIGIN, google: true } });
    await page.goto(PROFILE);
    await expect(page.getByRole("button", { name: "Sair da conta" })).toBeVisible();

    expect(await overflow(page)).toBeLessThanOrEqual(0);
  });
}

// Figma A10: cada seção é um cartão (fundo claro, borda, raio 14, padding 16) e o título
// fica fora dele. Sem isso a tela vira texto solto na página (já aconteceu).
test("cada seção é um cartão com borda e raio, e o título fica fora dele", async ({ page }) => {
  await mockProfileCourseApi(page, { details: GROUP_ORIGIN, events: EVENTS });
  await page.goto(PROFILE);
  await expect(page.getByRole("heading", { name: "Perfil", level: 1 })).toBeVisible();

  for (const name of [
    "Sua conta",
    "O que te interessa",
    "Seu grupo",
    "Eventos de que você participou",
    "Seu caminho",
    "O que chega no seu e-mail",
    "Termos e privacidade",
  ]) {
    const section = page.getByRole("region", { name });
    const card = section.locator("div[class*='card']").first();
    const style = await card.evaluate((el) => {
      const css = getComputedStyle(el);
      return {
        border: css.borderTopWidth,
        radius: css.borderTopLeftRadius,
        padding: css.paddingTop,
        background: css.backgroundColor,
      };
    });

    expect(style, name).toMatchObject({ border: "1px", radius: "14px", padding: "16px" });
    expect(style.background, name).not.toBe("rgba(0, 0, 0, 0)");
  }

  // "Voltar" fica no cabeçalho, ao lado da marca, e não no meio da página.
  await expect(page.locator("header").getByRole("button", { name: /Voltar/ })).toBeVisible();
});
