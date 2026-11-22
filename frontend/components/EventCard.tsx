import Image from "next/image";
import { Icon, type IconName } from "./Icon";
import styles from "./EventCard.module.css";

type EventCardProps = {
  /** Grupo que organiza, ex.: "Rendeiras do Código". */
  group: string;
  title: string;
  /** Data e lugar, ex.: "Sáb, 11 de out · Maceió". */
  details: string;
  /** Ícone no lugar do símbolo da NISE, como o foguete do hackathon na A09. */
  icon?: IconName;
};

/** Resumo de uma ação do grupo (Figma: Card / Evento, telas A03, A09, A17, A18). */
export function EventCard({ group, title, details, icon }: EventCardProps) {
  return (
    <div className={styles.card}>
      <span className={styles.icon}>
        {icon ? (
          <Icon name={icon} size={24} />
        ) : (
          <Image src="/icons/simbolo-nise.svg" alt="" width={26} height={26} unoptimized />
        )}
      </span>
      <div className={styles.texts}>
        <p className={styles.group}>{group}</p>
        <p className={styles.title}>{title}</p>
        <p className={styles.details}>{details}</p>
      </div>
    </div>
  );
}
