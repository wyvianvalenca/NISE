"use client";

import { useRouter } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/Button";
import { FileIllustration } from "@/components/FileIllustration";
import { TextLink } from "@/components/TextLink";
import styles from "./page.module.css";

/**
 * A01 "Boas-vindas" (Figma 511:15325): a porta de entrada de quem chega
 * sozinha, sem convite de grupo (fluxo M2, issue #51).
 */
export default function Home() {
  const router = useRouter();

  return (
    <div className={styles.page}>
      <AppHeader>
        <TextLink href="/entrar">Entrar</TextLink>
      </AppHeader>

      <main className={styles.main}>
        <h1 className={styles.title}>
          Núcleo de Incentivo e Suporte às Egressas e Estudantes
        </h1>
        <p className={styles.lead}>
          Uma plataforma para conectar experiências, próximos passos e grupos
          de apoio.
        </p>

        <FileIllustration />

        <div className={styles.spacer} />

        <Button
          className={styles.fullWidth}
          onClick={() => router.push("/criar-conta")}
        >
          Criar conta
        </Button>
      </main>
    </div>
  );
}
