"use client";

import { notFound, useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { CoordHeader } from "@/components/CoordHeader";
import { Button } from "@/components/Button";
import { LoadFailed } from "@/components/LoadFailed";
import { Loading } from "@/components/Loading";
import { Modal } from "@/components/Modal";
import { Toast } from "@/components/Toast";
import { StepTracker, type Step } from "@/components/StepTracker";
import { dayMonthLabel } from "@/lib/coord-action-labels";
import { getActionPage, type ActionPage } from "@/lib/coord-action-page";
import { concludeAttendance, getAttendance, saveMarks, type AttendancePage } from "@/lib/coord-attendance";
import { ActionHeader } from "./ActionHeader";
import { AddGirlDrawer } from "./AddGirlDrawer";
import { AfterActionCard } from "./AfterActionCard";
import { AfterAttendanceCard } from "./AfterAttendanceCard";
import { AttendanceAside } from "./AttendanceAside";
import { AttendanceMarking } from "./AttendanceMarking";
import { ConcludedMain } from "./ConcludedMain";
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

/** "17 presentes, registrada em 24/10" (#348). */
function concludedStepText(attendance: AttendancePage | undefined, action: ActionPage): string {
  if (!attendance || attendance.concludedOn === null) {
    return `Aconteceu em ${dayMonthLabel(action.startsOn)}`;
  }
  const count = attendance.presentCount;
  return `${count} ${count === 1 ? "presente" : "presentes"}, registrada em ${dayMonthLabel(attendance.concludedOn)}`;
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
          ? concludedStepText(attendance, action)
          : eventHasCome
            ? `Marque depois do evento, em ${dayMonthLabel(action.startsOn)}`
            : `Depois do evento, em ${dayMonthLabel(action.startsOn)}`,
      status: action.status === "concluded" ? "done" : eventHasCome ? "current" : "todo",
    },
  ];
}

