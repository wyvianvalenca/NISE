import { AdminHeader } from "@/components/AdminHeader";
import { getAdminCoordinators } from "@/lib/admin-coordinators";
import { CoordinatorsList } from "./CoordinatorsList";
import styles from "./page.module.css";

/** AD02 "Coordenadoras" (RF-S2.24): the NISE team sees every coordinator and her situation. */
export default async function AdminCoordinatorsPage() {
  const { items } = await getAdminCoordinators();

  return (
    <>
      <AdminHeader active="coordenadoras" />
      <main className={styles.main}>
        <CoordinatorsList coordinators={items} />
      </main>
    </>
  );
}
