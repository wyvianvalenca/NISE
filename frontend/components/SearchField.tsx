import type { InputHTMLAttributes } from "react";
import { Icon } from "./Icon";
import styles from "./SearchField.module.css";

type SearchFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  /** Descreve a busca para leitor de tela, ex.: "Buscar ação". */
  label: string;
};

/** Campo de busca com lupa (Figma: Busca). O placeholder padrão é o próprio label. */
export function SearchField({ label, placeholder, className, ...rest }: SearchFieldProps) {
  return (
    <div className={className ? `${styles.search} ${className}` : styles.search}>
      <Icon name="search" className={styles.icon} />
      <input
        {...rest}
        type="search"
        aria-label={label}
        placeholder={placeholder ?? label}
        className={styles.input}
      />
    </div>
  );
}
