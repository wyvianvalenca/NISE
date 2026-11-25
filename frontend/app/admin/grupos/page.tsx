import { AdminHeader } from "@/components/AdminHeader";
import { GroupsView } from "./GroupsView";
import styles from "../coordenadoras/page.module.css";

/** AD06 "Grupos" (RF-S2.29): the NISE team sees every group and which ones need a coordinator. */
export default function AdminGroupsPage() {
  return (
    <>
      <AdminHeader active="grupos" />
      <main className={styles.main}>
        <GroupsView />
      </main>
    </>
  );
}
