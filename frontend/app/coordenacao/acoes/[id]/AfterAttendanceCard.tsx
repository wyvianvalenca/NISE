import { Icon } from "@/components/Icon";
import styles from "./AttendanceAside.module.css";

/**
 * "O que acontece depois", next to the list (#339, RF-F3.10, Should). The words
 * follow the corrections of #335: only the girls with no account get the invite,
 * and nobody is "edited" afterwards: whoever was forgotten is marked later.
 */
export function AfterAttendanceCard() {
  return (
    <section className={styles.card} aria-labelledby="after-title">
      <span className={styles.icon}>
        <Icon name="mail" size={28} />
      </span>
      <h2 id="after-title" className={styles.title}>
        O que acontece depois
      </h2>
      <ul className={styles.list}>
        <li>Só as meninas que ainda não têm conta na NISE recebem o convite para entrar.</li>
        <li>
          As presentes recebem o questionário de avaliação da ação. Responder é opcional.
        </li>
        <li>Se esquecer alguém, dá pra marcar depois.</li>
      </ul>
    </section>
  );
}
