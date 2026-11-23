"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { Toast } from "@/components/Toast";
import type { CoordAction } from "@/lib/coord-actions";
import styles from "./SavedNotice.module.css";

type SavedNoticeProps = {
  /** Where each action is and who sees it, so the notice can name the city of the saved one. */
  actions: Pick<CoordAction, "id" | "format" | "visibility" | "cityName">[];
};

/**
 * The notice "Ação salva." after the form (#212) leads back here with
 * `?salva=<action id>`. Without the parameter, or with an id that is not in the
 * list, nothing shows. The second sentence says who sees the action (RN-16): an
 * open in-person one goes to the girls of its city, an open online one to all the
 * girls (D-45), and a closed one never shows up in the suggestions, so it has no
 * second sentence. It closes with "Fechar".
 *
 * Reading the query string needs a Suspense boundary around this component.
 */
export function SavedNotice({ actions }: SavedNoticeProps) {
  const savedId = useSearchParams().get("salva");
  const [open, setOpen] = useState(true);
  const saved = actions.find((action) => String(action.id) === savedId);

  if (!saved || !open) return null;

  let audience = "";
  if (saved.visibility === "open") {
    audience =
      saved.format === "in_person"
        ? ` Já aparece nas sugestões das meninas de ${saved.cityName}.`
        : " Já aparece nas sugestões de todas as meninas.";
  }

  return (
    <div className={styles.notice}>
      <Toast action={{ label: "Fechar", onClick: () => setOpen(false) }}>
        <strong>Ação salva.</strong>
        {audience}
      </Toast>
    </div>
  );
}
