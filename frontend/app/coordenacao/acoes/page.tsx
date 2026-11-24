import { CoordHeader } from "@/components/CoordHeader";
import { ActionsView } from "./ActionsView";
import styles from "./page.module.css";

/**
 * K10 "Ações", coordinator side (RF-F30.10): the group's actions by status.
 * The list is loaded in the browser by `ActionsView`.
 */
export default function CoordActionsPage() {
  return (
    <>
      <CoordHeader active="acoes" />
      <main className={styles.main}>
        <ActionsView />
      </main>
    </>
  );
}
