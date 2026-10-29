"use client";

import { useId, type ReactNode } from "react";
import { useDialog } from "./useDialog";
import styles from "./Modal.module.css";

type ModalProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  children?: ReactNode;
  /** Botões no rodapé, alinhados à direita. */
  actions?: ReactNode;
};

/**
 * Janela de confirmação no centro da tela
 * (Figma: Janela / Finalizar inscrições, com o Véu atrás).
 */
export function Modal({ open, onClose, title, children, actions }: ModalProps) {
  const ref = useDialog(open, onClose);
  const titleId = useId();

  return (
    <dialog ref={ref} className={styles.modal} aria-labelledby={titleId}>
      <h2 id={titleId} className={styles.title}>
        {title}
      </h2>
      {children && <div className={styles.body}>{children}</div>}
      {actions && <div className={styles.actions}>{actions}</div>}
    </dialog>
  );
}
