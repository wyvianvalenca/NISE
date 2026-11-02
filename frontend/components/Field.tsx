import { useId, type InputHTMLAttributes } from "react";
import styles from "./Field.module.css";

type FieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  /** Mensagem de erro mostrada logo abaixo do campo. */
  error?: string;
  /** Mostra "(opcional)" depois do rótulo. */
  optional?: boolean;
};

/**
 * Campo de texto com rótulo acima (Figma: NISE/Field).
 * O Figma só tem o estado padrão; o estado de erro segue o "Leia primeiro"
 * (mensagem junto do campo) e usa o rosa do sistema.
 */
export function Field({ label, error, optional, id, className, ...rest }: FieldProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const errorId = `${inputId}-erro`;

  return (
    <div className={className ? `${styles.field} ${className}` : styles.field}>
      <label htmlFor={inputId} className={styles.label}>
        {label}
        {optional && <span className={styles.optional}> (opcional)</span>}
      </label>
      <input
        {...rest}
        id={inputId}
        className={styles.input}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
      />
      {error && (
        <p id={errorId} className={styles.error}>
          {error}
        </p>
      )}
    </div>
  );
}
