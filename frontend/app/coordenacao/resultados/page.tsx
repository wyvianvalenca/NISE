import { CoordHeader } from "@/components/CoordHeader";
import { getCoordinator } from "@/lib/coordinator";
import { AfterActionResults } from "./AfterActionResults";
import styles from "./page.module.css";

/**
 * Resultados · depois da ação (C5, Figma 2013:1091, RF-F5.30). Por enquanto
 * os filtros e o card "Logo depois da ação" (#367); os outros cards são as
 * histórias #368 a #372.
 */
export default async function CoordResultsPage() {
  const coordinator = await getCoordinator();

  return (
    <>
      <CoordHeader
        active="resultados"
        groupName={coordinator.groupName}
        accountInitial={coordinator.initial}
      />
      <main className={styles.main}>
        <h1 className={styles.title}>Resultados · depois da ação</h1>
        <p className={styles.subtitle}>
          Acompanha as meninas das ações do grupo no cadastro e aos 3, 6, 12 e 18 meses. Cada
          marco mostra quantas responderam.
        </p>
        <AfterActionResults />
      </main>
    </>
  );
}
