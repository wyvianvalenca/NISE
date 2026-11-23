import Image from "next/image";
import { Avatar } from "./Avatar";
import styles from "./AccountCard.module.css";

type AccountCardProps = {
  name: string;
  email: string;
  /** Mostra o logo do Google quando a conta veio de lá. */
  provider?: "google";
};

/** Conta com que a menina está entrando (Figma: Card / Conta Google, tela A02b). */
export function AccountCard({ name, email, provider }: AccountCardProps) {
  return (
    <div className={styles.card}>
      <Avatar name={name} />
      <div className={styles.texts}>
        <p className={styles.name}>{name}</p>
        <p className={styles.email}>{email}</p>
      </div>
      {provider === "google" && (
        <Image src="/icons/google.svg" alt="Conta Google" width={20} height={20} unoptimized />
      )}
    </div>
  );
}
