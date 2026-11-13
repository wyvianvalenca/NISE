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
 */
export const THRESHOLD_MS = 1000;
export const MINIMUM_MS = 600;
export const MAXIMUM_MS = 10000;

export type WaitPhase =
  /** Waiting, but still too early to show anything. */
  | "early"
  /** Past the threshold: E03 is on screen. */
  | "weaving"
  /** Succeeded; the data is ready. */
  | "ready"
  /** Took too long or failed: E04. */
  | "error";

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

  const [phase, setPhase] = useState<WaitPhase>("early");
  const [data, setData] = useState<T | null>(null);
  const [attempt, setAttempt] = useState(0);
  const shownAt = useRef<number | null>(null);

  /**
   * Restarts the fetch for E04's "Tentar novamente".
   *
   * Goes straight to E03 instead of back to `early`: she has already waited
   * once and knows this is slow, so a second blank screen would only look
   * broken. `shownAt` starts now, so the minimum counts from this moment.
   */
  const retry = useCallback(() => {
    setData(null);
    setPhase("weaving");
    shownAt.current = Date.now();
    setAttempt((n) => n + 1);
  }, []);

  useEffect(() => {
    let active = true;
    const timers: ReturnType<typeof setTimeout>[] = [];

    timers.push(
      setTimeout(() => {
        if (!active) return;
        if (shownAt.current === null) shownAt.current = Date.now();
        setPhase((current) => (current === "early" ? "weaving" : current));
      }, threshold),
    );

    timers.push(
      setTimeout(() => {
        if (active) setPhase((current) => (current === "ready" ? current : "error"));
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
          setData(value);
          setPhase((current) => (current === "error" ? current : "ready"));
        });
      })
      .catch(() => {
        if (!active) return;
        afterMinimum(() => setPhase("error"));
      });

    return () => {
      active = false;
      timers.forEach(clearTimeout);
    };
  }, [fetcher, threshold, minimum, maximum, attempt]);

  return { phase, data, retry };
}
