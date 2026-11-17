import { CoordHeader } from "@/components/CoordHeader";
import { getCoordinator } from "@/lib/coordinator";
import styles from "./page.module.css";

/**
 * K10 "Ações", coordinator side. For now it holds only the top menu (#210);
 * the action list comes with #216.
 */
export default async function CoordActionsPage() {
  const coordinator = await getCoordinator();

  return (
    <>
      <CoordHeader
        active="acoes"
        groupName={coordinator.groupName}
        accountInitial={coordinator.initial}
      />
      <main className={styles.main}>
        <h1 className={styles.title}>Ações</h1>
      </main>
    </>
  );
}
