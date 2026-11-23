import { CoordHeader } from "@/components/CoordHeader";
import { getCoordinator } from "@/lib/coordinator";
import { ExportWizard } from "./ExportWizard";
import styles from "./page.module.css";

/**
 * Exportar dados anônimos (F24, #375, RF-F24.30): quatro passos, Recorte,
 * Conteúdo, Revisão e Pronto. Os passos não se clicam.
 */
export default async function CoordExportPage() {
  const coordinator = await getCoordinator();

  return (
    <>
      <CoordHeader
        active="exportar"
        groupName={coordinator.groupName}
        accountInitial={coordinator.initial}
      />
      <main className={styles.main}>
        <h1 className={styles.title}>Exportar dados anônimos</h1>
        <p className={styles.subtitle}>
          Um arquivo com uma linha por menina em cada ação, sem nada que identifique quem é.
        </p>
        <ExportWizard />
      </main>
    </>
  );
}
