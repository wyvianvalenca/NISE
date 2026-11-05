import Image from "next/image";
import { urlInicioGoogle } from "@/lib/cadastro";
import styles from "./GoogleButton.module.css";

type GoogleButtonProps = {
  /** Código do convite do grupo, quando ela chegou por um (RN-29). */
  convite?: string;
  label?: string;
};

/**
 * Ação "Criar conta com o Google" (Figma: Action / Criar conta com o Google,
 * na A02). É um link, e não um botão, porque leva para fora: o back-end
 * redireciona para o Google.
 */
export function GoogleButton({
  convite,
  label = "Criar conta com o Google",
}: GoogleButtonProps) {
  return (
    <a className={styles.button} href={urlInicioGoogle({ convite })}>
      <Image src="/icons/google.svg" alt="" width={20} height={20} unoptimized />
      {label}
    </a>
  );
}
