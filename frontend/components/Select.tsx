import { useId, type SelectHTMLAttributes } from "react";
import { Icon } from "./Icon";
import styles from "./Select.module.css";

type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  label: string;
};

/**
 * Seletor com rótulo acima, usado nos filtros (Figma: Filtro / Período).
 * Usa o <select> nativo para funcionar bem com teclado e leitor de tela.
 * As opções vão como filhos: <option value="12m">Últimos 12 meses</option>.
 */
export function Select({ label, id, className, children, ...rest }: SelectProps) {
  const generatedId = useId();
  const selectId = id ?? generatedId;

  return (
    <div className={className ? `${styles.field} ${className}` : styles.field}>
      <label htmlFor={selectId} className={styles.label}>
        {label}
      </label>
      <div className={styles.control}>
        <select {...rest} id={selectId} className={styles.select}>
          {children}
        </select>
        <Icon name="chevron-down" className={styles.chevron} />
      </div>
    </div>
  );
}
