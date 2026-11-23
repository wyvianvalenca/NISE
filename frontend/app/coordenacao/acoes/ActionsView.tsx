"use client";

import { Suspense, useEffect, useState } from "react";
import { Button } from "@/components/Button";
import { Loading } from "@/components/Loading";
import { getCoordActionList, type CoordActionList } from "@/lib/coord-actions";
import { ActionsList } from "./ActionsList";
import { SavedNotice } from "./SavedNotice";
import styles from "./ActionsList.module.css";

/**
 * Loads the group's actions and draws the list. While it waits there is a
 * loading line; if it fails there is a message with "Tentar novamente".
 * The notice "Ação salva." reads `?salva=<action id>`, which is how the form
 * (#212) leads back here after saving.
 */
export function ActionsView() {
  /** null: loading. */
  const [list, setList] = useState<CoordActionList | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    getCoordActionList(controller.signal).then(
      (loaded) => {
        setFailed(false);
        setList(loaded);
      },
      () => {
        if (!controller.signal.aborted) setFailed(true);
      },
    );
    return () => controller.abort();
  }, [attempt]);

  if (failed) {
    return (
      <div className={styles.loadFailed}>
        <p role="alert">Não foi possível carregar as ações.</p>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            setFailed(false);
            setAttempt((count) => count + 1);
          }}
        >
          Tentar novamente
        </Button>
      </div>
    );
  }

  if (list === null) return <Loading label="Carregando as ações…" />;

  return (
    <>
      <Suspense>
        <SavedNotice actions={list.actions} />
      </Suspense>
      <ActionsList actions={list.actions} counts={list.counts} />
    </>
  );
}
