import { CoordHeader } from "@/components/CoordHeader";
import { getCoordinator } from "@/lib/coordinator";
import { ActionsView } from "./ActionsView";
import styles from "./page.module.css";

/**
 * K10 "Ações", coordinator side (RF-F30.10): the group's actions by status.
 * The list is loaded in the browser by `ActionsView`.
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
        <ActionsView />
      </main>
    </>
  );
}
