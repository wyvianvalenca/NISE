import { useId, type TextareaHTMLAttributes } from "react";
import styles from "./TextArea.module.css";

type TextAreaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label: string;
  /** Mostra "(opcional)" depois do rótulo. */
  optional?: boolean;
  /** Error message below the field, tied to it with `aria-describedby`. */
  error?: string;
};

/** Campo de texto de várias linhas (Figma: Campo / Comentário, tela A03). */
export function TextArea({ label, optional, error, id, className, "aria-describedby": describedBy, ...rest }: TextAreaProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const errorId = `${inputId}-erro`;
  const described = [describedBy, error && errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className={className ? `${styles.field} ${className}` : styles.field}>
      <label htmlFor={inputId} className={styles.label}>
        {label}
        {optional && <span className={styles.optional}> (opcional)</span>}
      </label>
      <textarea
        {...rest}
        id={inputId}
        className={styles.input}
        aria-invalid={error ? true : undefined}
        aria-describedby={described}
      />
      {error && (
        <p id={errorId} className={styles.error}>
          {error}
        </p>
      )}
    </div>
  );
}
