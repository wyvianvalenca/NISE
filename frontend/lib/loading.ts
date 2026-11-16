"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Long-wait handling for suggestions (E03/E04, issue #81).
 *
 * The "Tecendo seu filé…" screen must not show on every wait: on a good
 * connection the girl goes straight to the result, and a flash of screen tires
 * more than it helps. Three times rule it (RNF-F10.02):
 *
 *   THRESHOLD  a short wait shows nothing; only past it does E03 come in
 *   MINIMUM    once visible, E03 stays at least this long, so it never flashes
 *   MAXIMUM    past it, give up and show E04 with "Tentar novamente"
 *
 * MAXIMUM is 15 s and not the 10 s the issue suggested, because of RNF-F11.01
 * (Must): when the LLM does not answer within 10 s the back-end falls back to
 * rule-based suggestions and returns them without an error. At a 10 s maximum
 * the two deadlines collide — E04 would replace the screen exactly as those
 * suggestions arrive, and a good answer would be thrown away. This has to stay
 * longer than the LLM timeout plus the rule-based lookup.
 */
export const THRESHOLD_MS = 1000;
export const MINIMUM_MS = 600;
export const MAXIMUM_MS = 15000;

export type WaitPhase =
  /** Waiting, but still too early to show anything. */
  | "early"
  /** Past the threshold: E03 is on screen. */
  | "weaving"
  /** Succeeded; the data is ready. */
  | "ready"
  /** Took too long or failed: E04. */
  | "error";

/**
 * Phase and data travel together so an outcome can be applied against the phase
 * it finds. Kept apart, a response landing after the maximum would store its
 * data while the screen stayed on E04 — the data visible to the caller, the
 * error visible to her.
 */
type WaitState<T> = { phase: WaitPhase; data: T | null };

type WaitResult<T> = {
  phase: WaitPhase;
  data: T | null;
  /** Restarts the fetch from scratch, for the E04 "Tentar novamente". */
  retry: () => void;
};

type WaitTimes = { threshold?: number; minimum?: number; maximum?: number };

/**
 * Wraps a suggestions fetch and reports which phase of the wait it is in.
 *
 * `fetcher` must be stable between renders (use `useCallback`), otherwise the
 * fetch restarts on every render.
 */
export function useLongWait<T>(
  fetcher: () => Promise<T>,
  times: WaitTimes = {},
): WaitResult<T> {
  const threshold = times.threshold ?? THRESHOLD_MS;
  const minimum = times.minimum ?? MINIMUM_MS;
  const maximum = times.maximum ?? MAXIMUM_MS;

  const [state, setState] = useState<WaitState<T>>({ phase: "early", data: null });
  const [attempt, setAttempt] = useState(0);
  const shownAt = useRef<number | null>(null);

  /**
   * Restarts the fetch for E04's "Tentar novamente".
   *
   * Goes straight to E03 instead of back to `early`: she has already waited
   * once and knows this is slow, so a second blank screen would only look
   * broken. `shownAt` is cleared so the effect below stamps it again once E03
   * is actually back on screen.
   */
  const retry = useCallback(() => {
    setState({ phase: "weaving", data: null });
    shownAt.current = null;
    setAttempt((n) => n + 1);
  }, []);

  /**
   * Starts the minimum when E03 has actually been painted, not when the phase
   * was decided. Stamping it at the state change counted the render and paint
   * against her: measured in the browser, E03 stayed about 845 ms of a 900 ms
   * minimum, and under load less. Declared before the fetch effect so a retry
   * is stamped before any outcome can land.
   */
  useEffect(() => {
    if (state.phase === "weaving" && shownAt.current === null) {
      shownAt.current = Date.now();
    }
  }, [state.phase]);

  useEffect(() => {
    let active = true;
    const timers: ReturnType<typeof setTimeout>[] = [];

    timers.push(
      setTimeout(() => {
        if (!active) return;
        setState((current) => (current.phase === "early" ? { ...current, phase: "weaving" } : current));
      }, threshold),
    );

    timers.push(
      setTimeout(() => {
        if (active) {
          setState((current) => (current.phase === "ready" ? current : { ...current, phase: "error" }));
        }
      }, maximum),
    );

    /**
     * Applies an outcome only once E03 has been up for the minimum.
     *
     * Both outcomes go through here: a result that lands too soon would make
     * E03 flash, and so would a rejection, which is why the error path waits
     * too. While E03 is still hidden there is nothing to protect, so it
     * applies at once.
     */
    const afterMinimum = (apply: () => void) => {
      const visibleSince = shownAt.current;
      const remaining = visibleSince ? minimum - (Date.now() - visibleSince) : 0;

      if (remaining <= 0) {
        apply();
        return;
      }

      timers.push(
        setTimeout(() => {
          if (active) apply();
        }, remaining),
      );
    };

    fetcher()
      .then((value) => {
        if (!active) return;
        afterMinimum(() => {
          setState((current) => (current.phase === "error" ? current : { phase: "ready", data: value }));
        });
      })
      .catch(() => {
        if (!active) return;
        afterMinimum(() => setState((current) => ({ ...current, phase: "error" })));
      });

    return () => {
      active = false;
      timers.forEach(clearTimeout);
    };
  }, [fetcher, threshold, minimum, maximum, attempt]);

  return { phase: state.phase, data: state.data, retry };
}
