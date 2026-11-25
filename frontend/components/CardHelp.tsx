"use client";

import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import { Icon } from "./Icon";
import styles from "./CardHelp.module.css";

type CardHelpProps = {
  /** O título do card, para o leitor de tela: "Sobre: Como o interesse evolui". */
  title: string;
  /** O texto explicativo do card. */
  children: ReactNode;
};

/**
 * Ícone "?" ao lado do título de um card: ao clicar, abre o texto que explica o
 * card (revisão do PR #465). Fecha ao clicar de novo, fora dele ou com Esc.
 */
export function CardHelp({ title, children }: CardHelpProps) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const ref = useRef<HTMLSpanElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  return (
    <span ref={ref} className={styles.wrapper}>
      <button
        ref={buttonRef}
        type="button"
        className={styles.button}
        aria-label={`Sobre: ${title}`}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
      >
        <Icon name="question" size={18} />
      </button>
      <span id={panelId} role="note" hidden={!open} className={styles.panel}>
        {children}
      </span>
    </span>
  );
}

/** O título do card com o "?" ao lado. */
export function CardTitle({
  id,
  className,
  title,
  help,
}: {
  id: string;
  className: string;
  title: string;
  help: ReactNode;
}) {
  return (
    <div className={styles.titleRow}>
      <h2 id={id} className={className}>
        {title}
      </h2>
      <CardHelp title={title}>{help}</CardHelp>
    </div>
  );
}
