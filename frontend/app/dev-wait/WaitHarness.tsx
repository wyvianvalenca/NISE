"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { LoadFailed } from "@/components/LoadFailed";
import { TecendoFile } from "@/components/TecendoFile";
import { useLongWait } from "@/lib/loading";

declare global {
  var __NISE_MOCK_WAIT__:
    | {
        /** Delay of each attempt, in ms; the last one repeats. */
        delaysMs?: number[];
        threshold?: number;
        minimum?: number;
        maximum?: number;
        /** Draws E04 with the sign-up reassurance block. */
        reassurance?: boolean;
        /** Rejects the attempt, for the "connection dropped" path. */
        fail?: boolean;
        /** Shows the "switch" button, which swaps the fetcher for another. */
        switchable?: boolean;
        /** What the fetcher does after a switch. */
        next?: { delayMs?: number; fail?: boolean };
      }
    | undefined;
}

const subscribeNothing = () => () => {};

/** Reads one number from the query string, or undefined when absent. */
function numberParam(params: URLSearchParams, name: string): number | undefined {
  const raw = params.get(name);
  const value = raw === null ? NaN : Number(raw);
  return Number.isFinite(value) ? value : undefined;
}

/**
 * Wires `useLongWait` to the E03 and E04 screens with a fake fetch.
 *
 * Two ways to drive it. The e2e sets `__NISE_MOCK_WAIT__` before the page
 * opens; by hand, the query string does the same, so the states can be opened
 * from the address bar:
 *
 *   /dev-wait?delay=3000          E03 while it waits, then the result
 *   /dev-wait?delay=99999&max=4000  E04 after the maximum
 *   /dev-wait?delay=99999&max=4000&reassurance=1   E04 as the sign-up draws it
 *   /dev-wait?delay=400&fail=1    E04 from a rejected fetch, not from the maximum
 *
 * The switch button only renders after hydration, because the e2e sets the mock
 * on the client alone. With `switch=1` a "switch" button swaps the fetcher for a new one, which
 * behaves as `nextDelay` (ms) and `nextFail=1` say:
 *
 *   /dev-wait?switch=1&delay=400&fail=1&nextDelay=0           E04, then switch: its result shows
 *   /dev-wait?switch=1&delay=0&nextDelay=3000                 result, then switch: E03, old data gone
 *   /dev-wait?switch=1&delay=400&threshold=300&minimum=900    E03, then the result; switch holds a new minimum
 */
export function WaitHarness() {
  const hydrated = useSyncExternalStore(subscribeNothing, () => true, () => false);
  const [band, setBand] = useState(0);
  const [round, setRound] = useState(0);
  const params = useSearchParams();
  const fromGlobal = globalThis.__NISE_MOCK_WAIT__;
  const delayParam = numberParam(params, "delay");

  const threshold = numberParam(params, "threshold");
  const minimum = numberParam(params, "minimum");
  const maximum = numberParam(params, "max");
  const reassurance = params.get("reassurance") === "1";
  const fail = params.get("fail") === "1";
  const switchable = params.get("switch") === "1";
  const nextDelay = numberParam(params, "nextDelay");
  const nextFail = params.get("nextFail") === "1";

  /**
   * Memoised because `useLongWait` restarts whenever `fetcher` changes identity,
   * and a fresh object here — above all a fresh `delaysMs` array — made every
   * render start the wait over. Driven by the query string, that added a whole
   * extra round to the wait; the e2e never saw it, because it passes the global
   * object, which keeps its identity.
   */
  const mock = useMemo(
    () =>
      fromGlobal ?? {
        delaysMs: delayParam === undefined ? undefined : [delayParam],
        threshold,
        minimum,
        maximum,
        reassurance,
        fail,
        switchable,
        next: { delayMs: nextDelay, fail: nextFail },
      },
    [
      fromGlobal,
      delayParam,
      threshold,
      minimum,
      maximum,
      reassurance,
      fail,
      switchable,
      nextDelay,
      nextFail,
    ],
  );

  /**
   * Both `band` (the switch button) and `round` (a retry) give a new fetcher, on
   * purpose: a retry must still go straight to E03 when the fetcher changes.
   */
  const fetcher = useCallback(() => {
    const delays = mock.delaysMs ?? [0];
    const switched = band > 0;
    const delay = switched
      ? (mock.next?.delayMs ?? 0)
      : delays[Math.min(round, delays.length - 1)];
    const shouldFail = switched ? mock.next?.fail : mock.fail;
    return new Promise<string>((resolve, reject) =>
      setTimeout(
        () =>
          shouldFail
            ? reject(new Error("fetch failed on purpose"))
            : resolve(switched ? `pronto-${band}` : "pronto"),
        delay,
      ),
    );
  }, [band, round, mock.delaysMs, mock.fail, mock.next]);

  const { phase, data, retry } = useLongWait(fetcher, {
    threshold: mock.threshold,
    minimum: mock.minimum,
    maximum: mock.maximum,
  });

  let screen: ReactNode = null;
  if (phase === "weaving") screen = <TecendoFile name="Alana" />;
  if (phase === "error") {
    screen = (
      <LoadFailed
        reassurance={
          mock.reassurance
            ? {
                title: "Seu cadastro está salvo",
                text: "Você não precisa preencher seus dados outra vez.",
              }
            : undefined
        }
        onRetry={() => {
          setRound((n) => n + 1);
          retry();
        }}
      />
    );
  }
  if (phase === "ready") {
    screen = (
      <p style={{ padding: 24 }} data-testid="ready">
        Carregou ({String(data)}). Numa tela de verdade, o conteúdo entraria aqui —
        a E03 não aparece quando a espera é curta.
      </p>
    );
  }

  return (
    <>
      {screen}
      {hydrated && mock.switchable ? (
        <button
          type="button"
          style={{ position: "fixed", right: 8, bottom: 8 }}
          onClick={() => setBand((n) => n + 1)}
        >
          switch
        </button>
      ) : null}
    </>
  );
}
