"use client";

import { useRouter } from "next/navigation";
import { Suspense, use, useEffect, useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { LinkButton } from "@/components/Button";
import { FileIllustration } from "@/components/FileIllustration";
import { TextLink } from "@/components/TextLink";
import { getInvite, type Invite } from "@/lib/signup-api";
import styles from "./page.module.css";

type Params = PageProps<"/convite/[codigo]">["params"];

/**
 * A01b "Convite do grupo" (Figma 511:352): the door for whoever arrived
 * through a group's link (flow M1, issue #51).
 *
 * An invalid or expired code falls back to A01, as the issue asks — and not
 * to an error screen, so she is never stuck.
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
        <Content params={params} />
      </Suspense>
    </div>
  );
}

function Content({ params }: { params: Params }) {
  const { codigo } = use(params);
  const router = useRouter();
  const [invite, setInvite] = useState<Invite | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    getInvite(codigo, controller.signal)
      .then((data) => {
        if (controller.signal.aborted) return;
        if (data) setInvite(data);
        else router.replace("/");
      })
      .catch(() => {
        if (!controller.signal.aborted) router.replace("/");
      });

    return () => controller.abort();
  }, [codigo, router]);

  if (!invite) {
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
      <p className={styles.chip}>Convite · {invite.groupName}</p>
      <h1 className={styles.title}>Que bom ter você aqui!</h1>
      <p className={styles.lead}>
        O grupo {invite.groupName} faz parte da NISE. Crie sua conta para
        acompanhar o grupo e descobrir novas oportunidades.
      </p>

      <FileIllustration />

      <p className={styles.signature}>
        Núcleo de Incentivo e Suporte
        <br />
        às Egressas e Estudantes
      </p>

      <div className={styles.spacer} />

      <LinkButton
        href={`/criar-conta?convite=${encodeURIComponent(codigo)}`}
        className={styles.fullWidth}
      >
        Aceitar convite e criar conta
      </LinkButton>
    </main>
  );
}
