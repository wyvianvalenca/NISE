"use client";

import { notFound, useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/Button";
import { ActionForm } from "@/components/ActionForm";
import { getAction, type ActionFormValues } from "@/lib/action-form";

/**
 * Loads the action named in the URL and opens the shared form filled in.
 *
 * A missing action, or one of another group, is the app's 404 (RNF-G.03): the
 * route answers 404 for both and `getAction` turns it into `null`. Any other
 * failure shows a message with a retry. An id that is not a whole
 * number cannot exist, so it is a 404 without asking.
 */
export function EditActionLoader() {
  const { id } = useParams<{ id: string }>();
  const actionId = /^\d+$/.test(id) ? Number(id) : null;
  /** undefined: loading. null: does not exist. */
  const [values, setValues] = useState<ActionFormValues | null | undefined>(undefined);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (actionId === null) return;
    const controller = new AbortController();
    getAction(actionId, controller.signal)
      .then(setValues)
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      });
    return () => controller.abort();
  }, [actionId, attempt]);

  function retry() {
    setFailed(false);
    setAttempt((count) => count + 1);
  }

  if (actionId === null || values === null) notFound();
  if (failed) {
    return (
      <div role="alert">
        <p>Não foi possível carregar a ação.</p>
        <Button variant="secondary" size="sm" onClick={retry}>
          Tentar novamente
        </Button>
      </div>
    );
  }
  if (values === undefined) return <p aria-live="polite">Carregando…</p>;
  return <ActionForm initialValues={values} actionId={actionId} />;
}
