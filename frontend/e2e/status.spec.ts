import { expect, test } from "@playwright/test";

test("opens the status page", async ({ page }) => {
  await page.goto("/status");

  await expect(page.getByRole("heading", { name: "Status", level: 1 })).toBeVisible();
  await expect(page.getByTestId("health")).toBeVisible();
});

test("shows the status when the back-end answers", async ({ page }) => {
  await page.route("**/api/health", (route) =>
    route.fulfill({ json: { status: "ok" } }),
  );

  await page.goto("/status");

  await expect(page.getByTestId("health")).toHaveAttribute("data-state", "ok");
  await expect(page.getByTestId("health")).toContainText("ok");
});

test("warns when the back-end does not answer", async ({ page }) => {
  await page.route("**/api/health", (route) => route.abort());

  await page.goto("/status");

  await expect(page.getByTestId("health")).toHaveAttribute("data-state", "error");
  await expect(page.getByTestId("health")).toContainText("fora do ar");
});
