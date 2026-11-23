import { ActionForm } from "@/components/ActionForm";
import { CoordHeader } from "@/components/CoordHeader";
import { EMPTY_ACTION } from "@/lib/action-form";
import { getCoordinator } from "@/lib/coordinator";
import styles from "../page.module.css";

/**
 * K02 "Nova ação": registers an action of the coordinator's group (#212,
 * RF-F30.01 and RF-F30.03). The save goes through the provisional contract of
 * `lib/action-form.ts` until the route of #213 exists.
 */
export default async function NewActionPage() {
  const coordinator = await getCoordinator();

  return (
    <>
      <CoordHeader
        active="acoes"
        groupName={coordinator.groupName}
        accountInitial={coordinator.initial}
      />
      <main className={styles.main}>
        <ActionForm initialValues={EMPTY_ACTION} />
      </main>
    </>
  );
}
