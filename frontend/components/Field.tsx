"use client";

import {
  useEffect,
  useEffectEvent,
  useId,
  useRef,
  type InputHTMLAttributes,
} from "react";
import styles from "./Field.module.css";

/**
 * Os campos são não controlados: quem guarda o texto é o próprio input, não o
 * React. Por isso não aceitam `value`; use `defaultValue` para o valor inicial
 * e `onValueChange` para saber quando muda.
 *
 * Motivo: num celular lento a menina pode começar a digitar antes de o React
 * terminar de carregar (hidratação). Com `value`, o React devolve o campo ao
 * valor do estado e o que ela digitou some sem aviso (review do #69). É o
 * mesmo motivo do `Checkbox`.
 */
type FieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, "value"> & {
  label: string;
  /** Mensagem de erro mostrada logo abaixo do campo. */
  error?: string;
  /** Mostra "(opcional)" depois do rótulo. */
  optional?: boolean;
  /** Avisa a cada mudança, e também quando ela digitou antes da hidratação. */
  onValueChange?: (value: string) => void;
};

/**
 * Campo de texto com rótulo acima (Figma: NISE/Field).
 * O Figma só tem o estado padrão; o estado de erro segue o "Leia primeiro"
 * (mensagem junto do campo) e usa o rosa do sistema.
 */
export function Field({
  label,
  error,
  optional,
  id,
  className,
  onChange,
  onValueChange,
  ...rest
}: FieldProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const errorId = `${inputId}-erro`;
  const ref = useRef<HTMLInputElement>(null);
  const avisar = useEffectEvent((value: string) => onValueChange?.(value));

  useEffect(() => {
    const input = ref.current;
    if (input && input.value !== input.defaultValue) {
      avisar(input.value);
    }
  }, []);

  return (
    <div className={className ? `${styles.field} ${className}` : styles.field}>
      <label htmlFor={inputId} className={styles.label}>
        {label}
        {optional && <span className={styles.optional}> (opcional)</span>}
      </label>
      <input
        {...rest}
        ref={ref}
        id={inputId}
        className={styles.input}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        onChange={(evento) => {
          onChange?.(evento);
          onValueChange?.(evento.target.value);
        }}
      />
      {error && (
        <p id={errorId} className={styles.error}>
          {error}
        </p>
      )}
    </div>
  );
}
