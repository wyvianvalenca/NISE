import { Icon } from "@/components/Icon";
import type { AttendancePage } from "@/lib/coord-attendance";
import { PendingLink } from "../PendingLink";
import styles from "./AttendanceAside.module.css";

/**
 * "Depois da ação" (K11 concluída, #348, RF-F3.10, Should): how many invites and
 * evaluations went out. The invite number only counts the girls who received
 * it, not the ones who already had an account (D-81).
 */
export function AfterActionCard({ attendance }: { attendance: AttendancePage }) {
  const invites = attendance.invitesSent;
  const evaluations = attendance.evaluationsSent;

  return (
    <section className={styles.card} aria-labelledby="after-action-title">
      <span className={styles.icon}>
        <Icon name="mail" size={28} />
      </span>
      <h2 id="after-action-title" className={styles.title}>
        Depois da ação
      </h2>
      <ul className={styles.list}>
        <li>
          {invites === 1 ? "Convite enviado a 1 inscrita." : `Convite enviado às ${invites} inscritas.`}
        </li>
        <li>
          {evaluations === 1
            ? "Avaliação enviada a 1 presente."
            : `Avaliação enviada às ${evaluations} presentes.`}
        </li>
      </ul>
      {/* The evaluation screen comes with epic #136. */}
      <PendingLink variant="text">Ver avaliação</PendingLink>
    </section>
  );
}
