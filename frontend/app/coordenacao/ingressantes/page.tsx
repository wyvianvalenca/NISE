import { CoordHeader } from "@/components/CoordHeader";
import { getCoordinator } from "@/lib/coordinator";
import { SearchCard } from "./SearchCard";
import { WhoEntered } from "./WhoEntered";
import styles from "./page.module.css";

/**
 * K06 Ingressantes (C8, Figma 511:10957). Por enquanto "Quem ingressou"
 * (#315) e o card da busca (#317); o resumo do topo é o #316.
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
        <SearchCard />
        <WhoEntered />
      </main>
    </>
  );
}
