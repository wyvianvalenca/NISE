"use client";

import { useEffect, useState } from "react";
import type { components } from "./api/schema";

type Me = components["schemas"]["MeOut"];

/** The signed-in coordinator, as the coordinator screens need it. */
export type Coordinator = {
  /** Her full name, shown at the top of the account menu. */
  name: string;
  /** Name of the group she coordinates, or null when she has none. */
  groupName: string | null;
};

export type CoordinatorResult =
  | { ok: true; coordinator: Coordinator }
  | { ok: false; reason: "signed_out" | "forbidden" | "failed" };

/**
 * Reads the coordinator of the current session from `GET /api/auth/me`.
 *
 * It runs in the browser, like every other call of the coordinator screens, so
 * the session cookie goes with it and the e2e tests can mock the route. A
 * session that is not a coordinator's is "forbidden": the data routes already
 * refuse it, this only keeps a girl's name out of the coordinator header.
 */
export async function getCoordinator(signal?: AbortSignal): Promise<CoordinatorResult> {
  try {
    const response = await fetch("/api/auth/me", { signal });

    if (response.status === 401) return { ok: false, reason: "signed_out" };
    if (!response.ok) return { ok: false, reason: "failed" };

    const me = (await response.json()) as Me;
    if (me.role !== "coordinator") return { ok: false, reason: "forbidden" };

    return { ok: true, coordinator: { name: me.name, groupName: me.group?.name ?? null } };
  } catch {
    return { ok: false, reason: "failed" };
  }
}

/** The coordinator of the session. `null` while it loads. */
export function useCoordinator(): CoordinatorResult | null {
  const [result, setResult] = useState<CoordinatorResult | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    getCoordinator(controller.signal).then((next) => {
      if (!controller.signal.aborted) setResult(next);
    });
    return () => controller.abort();
  }, []);

  return result;
}
