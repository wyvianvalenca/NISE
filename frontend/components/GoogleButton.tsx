import Image from "next/image";
import { googleStartUrl } from "@/lib/signup-api";
import styles from "./GoogleButton.module.css";

type GoogleButtonProps = {
  /** The group's invite code, when she arrived through one (RN-29). */
  invite?: string;
  label?: string;
};

/**
 * The "Criar conta com o Google" action (Figma: Action / Criar conta com o
 * Google, on A02). It is a link and not a button because it leads outside:
 * the back-end redirects to Google.
 */
export function GoogleButton({
  invite,
  label = "Criar conta com o Google",
}: GoogleButtonProps) {
  return (
    <a className={styles.button} href={googleStartUrl({ invite })}>
      <Image src="/icons/google.svg" alt="" width={20} height={20} unoptimized />
      {label}
    </a>
  );
}
