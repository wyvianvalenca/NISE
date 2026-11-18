"use client";

// A14 · Sua agenda, só com a seção "Pra responder" (M7).
// Atende RF-F31.10 (issue #266). As datas importantes e os questionários são da M5 (#129):
// quando chegarem, entram nesta mesma tela, abaixo da seção.

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { BottomNav } from "@/components/BottomNav";
import { Icon } from "@/components/Icon";
import { InfoHint } from "@/components/InfoHint";
import { LoadFailed } from "@/components/LoadFailed";
import { getToAnswer, IS_IT_YOU_PATH, type ToAnswer } from "@/lib/agenda";
import styles from "./page.module.css";

export default function AgendaPage() {
  // undefined: carregando. "error": a busca falhou.
  const [toAnswer, setToAnswer] = useState<ToAnswer | undefined | "error">(undefined);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    getToAnswer(controller.signal)
      .then(setToAnswer)
      .catch(() => {
        if (!controller.signal.aborted) setToAnswer("error");
      });
    return () => controller.abort();
  }, [attempt]);

  if (toAnswer === "error") {
    return (
      <LoadFailed
        onRetry={() => {
          setToAnswer(undefined);
          setAttempt((value) => value + 1);
        }}
      />
    );
  }

  return (
    <div className={styles.page}>
      <AppHeader />

      <div className={styles.scroll}>
        <main className={styles.main}>
          <div className={styles.titleRow}>
            <h1 className={styles.title}>Sua agenda</h1>
            <InfoHint text="Suas datas importantes e quando a NISE vai perguntar como está seu caminho. Tudo opcional." />
          </div>

          {toAnswer === undefined && (
            <p className={styles.status} aria-live="polite">
              Carregando…
            </p>
          )}

          {/* Sem nada pra responder, a seção some (nota do Figma, A14). */}
          {toAnswer?.list_match && (
            <section className={styles.section} aria-labelledby="pra-responder">
              <h2 id="pra-responder" className={styles.sectionTitle}>
                Pra responder
              </h2>
              <ul className={styles.card}>
                {/* O indício vem sempre no topo de "Pra responder" (RF-F31.10). */}
                <li>
                  <Link href={IS_IT_YOU_PATH} className={styles.item}>
                    <span className={styles.bar} aria-hidden="true" />
                    <span className={styles.text}>
                      <span className={styles.itemTitle}>Achamos seu nome numa lista de aprovados!</span>
                      {/* Sem lista, curso nem instituição aqui (#266). */}
                      <span className={styles.meta}>Lista oficial · 1 min</span>
                    </span>
                    <span className={styles.answer}>
                      Responder
                      <Icon name="chevron-right" size={14} />
                    </span>
                  </Link>
                </li>
              </ul>
            </section>
          )}
        </main>
      </div>

      <BottomNav active="agenda" />
    </div>
  );
}
