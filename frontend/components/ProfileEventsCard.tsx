import { formatDate } from "@/lib/evento";
import styles from "./ProfileCard.module.css";
import eventStyles from "./ProfileEventsCard.module.css";

type ProfileEventsCardProps = {
  /** Os eventos como a rota devolve: o nome e o dia (AAAA-MM-DD), do mais recente para o mais antigo. */
  events: { name: string; date: string }[];
};

/**
 * "Eventos de que você participou" na A10 (RF-F2.03): as ações em que ela teve
 * presença, de todos os grupos. Cartão próprio, e não dentro de "Seu grupo"
 * como no Figma (decisão do dev, #391). Sem eventos, não mostra nada.
 */
export function ProfileEventsCard({ events }: ProfileEventsCardProps) {
  if (events.length === 0) return null;

  return (
    <section className={styles.section} aria-labelledby="perfil-eventos">
      <h2 id="perfil-eventos" className={styles.heading}>
        Eventos de que você participou
      </h2>
      <div className={styles.card}>
        {events.map((event, index) => (
          // Dois eventos podem ter o mesmo nome e dia; a ordem não muda na tela.
          <div key={index} className={eventStyles.event}>
            <span className={eventStyles.eventName}>{event.name}</span>
            <span className={eventStyles.eventDate}>{formatDate(event.date, true)}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
