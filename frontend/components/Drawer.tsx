"use client";

import { useId, type ReactNode } from "react";
import { Icon } from "./Icon";
import { useDialog } from "./useDialog";
import styles from "./Drawer.module.css";

type DrawerProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Linha abaixo do título, ex.: o nome da ação. */
  subtitle?: string;
  children: ReactNode;
  /** Botões fixos no rodapé. */
  footer?: ReactNode;
  /** Beside the close button, e.g. the steps of the import (#234). */
  headerExtra?: ReactNode;
  /** The wide panel of the import (Figma: Drawer / Importar inscritas). */
  wide?: boolean;
};

/** Painel lateral da coordenadora (Figma: Painel / Adicionar inscrita). */
export function Drawer({ open, onClose, title, subtitle, children, footer, headerExtra, wide }: DrawerProps) {
  const ref = useDialog(open, onClose);
  const titleId = useId();

  return (
    <dialog ref={ref} className={wide ? `${styles.drawer} ${styles.wide}` : styles.drawer} aria-labelledby={titleId}>
      <div className={styles.header}>
        <div className={styles.heading}>
          <h2 id={titleId} className={styles.title}>
            {title}
          </h2>
          {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
        </div>
        {headerExtra && <div className={styles.extra}>{headerExtra}</div>}
        <button
          type="button"
          className={styles.close}
          aria-label="Fechar painel"
          onClick={() => ref.current?.close()}
        >
          <Icon name="x" />
        </button>
      </div>
      <div className={styles.body}>{children}</div>
      {footer && <div className={styles.footer}>{footer}</div>}
    </dialog>
  );
}
