"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { Toast } from "@/components/Toast";
import type { CoordAction } from "@/lib/coord-actions";
import styles from "./SavedNotice.module.css";

type SavedNoticeProps = {
  /** Where each action is, so the notice can name the city of the saved one. */
  actions: Pick<CoordAction, "id" | "format" | "cityName">[];
};

/**
 * The notice "Ação salva." after the form (#212) leads back here with
 * `?salva=<action id>`. Without the parameter, or with an id that is not in the
 * list, nothing shows. An online action has no city, so the second sentence is
 * left out for it. It closes with "Fechar".
 *
 * Reading the query string needs a Suspense boundary around this component.
 */
export function SavedNotice({ actions }: SavedNoticeProps) {
  const savedId = useSearchParams().get("salva");
  const [open, setOpen] = useState(true);
  const saved = actions.find((action) => action.id === savedId);

  if (!saved || !open) return null;

  return (
    <div className={styles.notice}>
      <Toast action={{ label: "Fechar", onClick: () => setOpen(false) }}>
        <strong>Ação salva.</strong>
        {saved.format === "in_person" &&
          ` Já aparece nas sugestões das meninas de ${saved.cityName}.`}
      </Toast>
    </div>
  );
}
