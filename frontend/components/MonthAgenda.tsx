import styles from "./MonthAgenda.module.css";

export type AgendaItem = {
  id: string;
  /** Dia do mês com dois dígitos, ex.: "08". */
  day: string;
  /** Dia da semana abreviado, ex.: "dom". */
  weekday: string;
  title: string;
  /** Linha menor, ex.: "Lembrete por e-mail". */
  details: string;
  /** "teal": lembrete. "pink": questionário (pede resposta). */
  tone?: "teal" | "pink";
};

type MonthAgendaProps = {
  /** Título do mês, ex.: "Novembro 2026". */
  month: string;
  items: AgendaItem[];
};

/** Lista de contatos de um mês (Figma: Mês / Novembro, tela A14). */
export function MonthAgenda({ month, items }: MonthAgendaProps) {
  return (
    <section className={styles.month}>
      <h2 className={styles.title}>{month}</h2>
      <ul className={styles.list}>
        {items.map((item) => (
          <li key={item.id} className={`${styles.item} ${styles[item.tone ?? "teal"]}`}>
            <span className={styles.date}>
              <span className={styles.day}>{item.day}</span>
              <span className={styles.weekday}>{item.weekday}</span>
            </span>
            <span className={styles.bar} aria-hidden="true" />
            <span className={styles.texts}>
              <span className={styles.itemTitle}>{item.title}</span>
              <span className={styles.details}>{item.details}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
