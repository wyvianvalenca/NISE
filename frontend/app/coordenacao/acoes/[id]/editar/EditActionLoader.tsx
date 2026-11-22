"use client";

import { notFound, useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ActionForm } from "@/components/ActionForm";
import { getAction, type ActionFormValues } from "@/lib/action-form";

/**
 * Loads the action named in the URL and opens the shared form filled in.
 *
 * A missing action, or one of another group, is the app's 404 (RNF-G.03): the
 * provisional contract answers `null` for both. An id that is not a whole
 * number cannot exist, so it is a 404 without asking.
 */
export function EditActionLoader() {
  const { id } = useParams<{ id: string }>();
  const actionId = /^\d+$/.test(id) ? Number(id) : null;
  /** undefined: loading. null: does not exist. */
  const [values, setValues] = useState<ActionFormValues | null | undefined>(undefined);

  useEffect(() => {
    if (actionId === null) return;
    let current = true;
    getAction(actionId).then((found) => {
      if (current) setValues(found);
    });
    return () => {
      current = false;
    };
  }, [actionId]);

  if (actionId === null || values === null) notFound();
  if (values === undefined) return <p aria-live="polite">Carregando…</p>;
  return <ActionForm initialValues={values} actionId={actionId} />;
}
