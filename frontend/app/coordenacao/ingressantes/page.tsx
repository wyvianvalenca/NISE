import { CoordHeader } from "@/components/CoordHeader";
import { EnrollmentsIntro } from "./EnrollmentsIntro";
import { SearchCard } from "./SearchCard";
import { WhoEntered } from "./WhoEntered";
import styles from "./page.module.css";

/**
 * K06 Ingressantes (C8, Figma 511:10957). O resumo do topo (#316), o card da
 * busca (#317) e "Quem ingressou" (#315).
 */
export default function CoordEnrollmentsPage() {
  return (
    <>
      <CoordHeader active="ingressantes" />
      <main className={styles.main}>
        <EnrollmentsIntro />
        <SearchCard />
        <WhoEntered />
      </main>
    </>
  );
}
