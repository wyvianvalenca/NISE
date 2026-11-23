import { AppHeader } from "./AppHeader";
import styles from "./TecendoFile.module.css";

type TecendoFileProps = {
  /**
   * The girl's first name, for the "Quase lá, <name>". Without it (it has not
   * arrived yet), the line reads just "Quase lá".
   */
  name?: string | null;
  /** How many skeletons to show. Figma has five, one per band. */
  cards?: number;
  /**
   * Only the content, to sit inside a screen's own header and bottom bar. Swapping the
   * whole page made the bar disappear and come back (blank screen with the bar, E03
   * without it, then the content with it again).
   */
  embedded?: boolean;
};

/**
 * E03 "Tecendo seu filé…" (Figma 511:988): the wait while suggestions are
 * assembled (issue #81, RNF-F10.02).
 *
 * Whether it shows is decided by `useLongWait` in lib/loading.ts; this screen
 * only draws. The skeletons have the shape of the cards that will replace
 * them, so the page does not jump when the content arrives.
 */
export function TecendoFile({
  name,
  cards = 5,
  embedded = false,
}: TecendoFileProps) {
  const content = (
    <>
      <p className={styles.almost}>{name ? `Quase lá, ${name}` : "Quase lá"}</p>
      <h1 className={styles.title}>Tecendo seu filé…</h1>
      <p className={styles.lead} role="status">
        Juntando sugestões com base nos temas que você escolheu e na sua
        escolaridade.
      </p>

      <div className={styles.skeletons} aria-busy="true">
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
    </>
  );

  if (embedded) return <div className={styles.embedded}>{content}</div>;

  return (
    <div className={styles.page}>
      <AppHeader />
      <main className={styles.main}>{content}</main>
    </div>
  );
}