/** "1 convite" / "18 convites". */
function countOf(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
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
  /** The same drawer, opened from the list to mark: "Veio sem inscrição?" (#346). */
  const [addingWalkIn, setAddingWalkIn] = useState(false);
  /** The list to mark who came is open, with the registrations marked so far (#339). */
  const [marking, setMarking] = useState(false);
  const [marks, setMarks] = useState<ReadonlySet<number>>(new Set());
  const [saving, setSaving] = useState(false);
  /** The marks as they are now, for a save that answers after she marked again. */
  const marksRef = useRef(marks);
  useEffect(() => {
    marksRef.current = marks;
  }, [marks]);
  /** The confirmation before concluding is open (#348, RF-F3.11). */
  const [concluding, setConcluding] = useState(false);
  const [concludeBusy, setConcludeBusy] = useState(false);
  const [concludeError, setConcludeError] = useState<"failed" | "refused" | null>(null);
  /** The message after concluding, above the page. */
  const [concludedMessage, setConcludedMessage] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<"saved" | "failed" | "refused" | null>(null);

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
    const saved = attendance?.girls.filter((girl) => girl.savedPresent) ?? [];
    setMarks(new Set(saved.map((girl) => girl.id)));
    setSaveState(null);
    setMarking(true);
  }

  /** "Salvar e continuar depois" (#340): keeps the marks, stays on the list. */
  async function save() {
    if (actionId === null || saving) return;
    setSaving(true);
    const sent = marks;
    const result = await saveMarks(actionId, [...sent]);
    setSaving(false);
    if (result.ok) {
      setAttendance(result.data);
      // Marked or unmarked while it saved: those changes are not saved yet.
      setSaveState(marksRef.current === sent ? "saved" : null);
      return;
    }
    // Concluded in the meantime (another tab): the page shows it as it is now.
    setSaveState(result.error === "failed" ? "failed" : "refused");
    if (result.error !== "failed") reload();
  }

  /** "Concluir presença" (#348): after the confirmation, sends the marks and concludes. */
  async function conclude() {
    if (actionId === null || concludeBusy) return;
    setConcludeBusy(true);
    setConcludeError(null);
    const result = await concludeAttendance(actionId, [...marks]);
    setConcludeBusy(false);
    if (!result.ok) {
      setConcludeError(result.error === "failed" ? "failed" : "refused");
      if (result.error !== "failed") reload();
      return;
    }
    setAttendance(result.data);
    setConcluding(false);
    setMarking(false);
    setConcludedMessage(
      `Presença registrada. ${result.data.presentCount} de ${result.data.registeredCount} estiveram presentes.`,
    );
    reload();
  }

  // Leaving the page with marks that were not saved asks first (#340, Could).
  // Only while it can still be saved: concluded in another tab, nothing is lost.
  const unsaved =
    marking &&
    action?.status === "awaiting_attendance" &&
    attendance != null &&
    (marks.size !== attendance.savedCount ||
      attendance.girls.some((girl) => girl.savedPresent !== marks.has(girl.id)));
  useEffect(() => {
    if (!unsaved) return;
    const ask = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", ask);
    return () => window.removeEventListener("beforeunload", ask);
  }, [unsaved]);

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
            {concludedMessage && action.status === "concluded" && (
              <div className={styles.message}>
                <Toast>{concludedMessage}</Toast>
              </div>
            )}
            <div className={styles.steps}>
              <StepTracker steps={steps(action, attendance)} />
            </div>
            <div className={styles.columns}>
              {marking && attendance && action.status === "awaiting_attendance" ? (
                <AttendanceMarking
                  attendance={attendance}
                  marks={marks}
                  onToggle={(id, marked) => {
                    setSaveState(null);
                    setMarks((current) => toggled(current, [id], marked));
                  }}
                  onToggleAll={(marked) => {
                    setSaveState(null);
                    setMarks((current) =>
                      toggled(current, attendance.girls.map((girl) => girl.id), marked),
                    );
                  }}
                  onBack={() => setMarking(false)}
                  onAddWalkIn={() => setAddingWalkIn(true)}
                  onConclude={() => {
                    setConcludeError(null);
                    setConcluding(true);
                  }}
                  onSave={save}
                  saving={saving}
                  saveState={saveState}
                />
              ) : action.status === "concluded" && attendance ? (
                <ConcludedMain action={action} attendance={attendance} reloadToken={listVersion} />
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
                    <AttendanceAside action={action} attendance={attendance!} onMark={openList} />
                  )
                ) : action.status === "concluded" && attendance ? (
                  <AfterActionCard attendance={attendance} />
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
            {concluding && attendance && (
              <Modal
                open
                onClose={() => setConcluding(false)}
                title="Concluir a presença?"
                actions={
                  <>
                    <Button variant="secondary" onClick={() => setConcluding(false)}>
                      Cancelar
                    </Button>
                    <Button loading={concludeBusy} loadingLabel="Concluindo…" onClick={conclude}>
                      Concluir presença
                    </Button>
                  </>
                }
              >
                <p>
                  Vão sair {countOf(attendance.invitesToSend, "convite", "convites")} e{" "}
                  {countOf(marks.size, "avaliação", "avaliações")}. Depois de concluir, só dá pra
                  acrescentar presentes, não dá pra desmarcar.
                </p>
                {concludeError && (
                  <p role="alert" className={styles.error}>
                    {concludeError === "failed"
                      ? "Não deu pra concluir agora. Suas marcações continuam na tela. Tente de novo."
                      : "A presença não pôde ser concluída agora. A página foi atualizada."}
                  </p>
                )}
              </Modal>
            )}
            {addingWalkIn && (
              <AddGirlDrawer
                actionId={action.id}
                actionName={action.name}
                walkIn
                onAdded={(registration) => {
                  // She came: she is registered and already marked (#346).
                  setSaveState(null);
                  setMarks((current) => toggled(current, [registration.id], true));
                  reload();
                }}
                onClose={() => setAddingWalkIn(false)}
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
