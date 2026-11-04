"use client";

import { useRouter } from "next/navigation";
import { Suspense, use, useEffect, useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/Button";
import { FileIllustration } from "@/components/FileIllustration";
import { TextLink } from "@/components/TextLink";
import { buscarConvite, type Convite } from "@/lib/cadastro";
import styles from "./page.module.css";

type Params = PageProps<"/convite/[codigo]">["params"];

/**
 * A01b "Convite do grupo" (Figma 511:352): entrada de quem chegou pelo link
 * de um grupo (fluxo M1, issue #51).
 *
 * Código inválido ou vencido cai na A01, como manda a issue — e não numa tela
 * de erro, para ela não ficar presa.
 */
export default function ConvitePage({ params }: PageProps<"/convite/[codigo]">) {
  return (
    <div className={styles.page}>
      <AppHeader>
        <TextLink href="/entrar">Entrar</TextLink>
      </AppHeader>

      <Suspense
        fallback={
          <main className={styles.main}>
            <p className={styles.status}>Carregando convite...</p>
          </main>
        }
      >
        <Conteudo params={params} />
      </Suspense>
    </div>
  );
}

function Conteudo({ params }: { params: Params }) {
  const { codigo } = use(params);
  const router = useRouter();
  const [convite, setConvite] = useState<Convite | null>(null);

  useEffect(() => {
    const controle = new AbortController();

    buscarConvite(codigo, controle.signal)
      .then((dados) => {
        if (controle.signal.aborted) return;
        if (dados) setConvite(dados);
        else router.replace("/");
      })
      .catch(() => {
        if (!controle.signal.aborted) router.replace("/");
      });

    return () => controle.abort();
  }, [codigo, router]);

  if (!convite) {
    return (
      <main className={styles.main}>
        <p className={styles.status} aria-live="polite">
          Carregando convite...
        </p>
      </main>
    );
  }

  return (
    <main className={styles.main}>
      <p className={styles.chip}>Convite · {convite.grupoNome}</p>
      <h1 className={styles.title}>Que bom ter você aqui!</h1>
      <p className={styles.lead}>
        O grupo {convite.grupoNome} faz parte da NISE. Crie sua conta para
        acompanhar o grupo e descobrir novas oportunidades.
      </p>

      <FileIllustration />

      <p className={styles.assinatura}>
        Núcleo de Incentivo e Suporte
        <br />
        às Egressas e Estudantes
      </p>

      <div className={styles.spacer} />

      <Button
        className={styles.fullWidth}
        onClick={() =>
          router.push(`/criar-conta?convite=${encodeURIComponent(codigo)}`)
        }
      >
        Aceitar convite e criar conta
      </Button>
    </main>
  );
}
