"use client";

// A06·5 · Concluído, a parte da celebração ("Mais um passo dado").
// Atende RF-F10.08 (issues #119 e #120). A parte de avaliação, logo abaixo, é da #124.
//
// Fora daqui de propósito: a linha "Outras meninas da NISE também fizeram esse curso."
// do Figma, porque a RN-28 diz que o filé não compara meninas (a decidir com o design).

import Image from "next/image";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { ActivityFeedback } from "@/components/ActivityFeedback";
import { getActivity, getFirstName, type ActivityDetail } from "@/lib/atividade";
import styles from "../atividade.module.css";
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
  const [activity, setActivity] = useState<ActivityDetail | null | undefined>(undefined);
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    let current = true;
    getActivity(id).then((result) => {
      if (current) setActivity(result);
    });
    return () => {
      current = false;
    };
  }, [id]);

  // Leva o foco ao título quando a tela abre, para o leitor de tela anunciar a conquista.
  useEffect(() => {
    if (activity) headingRef.current?.focus();
  }, [activity]);

  if (activity === undefined) return <Loading />;
  if (activity === null) return <p className={styles.status}>Essa atividade não está no seu filé.</p>;
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
        Você conseguiu, {getFirstName()}!
      </h1>
      <p className={celebration.activity}>{activity.title}</p>

      <div className={celebration.feedback}>
        <ActivityFeedback activityId={activity.id} onDone={() => router.push(FILE_PATH)} />
      </div>
    </>
  );
}
