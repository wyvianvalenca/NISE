import type { Page } from "@playwright/test";

// Simulates GET /api/admin/coordinators (AD02, #447) of the back-end, so the
// tests of the admin list do not depend on FastAPI. Fictional data, one row in
// each situation plus a second active one. The back-end answers the whole list
// with the counts of the whole list; the screen filters and searches it.

type Row = {
  id: number;
  name: string;
  group_name: string;
  status: "active" | "invite_sent" | "invite_expired" | "deactivated";
  date: string;
};

export const COORDINATORS: Row[] = [
  { id: 1, name: "Ana Souza", group_name: "Rendeiras do Código", status: "active", date: "2026-09-12T15:00:00Z" },
  { id: 2, name: "Beatriz Lima", group_name: "Meninas Programadoras", status: "active", date: "2026-08-03T15:00:00Z" },
  { id: 3, name: "Carla Mendes", group_name: "Robótica Delas", status: "invite_sent", date: "2026-11-25T15:00:00Z" },
  { id: 4, name: "Daniela Rocha", group_name: "Futuras Cientistas", status: "invite_expired", date: "2026-11-18T15:00:00Z" },
  { id: 5, name: "Elisa Duarte", group_name: "Código e Café", status: "deactivated", date: "2026-11-02T15:00:00Z" },
];

type Options = {
  /** Answer with this status instead of the list: 401, 403 or 500. */
  status?: number;
};

export async function mockAdminCoordinatorsApi(page: Page, options: Options = {}) {
  await page.route(
    (url) => url.pathname === "/api/admin/coordinators",
    (route) => {
      if (options.status) {
        return route.fulfill({ status: options.status, json: { detail: "Erro" } });
      }
      const count = (statuses: Row["status"][]) =>
        COORDINATORS.filter((row) => statuses.includes(row.status)).length;
      return route.fulfill({
        json: {
          items: COORDINATORS,
          counts: {
            all: COORDINATORS.length,
            active: count(["active"]),
            invites: count(["invite_sent", "invite_expired"]),
            deactivated: count(["deactivated"]),
          },
        },
      });
    },
  );
}
