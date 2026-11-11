import { AppHeader } from "./AppHeader";
import styles from "./TecendoFile.module.css";

type TecendoFileProps = {
  /** The girl's first name, for the "Quase lá, <name>". */
  name: string;
  /** How many skeletons to show. Figma has five, one per band. */
  cards?: number;
};

/**
 * E03 "Tecendo seu filé…" (Figma 511:988): the wait while suggestions are
 * assembled (issue #81, RNF-F10.02).
 *
 * Whether it shows is decided by `useLongWait` in lib/loading.ts; this screen
 * only draws. The skeletons have the shape of the cards that will replace
 * them, so the page does not jump when the content arrives.
 */
export function TecendoFile({ name, cards = 5 }: TecendoFileProps) {
  return (
    <div className={styles.page}>
      <AppHeader />

      <main className={styles.main} aria-busy="true">
        <p className={styles.almost}>Quase lá, {name}</p>
        <h1 className={styles.title}>Tecendo seu filé…</h1>
        <p className={styles.lead}>
          Juntando sugestões com base nos temas que você escolheu e na sua
          escolaridade.
        </p>

        <div className={styles.skeletons}>
          {Array.from({ length: cards }, (_, i) => (
            <div key={i} className={styles.card} aria-hidden="true">
              <span className={styles.icon} />
              <span className={styles.lines}>
                <span className={styles.heading} />
                <span className={styles.line} />
                <span className={styles.shortLine} />
              </span>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
