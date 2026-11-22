import { Suspense } from "react";
import { CoordHeader } from "@/components/CoordHeader";
import { getCoordinator } from "@/lib/coordinator";
import styles from "../../page.module.css";
import { EditActionLoader } from "./EditActionLoader";

/**
 * K02 filled in, to edit an action of the coordinator's group (#222,
 * RF-F30.11). It reuses the form of the registration. The id comes from the
 * URL, so the form waits inside a `Suspense` and the header shows at once.
 */
export default async function EditActionPage() {
  const coordinator = await getCoordinator();

  return (
    <>
      <CoordHeader
        active="acoes"
        groupName={coordinator.groupName}
        accountInitial={coordinator.initial}
      />
      <main className={styles.main}>
        <Suspense fallback={<p aria-live="polite">Carregando…</p>}>
          <EditActionLoader />
        </Suspense>
      </main>
    </>
  );
}
