import { expect, test } from "@playwright/test";

const URL = "/coordenacao/acoes";
const TABS = ["Ações", "Funil", "Ingressantes", "Relatórios", "Exportar"];

test("shows the five tabs in order with Ações as the current one", async ({
  page,
}) => {
  await page.goto(URL);

  const nav = page.getByRole("navigation", { name: "Seções" });
  await expect(nav.locator("a, span")).toHaveText(TABS);
  await expect(nav.getByRole("link", { name: "Ações" })).toHaveAttribute(
    "aria-current",
    "page",
  );
});

test("only Ações is a link, the other tabs go nowhere", async ({ page }) => {
  await page.goto(URL);

  const nav = page.getByRole("navigation", { name: "Seções" });
  await expect(nav.locator("a[href]")).toHaveCount(1);

  for (const name of TABS.slice(1)) {
    const tab = nav.getByRole("link", { name, exact: true, disabled: true });
    await expect(tab).not.toHaveAttribute("href", /.*/);
    await expect(tab).toHaveAttribute("aria-disabled", "true");
    await tab.click({ force: true });
    await expect(page).toHaveURL(new RegExp(`${URL}$`));
  }
});

test("shows the group name and the initial from the coordinator", async ({
  page,
}) => {
  await page.goto(URL);

  const header = page.getByRole("banner");
  await expect(header.getByText("Rendeiras do Código")).toBeVisible();
  await expect(header.getByLabel("Sua conta")).toHaveText("K");
});

test("reaches Ações by keyboard with a visible focus", async ({ page }) => {
  await page.goto(URL);

  const link = page.getByRole("link", { name: "Ações" });
  for (
    let i = 0;
    i < 5 && !(await link.evaluate((el) => el === document.activeElement));
    i++
  ) {
    await page.keyboard.press("Tab");
  }

  await expect(link).toBeFocused();
  const outline = await link.evaluate((el) => {
    const style = getComputedStyle(el);
    return {
      style: style.outlineStyle,
      offset: parseFloat(style.outlineOffset),
    };
  });
  expect(outline.style).not.toBe("none");
  expect(outline.offset).toBeLessThan(0);
});

test("has no horizontal scroll at 1366 px", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto(URL);

  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflow).toBe(0);
});
