import { AppHeader } from "./AppHeader";
import { Button } from "./Button";
import styles from "./LoadFailed.module.css";

type LoadFailedProps = {
  /** Runs the fetch again, for the "Tentar novamente" button. */
  onRetry: () => void;
  /** Optional reassurance block, drawn under the connection line. */
  reassurance?: { title: string; text: string };
};

/**
 * E04 "Não foi possível carregar" (Figma 5:437): the failure screen after a
 * wait that errored or ran past the maximum (issue #81, RNF-F10.02).
 *
 * `reassurance` is optional because node 5:437 is the sign-up version of this
 * screen: its "Seu cadastro está salvo" block talks about a filled-in form.
 * While suggestions are being generated (#81) the girl is not in a form, so
 * showing it there would put a lie on screen. The suggestions wait omits the
 * block; the sign-up (RF-S2.05, when it exists) passes it and renders exactly
 * as the Figma.
 */
export function LoadFailed({ onRetry, reassurance }: LoadFailedProps) {
  return (
    <div className={styles.page}>
      <AppHeader />

      <main className={styles.main}>
        <div role="alert">
          <h1 className={styles.title}>Não foi possível carregar</h1>
          <p className={styles.lead}>
            Sua conexão pode ter sido interrompida. Tente novamente.
          </p>
        </div>

        {reassurance && (
          <section className={styles.reassurance}>
            <h2 className={styles.reassuranceTitle}>{reassurance.title}</h2>
            <p className={styles.lead}>{reassurance.text}</p>
          </section>
        )}

        <Button className={styles.retry} onClick={onRetry}>
          Tentar novamente
        </Button>
      </main>
    </div>
  );
}
