"use client";

// A06·5 · Concluído, a parte da celebração ("Mais um passo dado").
// Atende RF-F10.08 (issues #119 e #120), pela rota GET /api/file/{id} (integração na #122).
// A parte de avaliação, logo abaixo, é da #124.
//
// Fora daqui de propósito: a linha "Outras meninas da NISE também fizeram esse curso."
// do Figma, porque a RN-28 diz que o filé não compara meninas (a decidir com o design).

import Image from "next/image";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Suspense, useEffect, useRef } from "react";
import { ActivityFeedback } from "@/components/ActivityFeedback";
import { Button } from "@/components/Button";
import styles from "../atividade.module.css";
import { useActivity } from "../useActivity";
import celebration from "./concluida.module.css";

const FILE_PATH = "/file";

export default function CelebrationPage() {
  return (
    <div className={styles.page}>
      <header className={`${styles.header} ${styles.headerEnd}`}>
        <Link href={FILE_PATH} className={styles.close}>
          Fechar
        </Link>
      </header>

      <div className={styles.scroll}>
        <main className={`${styles.main} ${celebration.main}`}>
          <Suspense fallback={<Loading />}>
            <Celebration />
          </Suspense>
        </main>
      </div>
    </div>
  );
}

function Loading() {
  return (
    <p className={styles.status} aria-live="polite">
      Carregando…
    </p>
  );
}

function Celebration() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { result, redirecting, retry } = useActivity(id);
  const activity = result?.ok ? result.data : null;
  const headingRef = useRef<HTMLHeadingElement>(null);

  // Leva o foco ao título quando a tela abre, para o leitor de tela anunciar a conquista.
  useEffect(() => {
    if (activity) headingRef.current?.focus();
  }, [activity]);

  // Sem sessão ou sem o aceite dos termos, o hook já leva para a tela certa.
  if (!result || redirecting) return <Loading />;
  if (!result.ok && result.reason === "not_found") {
    return <p className={styles.status}>Essa atividade não está no seu filé.</p>;
  }
  if (!activity) {
    return (
      <div role="alert">
        <p className={styles.status}>Não foi possível carregar. Sua conexão pode ter sido interrompida.</p>
        <Button onClick={retry}>Tentar novamente</Button>
      </div>
    );
  }
  return (
    <>
      <Image
        src="/ilustracoes/file-item-novo.svg"
        alt=""
        width={180}
        height={180}
        unoptimized
        className={celebration.art}
      />
      <p className={celebration.kicker}>Mais um passo dado</p>
      <h1 ref={headingRef} tabIndex={-1} className={celebration.title}>
        Você conseguiu, {activity.firstName}!
      </h1>
      <p className={celebration.activity}>{activity.title}</p>

      <div className={celebration.feedback}>
        {/* replace: voltar depois de "Pular" ou "Enviar" não reabre o formulário vazio. */}
        <ActivityFeedback activityId={activity.id} onDone={() => router.replace(FILE_PATH)} />
      </div>
    </>
  );
}
