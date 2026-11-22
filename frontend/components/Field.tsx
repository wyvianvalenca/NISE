"use client";

import {
  useEffect,
  useEffectEvent,
  useId,
  useRef,
  type InputHTMLAttributes,
  type ReactNode,
} from "react";
import styles from "./Field.module.css";

/**
 * Fields are uncontrolled: the input itself holds the text, not React. That
 * is why they do not take `value`; use `defaultValue` for the initial value
 * and `onValueChange` to hear about changes.
 *
 * Why: on a slow phone she may start typing before React finishes loading
 * (hydration). With `value`, React puts the field back to the state's value
 * and what she typed disappears with no warning (review on #69). Same reason
 * as `Checkbox`.
 */
type FieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, "value"> & {
  label: string;
  /** Mensagem de erro mostrada logo abaixo do campo. */
  error?: string;
  /** Mostra "(opcional)" depois do rótulo. */
  optional?: boolean;
  /** Explanation under the input, tied to it with `aria-describedby` (Figma: the line under "Link de inscrição"). */
  hint?: string;
  /** Fires on every change, and on mount when she typed before hydration. */
  onValueChange?: (value: string) => void;
  /**
   * Shown right below the input, anchored to it (for example, the suggestion
   * list of `CityField`). Position it with `position: absolute`.
   */
  children?: ReactNode;
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
  hint,
  id,
  className,
  onChange,
  onValueChange,
  children,
  ...rest
}: FieldProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const errorId = `${inputId}-erro`;
  const hintId = `${inputId}-dica`;
  const describedBy = [hint && hintId, error && errorId].filter(Boolean).join(" ") || undefined;
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
      <div className={styles.control}>
        <input
          {...rest}
          ref={ref}
          id={inputId}
          className={styles.input}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          onChange={(evento) => {
            onChange?.(evento);
            onValueChange?.(evento.target.value);
          }}
        />
        {children}
      </div>
      {hint && (
        <p id={hintId} className={styles.hint}>
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className={styles.error}>
          {error}
        </p>
      )}
    </div>
  );
}
