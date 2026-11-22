"use client";

import { useState } from "react";
import { Tabs } from "@/components/Tabs";
import type { ActionPage } from "@/lib/coord-action-page";
import type { AttendancePage } from "@/lib/coord-attendance";
import { AttendanceResult } from "./AttendanceResult";
import { RegistrationsCard } from "./RegistrationsCard";
import styles from "./ConcludedMain.module.css";

type Tab = "attendance" | "registrations";

/**
 * Left column of K11 "concluída" (#348): the tab "Presença 17 de 23" with the
 * card "Presença", and the registered girls, only to read. The tab "Avaliação"
 * of the Figma comes with the evaluation of the event (epic #136).
 */
export function ConcludedMain({
  action,
  attendance,
  reloadToken,
}: {
  action: ActionPage;
  attendance: AttendancePage;
  reloadToken: number;
}) {
  const [tab, setTab] = useState<Tab>("attendance");

  return (
    <div className={styles.main}>
      <Tabs
        label="Seções da ação"
        active={tab}
        onChange={setTab}
        tabs={[
          { key: "attendance", label: "Presença", count: `${attendance.presentCount} de ${attendance.registeredCount}` },
          { key: "registrations", label: "Inscritas", count: attendance.registeredCount },
        ]}
      />
      {tab === "attendance" ? (
        <AttendanceResult attendance={attendance} />
      ) : (
        <RegistrationsCard action={action} reloadToken={reloadToken} readOnly />
      )}
    </div>
  );
}
