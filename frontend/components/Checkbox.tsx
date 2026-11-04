"use client";

import { useEffect, useRef, type ChangeEvent, type InputHTMLAttributes, type ReactNode } from "react";
import styles from "./Checkbox.module.css";

type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type">;

/**
 * Num celular lento, a menina pode marcar a caixa antes de o React carregar.
 * Quando a caixa é controlada (`checked`), o React desfaz esse clique sem aviso.
 * Ao montar, se a caixa na tela já difere de `checked`, avisamos o `onChange`
 * para a tela guardar o clique que ela já deu.
 */
function useKeepClickBeforeHydration(checked: InputProps["checked"], onChange: InputProps["onChange"]) {
  const ref = useRef<HTMLInputElement>(null);
  const firstRender = useRef({ checked, onChange });

  useEffect(() => {
    const input = ref.current;
    const { checked, onChange } = firstRender.current;
    if (input && checked !== undefined && onChange && input.checked !== checked) {
      onChange({ target: input, currentTarget: input } as ChangeEvent<HTMLInputElement>);
    }
  }, []);

  return ref;
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
export function Checkbox({ children, variant = "plain", className, ...rest }: CheckboxProps) {
  const ref = useKeepClickBeforeHydration(rest.checked, rest.onChange);
  return (
    <label className={[styles.option, styles[variant], className].filter(Boolean).join(" ")}>
      <input {...rest} ref={ref} type="checkbox" className={styles.box} />
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
export function RadioCard({ title, description, className, ...rest }: RadioCardProps) {
  const ref = useKeepClickBeforeHydration(rest.checked, rest.onChange);
  return (
    <label className={[styles.option, styles.card, className].filter(Boolean).join(" ")}>
      <input {...rest} ref={ref} type="radio" className={styles.radio} />
      <span className={styles.texts}>
        <span className={styles.title}>{title}</span>
        {description && <span className={styles.description}>{description}</span>}
      </span>
    </label>
  );
}
