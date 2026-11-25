"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/Button";
import { Loading } from "@/components/Loading";
import { AdminGroupsError, getGroupCards, type GroupCard } from "@/lib/admin-groups";
import { GroupsList } from "./GroupsList";
import styles from "./GroupsList.module.css";

/**
 * Loads the groups and draws AD06. The server only answers the NISE team: a
 * coordinator or a girl who opens this address gets a refusal message and
 * never sees a card (RNF-G.03). A failure offers "Tentar novamente".
 */
export function GroupsView() {
  /** null: loading. */
  const [groups, setGroups] = useState<GroupCard[] | null>(null);
  const [problem, setProblem] = useState<AdminGroupsError["reason"] | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let current = true;
    getGroupCards().then(
      (loaded) => {
        if (!current) return;
        setProblem(null);
        setGroups(loaded);
      },
      (error: unknown) => {
        if (!current) return;
        setProblem(error instanceof AdminGroupsError ? error.reason : "failed");
      },
    );
    return () => {
      current = false;
    };
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
        <p role="alert">Não foi possível carregar os grupos.</p>
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

  if (groups === null) return <Loading label="Carregando os grupos…" />;

  return <GroupsList groups={groups} onChanged={() => setAttempt((count) => count + 1)} />;
}
