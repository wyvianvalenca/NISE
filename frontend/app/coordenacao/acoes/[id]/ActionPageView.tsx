"use client";

import { notFound, useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { CoordHeader } from "@/components/CoordHeader";
import { LoadFailed } from "@/components/LoadFailed";
import { Loading } from "@/components/Loading";
import { StepTracker, type Step } from "@/components/StepTracker";
import { dayMonthLabel } from "@/lib/coord-action-labels";
import { getActionPage, type ActionPage } from "@/lib/coord-action-page";
import { ActionHeader } from "./ActionHeader";
import { AddGirlDrawer } from "./AddGirlDrawer";
import { ImportDrawer } from "./ImportDrawer";
import { RegistrationsCard } from "./RegistrationsCard";
import { RegistrationsSwitch } from "./RegistrationsSwitch";
import styles from "./ActionPageView.module.css";

/** "Inscritas" text under the step (RN-37, RF-F1.16). */
function registrationsStepText(action: ActionPage): string {
  if (action.registeredCount === 0) return "Importe quando quiser";
  const state = action.registrationsOpen ? "inscrições ainda abertas" : "inscrições fechadas";
  const count = action.registeredCount;
  return `${count} ${count === 1 ? "adicionada" : "adicionadas"} · ${state}`;
}

function steps(action: ActionPage): Step[] {
  const eventHasCome = action.status === "awaiting_attendance" || action.status === "concluded";
  const created = `${action.createdOn.slice(8, 10)}/${action.createdOn.slice(5, 7)}`;
  return [
    { label: "Cadastro", description: `Feito em ${created}`, status: "done" },
    {
      label: "Inscritas",
      description: registrationsStepText(action),
      status: eventHasCome ? "done" : "current",
    },
    {
      label: "Presença",
      description: eventHasCome
        ? `Aconteceu em ${dayMonthLabel(action.startsOn)}`
        : `Depois do evento, em ${dayMonthLabel(action.startsOn)}`,
      status: action.status === "concluded" ? "done" : eventHasCome ? "current" : "todo",
    },
  ];
}

type ViewProps = { groupName: string; accountInitial: string };

/**
 * Loads the action named in the URL and draws the page.
 *
 * A missing action, or one of another group, is the app's 404 (RNF-G.03): the
 * route answers 404 for both. An id that is not a whole number cannot exist.
 *
 * Extension points for the next C2 issues:
 * - `reload()` fetches the action and the list again (after an import, an added
 *   girl, closing or reopening); `listVersion` makes the card reload its list.
 * - `onImport` / `onAdd` are given to the card (#234, #235 open their drawers).
 * - the `<aside>` is the right column (RegistrationsSwitch: close/reopen, #236, #237).
 */
export function ActionPageView({ groupName, accountInitial }: ViewProps) {
  const { id } = useParams<{ id: string }>();
  const actionId = /^\d+$/.test(id) ? Number(id) : null;
  /** undefined: loading. null: does not exist. */
  const [action, setAction] = useState<ActionPage | null | undefined>(undefined);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [listVersion, setListVersion] = useState(0);
  const [importing, setImporting] = useState(false);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    if (actionId === null) return;
    const controller = new AbortController();
    getActionPage(actionId, controller.signal).then(
      (found) => {
        setFailed(false);
        setAction(found);
      },
      () => {
        if (!controller.signal.aborted) setFailed(true);
      },
    );
    return () => controller.abort();
  }, [actionId, attempt]);

  /** Fetches the action and the list again. */
  function reload() {
    setAttempt((value) => value + 1);
    setListVersion((value) => value + 1);
  }

  if (actionId === null || action === null) notFound();

  if (failed && action === undefined) {
    return <LoadFailed onRetry={() => {
          setFailed(false);
          reload();
        }} />;
  }

  return (
    <>
      <CoordHeader active="acoes" groupName={groupName} accountInitial={accountInitial} />
      <main className={styles.main}>
        {action === undefined ? (
          <Loading label="Carregando a ação…" />
        ) : (
          <>
            <ActionHeader action={action} />
            <div className={styles.steps}>
              <StepTracker steps={steps(action)} />
            </div>
            <div className={styles.columns}>
              <RegistrationsCard
                action={action}
                reloadToken={listVersion}
                onImport={() => setImporting(true)}
                onAdd={() => setAdding(true)}
              />
              <aside className={styles.aside} aria-label="Próximos passos">
                <RegistrationsSwitch action={action} onChanged={reload} />
              </aside>
            </div>
            {importing && (
              <ImportDrawer
                action={action}
                onClose={() => setImporting(false)}
                onImported={() => {
                  setImporting(false);
                  reload();
                }}
              />
            )}
            {adding && (
              <AddGirlDrawer
                actionId={action.id}
                actionName={action.name}
                onAdded={reload}
                onClose={() => setAdding(false)}
              />
            )}
          </>
        )}
      </main>
    </>
  );
}
