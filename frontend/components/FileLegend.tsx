import { THEMES, type FileData, type ThemeCode } from "@/lib/file";
import styles from "./FileLegend.module.css";

/** Temas que aparecem no filé dela, na ordem dos itens. */
function themesIn(data: FileData): ThemeCode[] {
  const all = [...data.done, ...data.inProgress, ...data.next].map((item) => item.theme);
  return [...new Set(all)];
}

/** Legenda do desenho do filé (Figma: Legenda, A06·3). */
export function FileLegend({ data }: { data: FileData }) {
  const themes = themesIn(data);
  return (
    <ul className={styles.legend} aria-label="Legenda do filé">
      <li className={styles.row}>
        <span className={styles.item}>
          <span className={`${styles.swatch} ${styles.start}`} aria-hidden="true" />
          Seu começo
        </span>
        <span className={styles.item}>
          <span className={`${styles.swatch} ${styles.done}`} aria-hidden="true" />
          Concluído (cor do tema)
        </span>
      </li>
      <li className={styles.row}>
        <span className={styles.item}>
          <span className={`${styles.swatch} ${styles.inProgress}`} aria-hidden="true" />
          Em andamento
        </span>
        <span className={styles.item}>
          <span className={`${styles.swatch} ${styles.next}`} aria-hidden="true" />
          Próximas aventuras
        </span>
      </li>
      {themes.length > 0 && (
        <li className={styles.row}>
          {themes.map((code) => (
            <span key={code} className={styles.item}>
              <span className={styles.dot} style={{ background: THEMES[code].color }} aria-hidden="true" />
              {THEMES[code].label}
            </span>
          ))}
        </li>
      )}
    </ul>
  );
}
