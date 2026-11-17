import type { Metadata } from "next";
import Image from "next/image";
import { Icon } from "@/components/Icon";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Ainda não dá pra criar sua conta · NISE",
};

/**
 * A02c "Ainda não dá (menos de 13)" (Figma 511:593), for whoever is not 13
 * yet (RN-03, RF-F7.01).
 *
 * The screen neither receives nor shows anything she filled in: whoever sends
 * her here has already discarded the incomplete session, and nothing that came
 * from Google is kept.
 *
 * The 84px symbol is multi-colour, so it is an image; `Icon` would turn it
 * into a mask and lose the colours. The empty space at the end is Figma's
 * "Ações / A02c" node, which reserves 48px and holds nothing in either the M1
 * or the M2 version — it stays that way until the team decides what goes in.
 */
export default function MinimumAge() {
  return (
    <div className={styles.screen}>
      <Image
        className={styles.symbol}
        src="/icons/simbolo-nise-lg.svg"
        alt=""
        width={84}
        height={84}
        unoptimized
      />

      <h1 className={styles.title}>Ainda não dá pra criar sua conta</h1>
      <p className={styles.lead}>
        Por enquanto, a NISE não está disponível pra sua idade. Que bom que você
        se interessa por tecnologia, continua curiosa!
      </p>

      <div className={styles.list}>
        <span className={styles.check}>
          <Icon name="check" />
        </span>
        <p className={styles.item}>Não guardamos os dados que você preencheu.</p>
      </div>

      <div className={styles.actions} />
    </div>
  );
}
