import { AdminHeader } from "@/components/AdminHeader";
import { CoordinatorsView } from "./CoordinatorsView";
import styles from "./page.module.css";

/** AD02 "Coordenadoras" (RF-S2.24): the NISE team sees every coordinator and her situation. */
export default function AdminCoordinatorsPage() {
  return (
    <>
      <AdminHeader active="coordenadoras" />
      <main className={styles.main}>
        <CoordinatorsView />
      </main>
    </>
  );
}
