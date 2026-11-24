"use client";

import styles from "./Switch.module.css";

type SwitchProps = {
  checked: boolean;
  /** Recebe o novo valor (o contrário de `checked`). */
  onChange: (checked: boolean) => void;
  /** `id` do texto visível que dá o nome ao interruptor (ex.: o título "Oportunidades"). */
  labelledBy: string;
  /** Enquanto salva: o toque não faz nada, mas o botão continua focável. */
  busy?: boolean;
};

/**
 * Interruptor de ligar e desligar (Figma: Toggle / Ligado). O estado aparece
 * também na posição da bolinha (direita = ligado), não só na cor (RNF-G.02), e
 * o leitor de tela lê `aria-checked`.
 */
export function Switch({ checked, onChange, labelledBy, busy = false }: SwitchProps) {
  function handleClick() {
    if (busy) return;
    onChange(!checked);
  }

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-labelledby={labelledBy}
      aria-busy={busy}
      className={styles.switch}
      onClick={handleClick}
    >
      <span className={`${styles.track} ${checked ? styles.on : ""}`} aria-hidden="true">
        <span className={styles.knob} />
      </span>
    </button>
  );
}
