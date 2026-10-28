import { expect, test } from "@playwright/test";

test("abre a página inicial", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "NISE", level: 1 })).toBeVisible();
  await expect(page.getByTestId("health")).toBeVisible();
});

test("mostra o status quando o back-end responde", async ({ page }) => {
  await page.route("**/api/health", (route) =>
    route.fulfill({ json: { status: "ok" } }),
  );

  await page.goto("/");

  await expect(page.getByTestId("health")).toHaveAttribute("data-state", "ok");
  await expect(page.getByTestId("health")).toContainText("ok");
});

test("avisa quando o back-end não responde", async ({ page }) => {
  await page.route("**/api/health", (route) => route.abort());

  await page.goto("/");

  await expect(page.getByTestId("health")).toHaveAttribute("data-state", "erro");
  await expect(page.getByTestId("health")).toContainText("fora do ar");
});
