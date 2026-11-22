"use client";

import { useEffect, useState } from "react";
import styles from "./page.module.css";

/**
 * Service page: tells whether the back-end answers.
 *
 * It started as the skeleton's home (#42) and moved here when A01 took the
 * root (#51). It is the quick check after a `docker compose up`.
 */

type Health =
  | { state: "loading" }
  | { state: "ok"; status: string }
  | { state: "error"; reason: string };

async function fetchHealth(): Promise<string> {
  const response = await fetch("/api/health");

  if (!response.ok) {
    throw new Error(`o back-end respondeu ${response.status}`);
  }

  const body: { status?: string } = await response.json();
  return body.status ?? "sem status";
}

function describe(health: Health): string {
  switch (health.state) {
    case "loading":
      return "consultando o back-end...";
    case "ok":
      return `back-end respondeu: ${health.status}`;
    case "error":
      return `back-end fora do ar (${health.reason})`;
  }
}

export default function Status() {
  const [health, setHealth] = useState<Health>({ state: "loading" });

  useEffect(() => {
    let currentRequest = true;

    fetchHealth()
      .then((status) => {
        if (currentRequest) {
          setHealth({ state: "ok", status });
        }
      })
      .catch((error: unknown) => {
        if (currentRequest) {
          const reason =
            error instanceof Error ? error.message : "erro desconhecido";
          setHealth({ state: "error", reason });
        }
      });

    return () => {
      currentRequest = false;
    };
  }, []);

  return (
    <main className={styles.main}>
      <h1>Status</h1>
      <section className={styles.health}>
        <h2>Back-end</h2>
        <p data-testid="health" data-state={health.state} aria-live="polite">
          {describe(health)}
        </p>
      </section>
    </main>
  );
}
