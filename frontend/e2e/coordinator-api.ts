import type { Page } from "@playwright/test";

/** Kaline, coordinator of "Rendeiras do Código". Fictional data. */
export const COORDINATOR = {
  id: 1,
  email: "coord@exemplo.com",
  name: "Kaline Ficticia",
  role: "coordinator",
  group: { id: 7, name: "Rendeiras do Código" },
};

/**
 * Answers GET /api/auth/me, which the coordinator header and K06 read for the
 * group name. Pass `body` and `status` for another account or no session.
 */
export async function mockCoordinatorApi(page: Page, body: object = COORDINATOR, status = 200) {
  await page.route("**/api/auth/me", (route) => route.fulfill({ status, json: body }));
}
