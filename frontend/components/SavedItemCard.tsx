import type { Ref } from "react";
import { Button } from "./Button";
import { Icon, type IconName } from "./Icon";
import styles from "./SavedItemCard.module.css";

type SavedItemCardProps = {
  icon: IconName;
  /** "pink" para eventos, "teal" para atividades. */
  tone: "pink" | "teal";
  /** Tipo e faixa, ex.: "Hackathon · Grande desafio". */
  meta: string;
  title: string;
  /** Formato, lugar e duração, ex.: "Presencial · Maceió · 2 dias". */
  details: string;
  /** Prazo de inscrição já escrito, ex.: "Inscrições até 30 de outubro". Só eventos. */
  deadline?: string;
  /** Bloqueia os botões enquanto a escolha é salva. */
  busy?: boolean;
  onWant: () => void;
  onRemove: () => void;
  /** Recebe o botão "+ Quero fazer", para a página devolver o foco depois de um item sair. */
  wantRef?: Ref<HTMLButtonElement>;
};

/** Item guardado com "Talvez depois" (Figma: Item, tela A06·2b). */
export function SavedItemCard({
  icon,
  tone,
  meta,
  title,
  details,
  deadline,
  busy = false,
  onWant,
  onRemove,
  wantRef,
}: SavedItemCardProps) {
  return (
    <article className={styles.card} aria-label={title} aria-busy={busy || undefined}>
      <div className={styles.top}>
        <span className={`${styles.iconTile} ${styles[tone]}`}>
          <Icon name={icon} size={22} />
        </span>
        <div className={styles.texts}>
          <p className={styles.meta}>{meta}</p>
          <h2 className={styles.title}>{title}</h2>
          <p className={styles.details}>{details}</p>
        </div>
      </div>
      {deadline && (
        <p className={styles.deadline}>
          <Icon name="calendar-sm" />
          {deadline}
        </p>
      )}
      <div className={styles.actions}>
        <Button ref={wantRef} size="sm" disabled={busy} onClick={onWant}>
          + Quero fazer
        </Button>
        <button type="button" className={styles.remove} disabled={busy} onClick={onRemove}>
          <Icon name="trash" />
          Remover
        </button>
      </div>
    </article>
  );
}
