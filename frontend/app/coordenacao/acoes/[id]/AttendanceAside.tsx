import { Button } from "@/components/Button";
import { Icon } from "@/components/Icon";
import { Notice } from "@/components/Notice";
import { dayMonthLabel } from "@/lib/coord-action-labels";
import type { ActionPage } from "@/lib/coord-action-page";
import styles from "./AttendanceAside.module.css";

/**
 * Right column of K11 "Aguardando presença" (#338, RF-F3.08, RN-37): the card
 * "Próxima etapa: presença" and the note under it. The action waits from the
 * first day of the event, with or without registered girls.
 */
export function AttendanceAside({ action, onMark }: { action: ActionPage; onMark: () => void }) {
  return (
    <>
      <section className={styles.card} aria-labelledby="next-step-title">
        <span className={styles.icon}>
          <Icon name="clipboard" size={28} />
        </span>
        <h2 id="next-step-title" className={styles.title}>
          Próxima etapa: presença
        </h2>
        <p className={styles.text}>
          No dia {dayMonthLabel(action.startsOn)}, marque quem esteve na ação. Dá pra marcar na
          lista ou importar a lista de presença.
        </p>
        <Button onClick={onMark}>Marcar presença</Button>
      </section>
      <div className={styles.note}>
        <Notice icon="eye">
          Desde o dia do evento, a ação aguarda a presença. As inscrições fecharam e ela saiu das
          sugestões das meninas.
        </Notice>
      </div>
    </>
  );
}
