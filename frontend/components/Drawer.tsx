"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
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
  const titleRef = useRef<HTMLHeadingElement>(null);
  const firstTitle = useRef(title);

  // A new title is a new step (the import, #234): the focus goes to it, so the
  // keyboard is not left on a button that is gone (RNF-G.02).
  useEffect(() => {
    if (title === firstTitle.current) return;
    firstTitle.current = title;
    titleRef.current?.focus();
  }, [title]);

  return (
    <dialog ref={ref} className={wide ? `${styles.drawer} ${styles.wide}` : styles.drawer} aria-labelledby={titleId}>
      <div className={styles.header}>
        <div className={styles.heading}>
          <h2 id={titleId} ref={titleRef} tabIndex={-1} className={styles.title}>
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
