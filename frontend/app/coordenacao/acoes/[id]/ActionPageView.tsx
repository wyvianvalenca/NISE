"use client";

import { notFound, useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { CoordHeader } from "@/components/CoordHeader";
import { LoadFailed } from "@/components/LoadFailed";
import { Loading } from "@/components/Loading";
import { StepTracker, type Step } from "@/components/StepTracker";
import { dayMonthLabel } from "@/lib/coord-action-labels";
import { getActionPage, type ActionPage } from "@/lib/coord-action-page";
import { getAttendance, type AttendancePage } from "@/lib/coord-attendance";
import { ActionHeader } from "./ActionHeader";
import { AddGirlDrawer } from "./AddGirlDrawer";
import { AfterAttendanceCard } from "./AfterAttendanceCard";
import { AttendanceAside } from "./AttendanceAside";
import { AttendanceMarking } from "./AttendanceMarking";
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

/** "Inscritas" text under the step once the day of the event came (#338). */
function attendanceRegistrationsText(attendance: AttendancePage): string {
  if (attendance.registeredCount === 0 || attendance.lastRegisteredOn === null) {
    return "Nenhuma inscrita";
  }
  const count = attendance.registeredCount;
  return `${count} ${count === 1 ? "importada" : "importadas"} em ${dayMonthLabel(attendance.lastRegisteredOn)}`;
}

function steps(action: ActionPage, attendance: AttendancePage | undefined): Step[] {
  const eventHasCome = action.status === "awaiting_attendance" || action.status === "concluded";
  const created = `${action.createdOn.slice(8, 10)}/${action.createdOn.slice(5, 7)}`;
  return [
    { label: "Cadastro", description: `Feito em ${created}`, status: "done" },
    {
      label: "Inscritas",
      description:
        eventHasCome && attendance
          ? attendanceRegistrationsText(attendance)
          : registrationsStepText(action),
      status: eventHasCome ? "done" : "current",
    },
    {
      label: "Presença",
      description:
        action.status === "concluded"
          ? `Aconteceu em ${dayMonthLabel(action.startsOn)}`
          : eventHasCome
            ? `Marque depois do evento, em ${dayMonthLabel(action.startsOn)}`
            : `Depois do evento, em ${dayMonthLabel(action.startsOn)}`,
      status: action.status === "concluded" ? "done" : eventHasCome ? "current" : "todo",
    },
  ];
}

/** A copy of the marks with these registrations marked or unmarked. */
function toggled(marks: ReadonlySet<number>, ids: number[], marked: boolean): ReadonlySet<number> {
  const next = new Set(marks);
  for (const id of ids) {
    if (marked) next.add(id);
    else next.delete(id);
  }
  return next;
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
  /** The attendance around the page, only once the day of the event came (C3). undefined: loading. */
  const [attendance, setAttendance] = useState<AttendancePage | null | undefined>(undefined);
  const [listVersion, setListVersion] = useState(0);
  const [importing, setImporting] = useState(false);
  const [adding, setAdding] = useState(false);
  /** The list to mark who came is open, with the registrations marked so far (#339). */
  const [marking, setMarking] = useState(false);
  const [marks, setMarks] = useState<ReadonlySet<number>>(new Set());

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

  const hasAttendance = action?.status === "awaiting_attendance" || action?.status === "concluded";

  // From the day of the event the page is the one of the attendance (RN-37).
  useEffect(() => {
    if (actionId === null || !hasAttendance) return;
    const controller = new AbortController();
    getAttendance(actionId, controller.signal).then(
      (found) => {
        setFailed(false);
        setAttendance(found);
      },
      () => {
        if (!controller.signal.aborted) setFailed(true);
      },
    );
    return () => controller.abort();
  }, [actionId, hasAttendance, attempt]);

  /** Opens the list to mark. Every opening starts from what was saved: the rest is lost (#339). */
  function openList() {
    setMarks(new Set());
    setMarking(true);
  }

  /** Fetches the action and the list again. */
  function reload() {
    setAttempt((value) => value + 1);
    setListVersion((value) => value + 1);
  }

  if (actionId === null || action === null || attendance === null) notFound();

  if (failed && (action === undefined || (hasAttendance && attendance === undefined))) {
    return <LoadFailed onRetry={() => {
          setFailed(false);
          reload();
        }} />;
  }

  return (
    <>
      <CoordHeader active="acoes" groupName={groupName} accountInitial={accountInitial} />
      <main className={styles.main}>
        {action === undefined || (hasAttendance && attendance === undefined) ? (
          <Loading label="Carregando a ação…" />
        ) : (
          <>
            <ActionHeader action={action} />
            <div className={styles.steps}>
              <StepTracker steps={steps(action, attendance)} />
            </div>
            <div className={styles.columns}>
              {marking && attendance ? (
                <AttendanceMarking
                  attendance={attendance}
                  marks={marks}
                  onToggle={(id, marked) => setMarks((current) => toggled(current, [id], marked))}
                  onToggleAll={(marked) =>
                    setMarks((current) =>
                      toggled(current, attendance.girls.map((girl) => girl.id), marked),
                    )
                  }
                  onBack={() => setMarking(false)}
                />
              ) : (
                <RegistrationsCard
                  action={action}
                  reloadToken={listVersion}
                  onImport={() => setImporting(true)}
                  onAdd={() => setAdding(true)}
                />
              )}
              <aside className={styles.aside} aria-label="Próximos passos">
                {action.status === "awaiting_attendance" ? (
                  marking ? (
                    <AfterAttendanceCard />
                  ) : (
                    <AttendanceAside action={action} onMark={openList} />
                  )
                ) : (
                  <RegistrationsSwitch action={action} onChanged={reload} />
                )}
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
