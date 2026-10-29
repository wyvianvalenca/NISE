import { Icon } from "./Icon";
import styles from "./InfoHint.module.css";

type InfoHintProps = {
  /** Explicação curta que aparece ao passar o mouse ou focar o ⓘ. */
  text: string;
};

/**
 * Ícone ⓘ ao lado de um rótulo, com uma explicação (Figma: Hint / ⓘ).
 * O Figma não desenha o balão; por enquanto usamos o title do navegador.
 */
export function InfoHint({ text }: InfoHintProps) {
  return (
    <button type="button" className={styles.hint} aria-label={text} title={text}>
      <Icon name="info" />
    </button>
  );
}
