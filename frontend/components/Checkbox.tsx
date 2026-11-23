"use client";

import { useEffect, useEffectEvent, useRef, type ChangeEvent, type InputHTMLAttributes, type ReactNode } from "react";
import styles from "./Checkbox.module.css";

/**
 * As caixas são não controladas: quem guarda se está marcada é o próprio input,
 * não o React. Por isso não aceitam `checked`; use `defaultChecked` para o valor
 * inicial e `onCheckedChange` para saber quando muda.
 *
 * Motivo: num celular lento a menina pode marcar a caixa antes de o React
 * terminar de carregar (hidratação). Com `checked`, o React volta a caixa para
 * o valor do estado e o clique some sem aviso (review do #61).
 */
type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "checked"> & {
  onCheckedChange?: (checked: boolean) => void;
};

/**
 * Avisa `onCheckedChange` a cada mudança e, ao montar, também quando a caixa
 * já mudou antes da hidratação (o input na tela difere do HTML que veio do servidor).
 */
function useCheckedChange(onChange: InputProps["onChange"], onCheckedChange: InputProps["onCheckedChange"]) {
  const ref = useRef<HTMLInputElement>(null);
  const report = useEffectEvent((checked: boolean) => onCheckedChange?.(checked));

  useEffect(() => {
    const input = ref.current;
    if (input && input.checked !== input.defaultChecked) report(input.checked);
  }, []);

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    onChange?.(event);
    onCheckedChange?.(event.target.checked);
  }

  return { ref, onChange: handleChange };
}

type CheckboxProps = InputProps & {
  children: ReactNode;
  /**
   * "plain": caixa + texto, como o aceite dos termos.
   * "card": a linha inteira fica verde quando marcada, como na lista de presença.
   */
  variant?: "plain" | "card";
};

/** Caixa de marcar (Figma: Checkbox, Checkbox marcado, Participante / ...). */
export function Checkbox({ children, variant = "plain", className, onChange, onCheckedChange, ...rest }: CheckboxProps) {
  const input = useCheckedChange(onChange, onCheckedChange);
  return (
    <label className={[styles.option, styles[variant], className].filter(Boolean).join(" ")}>
      <input {...rest} {...input} type="checkbox" className={styles.box} />
      <span className={styles.label}>{children}</span>
    </label>
  );
}

type RadioCardProps = InputProps & {
  title: string;
  description?: string;
};

/**
 * Opção grande de escolha única (Figma: Opção / Feed, Opção / Story).
 * Use o mesmo `name` em todas as opções do grupo.
 */
export function RadioCard({ title, description, className, onChange, onCheckedChange, ...rest }: RadioCardProps) {
  const input = useCheckedChange(onChange, onCheckedChange);
  return (
    <label className={[styles.option, styles.card, className].filter(Boolean).join(" ")}>
      <input {...rest} {...input} type="radio" className={styles.radio} />
      <span className={styles.texts}>
        <span className={styles.title}>{title}</span>
        {description && <span className={styles.description}>{description}</span>}
      </span>
    </label>
  );
}
