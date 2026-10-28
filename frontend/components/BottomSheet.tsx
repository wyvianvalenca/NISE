"use client";

import { useId, type ReactNode } from "react";
import { Icon } from "./Icon";
import { useDialog } from "./useDialog";
import styles from "./BottomSheet.module.css";

type BottomSheetProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Texto curto abaixo do título. */
  description?: string;
  children: ReactNode;
};

/** Painel que sobe de baixo no celular da menina (Figma: Painel / Motivo). */
export function BottomSheet({ open, onClose, title, description, children }: BottomSheetProps) {
  const ref = useDialog(open, onClose);
  const titleId = useId();

  return (
    <dialog ref={ref} className={styles.sheet} aria-labelledby={titleId}>
      <div className={styles.handle} aria-hidden="true" />
      <div className={styles.heading}>
        <button
          type="button"
          className={styles.close}
          aria-label="Fechar"
          onClick={() => ref.current?.close()}
        >
          <Icon name="x" />
        </button>
        <h2 id={titleId} className={styles.title}>
          {title}
        </h2>
      </div>
      {description && <p className={styles.description}>{description}</p>}
      {children}
    </dialog>
  );
}
