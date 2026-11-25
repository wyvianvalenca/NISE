"use client";

import { useCoordinator } from "@/lib/coordinator";
import { Summary } from "./Summary";
import styles from "./page.module.css";

/**
 * The subtitle and the summary of K06, which name the coordinator's group.
 * The name comes from the session, so it fills in after the first paint; until
 * then, and for a coordinator with no group, the text just says "do grupo".
 */
export function EnrollmentsIntro() {
  const session = useCoordinator();
  const groupName = session?.ok ? session.coordinator.groupName : null;

  return (
    <>
      <h1 className={styles.title}>Ingressantes</h1>
      <p className={styles.subtitle}>
        Acompanhe quem das ações do grupo{groupName && <> <strong>{groupName}</strong></>} entrou
        num curso de computação.
      </p>
      <Summary groupName={groupName} />
    </>
  );
}
