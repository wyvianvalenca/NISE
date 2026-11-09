"use client";

import { useEffect, useState } from "react";
import styles from "./page.module.css";

/**
 * Página de serviço: diz se o back-end responde.
 *
 * Nasceu como a home do esqueleto (#42) e veio para cá quando a A01 assumiu
 * a raiz (#51). Serve de conferência rápida depois de um `docker compose up`.
 */

type Health =
  | { state: "carregando" }
  | { state: "ok"; status: string }
  | { state: "erro"; motivo: string };

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
    case "carregando":
      return "consultando o back-end...";
    case "ok":
      return `back-end respondeu: ${health.status}`;
    case "erro":
      return `back-end fora do ar (${health.motivo})`;
  }
}

export default function Status() {
  const [health, setHealth] = useState<Health>({ state: "carregando" });

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
          const motivo =
            error instanceof Error ? error.message : "erro desconhecido";
          setHealth({ state: "erro", motivo });
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
