"use client";

import { useState } from "react";
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
function tableColumns(columns: AttendancePage["columns"]): Column<AttendanceGirl>[] {
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
  ];
}

/**
 * The card "Presença" of the concluded page (K11 concluída, #348, RF-F3.07):
 * who came and who did not, from the registrations of the action.
 */
export function AttendanceResult({ attendance }: { attendance: AttendancePage }) {
  const [tab, setTab] = useState<Tab>("present");
  const [showAll, setShowAll] = useState(false);

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
        }}
        tabs={[
          { key: "present", label: "Presentes", count: present.length },
          { key: "absent", label: "Faltaram", count: absent.length },
        ]}
      />
      {rows.length === 0 ? (
        <p className={styles.none}>
          {tab === "present" ? "Ninguém foi marcada como presente." : "Todas as inscritas estiveram presentes."}
        </p>
      ) : (
        <DataTable
          caption={tab === "present" ? "Presentes na ação" : "Inscritas que faltaram"}
          columns={tableColumns(attendance.columns)}
          rows={shown}
          rowKey={(row) => String(row.id)}
        />
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
