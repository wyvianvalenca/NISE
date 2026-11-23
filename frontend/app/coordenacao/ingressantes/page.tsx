import { CoordHeader } from "@/components/CoordHeader";
import { getCoordinator } from "@/lib/coordinator";
import { WhoEntered } from "./WhoEntered";
import styles from "./page.module.css";

/**
 * K06 Ingressantes (C8, Figma 511:10957). Por enquanto só "Quem ingressou"
 * (#315); o resumo do topo é o #316 e o card da busca, o #317.
 */
export default async function CoordEnrollmentsPage() {
  const coordinator = await getCoordinator();

  return (
    <>
      <CoordHeader
        active="ingressantes"
        groupName={coordinator.groupName}
        accountInitial={coordinator.initial}
      />
      <main className={styles.main}>
        <h1 className={styles.title}>Ingressantes</h1>
        {/* "do grupo" para qualquer nome de grupo (resposta 7 no #263). */}
        <p className={styles.subtitle}>
          Acompanhe quem das ações do grupo <strong>{coordinator.groupName}</strong> entrou
          num curso de computação.
        </p>
        <WhoEntered />
      </main>
    </>
  );
}
