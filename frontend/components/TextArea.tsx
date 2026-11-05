import { useId, type TextareaHTMLAttributes } from "react";
import styles from "./TextArea.module.css";

type TextAreaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label: string;
  /** Mostra "(opcional)" depois do rótulo. */
  optional?: boolean;
};

/** Campo de texto de várias linhas (Figma: Campo / Comentário, tela A03). */
export function TextArea({ label, optional, id, className, ...rest }: TextAreaProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;

  return (
    <div className={className ? `${styles.field} ${className}` : styles.field}>
      <label htmlFor={inputId} className={styles.label}>
        {label}
        {optional && <span className={styles.optional}> (opcional)</span>}
      </label>
      <textarea {...rest} id={inputId} className={styles.input} />
    </div>
  );
}
