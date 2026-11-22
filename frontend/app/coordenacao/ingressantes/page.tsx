import { CoordHeader } from "@/components/CoordHeader";
import { getCoordinator } from "@/lib/coordinator";
import { Summary } from "./Summary";
import { SearchCard } from "./SearchCard";
import { WhoEntered } from "./WhoEntered";
import styles from "./page.module.css";

/**
 * K06 Ingressantes (C8, Figma 511:10957). O resumo do topo (#316), o card da
 * busca (#317) e "Quem ingressou" (#315).
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
        <Summary groupName={coordinator.groupName} />
        <SearchCard />
        <WhoEntered />
      </main>
    </>
  );
}
