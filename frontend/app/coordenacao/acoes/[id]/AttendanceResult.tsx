"use client";

import { useState, type ReactNode } from "react";
import { Button } from "@/components/Button";
import { DataTable, type Column } from "@/components/DataTable";
import { Icon } from "@/components/Icon";
import { Tabs } from "@/components/Tabs";
import type { AttendanceGirl, AttendancePage } from "@/lib/coord-attendance";
import styles from "./AttendanceResult.module.css";

/** How many girls show before "Ver todas as N" (RF-F1.14). */
const FIRST_PAGE = 6;

type Tab = "present" | "absent";

/** Name and e-mail always; the other fields only when some girl has them. */
function tableColumns(
  columns: AttendancePage["columns"],
  markButton?: (girl: AttendanceGirl) => ReactNode,
): Column<AttendanceGirl>[] {
  const optional: Record<AttendancePage["columns"][number], Column<AttendanceGirl>> = {
    whatsapp: { key: "whatsapp", header: "WhatsApp", render: (row) => row.whatsapp ?? "" },
    study_stage: {
      key: "study_stage",
      header: "Nível de escolaridade",
      render: (row) => row.studyStage ?? "",
    },
    school_year: { key: "school_year", header: "Série", render: (row) => row.schoolYear ?? "" },
  };
  return [
    { key: "name", header: "Nome", render: (row) => row.name, emphasis: true },
    { key: "email", header: "E-mail", render: (row) => row.email },
    ...columns.map((column) => optional[column]),
    ...(markButton
      ? [{ key: "mark", header: "Ação", render: markButton, align: "right" as const }]
      : []),
  ];
}

type ResultProps = {
  attendance: AttendancePage;
  /** "Marcar presença" on a row of "Faltaram" (#350); true when it worked. */
  onMarkPresent: (participationId: number) => Promise<boolean>;
  /** "Veio sem inscrição? Adicionar participante" (#350). */
  onAddWalkIn: () => void;
};

/**
 * The card "Presença" of the concluded page (K11 concluída, #348, RF-F3.07):
 * who came and who did not, from the registrations of the action. After
 * concluding people are only added: from "Faltaram" or with "Veio sem
 * inscrição?" (#350, D-80). There is no way to unmark.
 */
export function AttendanceResult({ attendance, onMarkPresent, onAddWalkIn }: ResultProps) {
  const [tab, setTab] = useState<Tab>("present");
  const [showAll, setShowAll] = useState(false);
  /** The row being marked, so a second tap waits for the first. */
  const [marking, setMarking] = useState<number | null>(null);
  /** What happened to the last tap: who was marked, or that it did not work. */
  const [outcome, setOutcome] = useState<{ ok: boolean; name: string } | null>(null);

  async function markPresent(girl: AttendanceGirl) {
    if (marking !== null) return;
    setMarking(girl.id);
    const ok = await onMarkPresent(girl.id);
    setMarking(null);
    setOutcome({ ok, name: girl.name });
  }

  const present = attendance.girls.filter((girl) => girl.present);
  const absent = attendance.girls.filter((girl) => !girl.present);
  const rows = tab === "present" ? present : absent;
  const shown = showAll ? rows : rows.slice(0, FIRST_PAGE);

  return (
    <section className={styles.card} aria-labelledby="result-title">
      <h2 id="result-title" className={styles.title}>
        Presença
      </h2>
      <p className={styles.summary}>
        <b>{present.length}</b> de {attendance.registeredCount} inscritas estiveram presentes.
      </p>
      <Tabs
        label="Presença"
        active={tab}
        onChange={(key) => {
          setTab(key);
          setShowAll(false);
          setOutcome(null);
        }}
        tabs={[
          { key: "present", label: "Presentes", count: present.length },
          { key: "absent", label: "Faltaram", count: absent.length },
        ]}
      />
      <button type="button" className={styles.walkIn} onClick={onAddWalkIn}>
        <Icon name="user-plus" />
        Veio sem inscrição? Adicionar participante
      </button>
      {outcome && (
        <p role="status" className={outcome.ok ? styles.done : styles.error}>
          {outcome.ok
            ? `${outcome.name} agora está entre as presentes e recebeu a avaliação.`
            : "Não deu pra marcar a presença agora. Tente de novo."}
        </p>
      )}
      {rows.length === 0 ? (
        <p className={styles.none}>
          {tab === "present" ? "Ninguém foi marcada como presente." : "Todas as inscritas estiveram presentes."}
        </p>
      ) : (
        <DataTable
          caption={tab === "present" ? "Presentes na ação" : "Inscritas que faltaram"}
          columns={tableColumns(
            attendance.columns,
            tab === "absent"
              ? (girl) => (
                  <Button
                    variant="secondary"
                    size="sm"
                    loading={marking === girl.id}
                    loadingLabel="Marcando…"
                    onClick={() => void markPresent(girl)}
                    aria-label={`Marcar presença de ${girl.name}`}
                  >
                    Marcar presença
                  </Button>
                )
              : undefined,
          )}
          rows={shown}
          rowKey={(row) => String(row.id)}
        />
      )}
      {tab === "absent" && rows.length > 0 && (
        <p className={styles.note}>
          Esqueceu alguém? Ao marcar presença aqui, ela passa pros presentes e recebe a avaliação da
          ação.
        </p>
      )}
      {rows.length > shown.length && (
        <Button variant="secondary" className={styles.more} onClick={() => setShowAll(true)}>
          Ver todas as {rows.length}
          <Icon name="chevron-down" />
        </Button>
      )}
    </section>
  );
}
