"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useState } from "react";
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
      }
    | undefined;
}

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
 */
export function WaitHarness() {
  const [round, setRound] = useState(0);
  const params = useSearchParams();
  const fromGlobal = globalThis.__NISE_MOCK_WAIT__;
  const delayParam = numberParam(params, "delay");

  const mock = fromGlobal ?? {
    delaysMs: delayParam === undefined ? undefined : [delayParam],
    threshold: numberParam(params, "threshold"),
    minimum: numberParam(params, "minimum"),
    maximum: numberParam(params, "max"),
    reassurance: params.get("reassurance") === "1",
    fail: params.get("fail") === "1",
  };

  const fetcher = useCallback(() => {
    const delays = mock.delaysMs ?? [0];
    const delay = delays[Math.min(round, delays.length - 1)];
    const shouldFail = mock.fail;
    return new Promise<string>((resolve, reject) =>
      setTimeout(
        () => (shouldFail ? reject(new Error("fetch failed on purpose")) : resolve("pronto")),
        delay,
      ),
    );
  }, [round, mock.delaysMs, mock.fail]);

  const { phase, data, retry } = useLongWait(fetcher, {
    threshold: mock.threshold,
    minimum: mock.minimum,
    maximum: mock.maximum,
  });

  if (phase === "weaving") return <TecendoFile name="Alana" />;
  if (phase === "error") {
    return (
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
    return (
      <p style={{ padding: 24 }} data-testid="ready">
        Carregou ({String(data)}). Numa tela de verdade, o conteúdo entraria aqui —
        a E03 não aparece quando a espera é curta.
      </p>
    );
  }
  return null;
}
