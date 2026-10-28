import type { ButtonHTMLAttributes, ReactNode } from "react";
import styles from "./Chip.module.css";

type ChipProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "type"> & {
  selected: boolean;
  /** Número ao lado do texto, como nos filtros "Todas 10". */
  count?: number;
  /** "lg" é o tamanho do painel de motivo, no celular. */
  size?: "md" | "lg";
};

/**
 * Opção que liga e desliga (Figma: Chip / Oficina, Filtro / Todas).
 * Serve para escolher o tipo da ação e para os filtros das listas.
 */
export function Chip({ selected, count, size = "md", className, children, ...rest }: ChipProps) {
  return (
    <button
      {...rest}
      type="button"
      aria-pressed={selected}
      className={[styles.chip, styles[size], className].filter(Boolean).join(" ")}
    >
      {children}
      {count !== undefined && <span className={styles.count}>{count}</span>}
    </button>
  );
}

type ChipGroupProps = {
  label: string;
  children: ReactNode;
};

/** Rótulo + lista de chips (Figma: Grupo / Tipo). */
export function ChipGroup({ label, children }: ChipGroupProps) {
  return (
    <fieldset className={styles.group}>
      <legend className={styles.legend}>{label}</legend>
      <div className={styles.options}>{children}</div>
    </fieldset>
  );
}
