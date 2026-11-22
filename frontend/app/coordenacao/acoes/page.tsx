import { Suspense } from "react";
import { CoordHeader } from "@/components/CoordHeader";
import { getCoordActionList } from "@/lib/coord-actions";
import { getCoordinator } from "@/lib/coordinator";
import { ActionsList } from "./ActionsList";
import { SavedNotice } from "./SavedNotice";
import styles from "./page.module.css";

/**
 * K10 "Ações", coordinator side (RF-F30.10): the group's actions by status.
 * The notice "Ação salva." reads `?salva=<action id>`, which is how the form
 * (#212) will lead back here after saving.
 */
export default async function CoordActionsPage() {
  const [coordinator, list] = await Promise.all([getCoordinator(), getCoordActionList()]);

  return (
    <>
      <CoordHeader
        active="acoes"
        groupName={coordinator.groupName}
        accountInitial={coordinator.initial}
      />
      <main className={styles.main}>
        <Suspense>
          <SavedNotice actions={list.actions} />
        </Suspense>
        <ActionsList actions={list.actions} counts={list.counts} />
      </main>
    </>
  );
}
