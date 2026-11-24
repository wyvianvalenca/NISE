"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/Button";
import { Loading } from "@/components/Loading";
import {
  AdminCoordinatorsError,
  getAdminCoordinators,
  type CoordinatorList,
} from "@/lib/admin-coordinators";
import { CoordinatorsList } from "./CoordinatorsList";
import styles from "./CoordinatorsList.module.css";

/**
 * Loads the coordinators and draws the list. The server only answers the NISE
 * team: a coordinator or a girl who opens this address gets a refusal message
 * and never sees a row (RNF-G.03). A failure offers "Tentar novamente".
 */
export function CoordinatorsView() {
  /** null: loading. */
  const [list, setList] = useState<CoordinatorList | null>(null);
  const [problem, setProblem] = useState<AdminCoordinatorsError["reason"] | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    getAdminCoordinators(controller.signal).then(
      (loaded) => {
        setProblem(null);
        setList(loaded);
      },
      (error: unknown) => {
        if (controller.signal.aborted) return;
        setProblem(error instanceof AdminCoordinatorsError ? error.reason : "failed");
      },
    );
    return () => controller.abort();
  }, [attempt]);

  if (problem === "forbidden" || problem === "unauthenticated") {
    return (
      <div className={styles.loadFailed}>
        <p role="alert">Esta área é só da equipe NISE.</p>
      </div>
    );
  }

  if (problem === "failed") {
    return (
      <div className={styles.loadFailed}>
        <p role="alert">Não foi possível carregar as coordenadoras.</p>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            setProblem(null);
            setAttempt((count) => count + 1);
          }}
        >
          Tentar novamente
        </Button>
      </div>
    );
  }

  if (list === null) return <Loading label="Carregando as coordenadoras…" />;

  return <CoordinatorsList coordinators={list.items} />;
}
