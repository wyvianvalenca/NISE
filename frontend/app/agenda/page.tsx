"use client";

// A14 · Sua agenda (M7 e M5). Atende RF-F31.10, RF-F4.03b, RF-F4.06 e RF-F4.11b (#266, #295).
// "Pra responder" vem primeiro: o indício, as avaliações adiadas e o questionário aberto.
// Abaixo, as datas por mês, que não abrem.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { BottomNav } from "@/components/BottomNav";
import { Icon } from "@/components/Icon";
import { InfoHint } from "@/components/InfoHint";
import { Loading } from "@/components/Loading";
import { LoadFailed } from "@/components/LoadFailed";
import { MonthAgenda } from "@/components/MonthAgenda";
import {
  type AgendaDates,
  FOLLOWUP_PATH,
  followupTitle,
  getAgendaDates,
  getToAnswer,
  groupByMonth,
  IS_IT_YOU_PATH,
  pendingCount,
  RATING_PATH,
  type ToAnswer,
} from "@/lib/agenda";
import { formatDate } from "@/lib/evento";
import { accessPath } from "@/lib/lista-oficial";
import styles from "./page.module.css";

const TIP = "Suas datas importantes e quando a NISE vai perguntar como está seu caminho. Tudo opcional.";

type Loaded = { toAnswer: ToAnswer; dates: AgendaDates };

/** Um item de "Pra responder": a barra rosa, o texto e "Responder ›". */
function AnswerItem({ href, title, meta }: { href: string; title: string; meta: string }) {
  return (
    <li>
      <Link href={href} className={styles.item}>
        <span className={styles.bar} aria-hidden="true" />
        <span className={styles.text}>
          <span className={styles.itemTitle}>{title}</span>
          <span className={styles.meta}>{meta}</span>
        </span>
        <span className={styles.answer}>
          Responder
          <Icon name="chevron-right" size={14} />
        </span>
      </Link>
    </li>
  );
}

export default function AgendaPage() {
  const router = useRouter();
  // undefined: carregando. "error": a busca falhou.
  const [loaded, setLoaded] = useState<Loaded | undefined | "error">(undefined);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([getToAnswer(controller.signal), getAgendaDates(controller.signal)])
      .then(([toAnswer, dates]) => {
        if (toAnswer.ok && dates.ok) {
          setLoaded({ toAnswer: toAnswer.toAnswer, dates: dates.data });
          return;
        }
        const failure = toAnswer.ok ? dates : toAnswer;
        if (failure.ok) return;
        if (failure.reason === "failed") setLoaded("error");
        // Login vencido ou termos novos: "Tentar novamente" não resolveria.
        else router.replace(accessPath(failure.reason));
      })
      .catch(() => {
        if (!controller.signal.aborted) setLoaded("error");
      });
    return () => controller.abort();
  }, [attempt, router]);

  if (loaded === "error") {
    return (
      <LoadFailed
        onRetry={() => {
          setLoaded(undefined);
          setAttempt((value) => value + 1);
        }}
      />
    );
  }

  const toAnswer = loaded?.toAnswer;
  const months = loaded ? groupByMonth(loaded.dates.upcoming) : [];
  const nothingToAnswer = toAnswer !== undefined && pendingCount(toAnswer) === 0;

  return (
    <div className={styles.page}>
      <AppHeader />

      <div className={styles.scroll}>
        <main className={styles.main}>
          <div className={styles.titleRow}>
            <h1 className={styles.title}>Sua agenda</h1>
            <InfoHint text={TIP} />
          </div>

          {loaded === undefined && <Loading />}

          {/* Sem nada pra responder, a seção some (nota do Figma, A14). */}
          {toAnswer && !nothingToAnswer && (
            <section className={styles.section} aria-labelledby="pra-responder">
              <h2 id="pra-responder" className={styles.sectionTitle}>
                Pra responder
              </h2>
              <ul className={styles.card}>
                {/* O indício vem sempre no topo de "Pra responder" (RF-F31.10). */}
                {toAnswer.list_match && (
                  <AnswerItem
                    href={IS_IT_YOU_PATH}
                    title="Achamos seu nome numa lista de aprovados!"
                    // Sem lista, curso nem instituição aqui (#266).
                    meta="Lista oficial · 1 min"
                  />
                )}
                {/* A avaliação adiada com "Agora não" volta para cá (RF-F4.03b). */}
                {toAnswer.ratings.map((rating) => (
                  <AnswerItem
                    key={rating.actionId}
                    href={RATING_PATH}
                    title={`E aí, curtiu a ${rating.actionName}?`}
                    meta={`Avaliação · ${formatDate(rating.startsOn)}`}
                  />
                ))}
                {toAnswer.followup && (
                  <AnswerItem
                    href={FOLLOWUP_PATH}
                    title={followupTitle(toAnswer.followup.round)}
                    meta={`Até ${formatDate(toAnswer.followup.lastDay)}`}
                  />
                )}
              </ul>
            </section>
          )}

          {nothingToAnswer && months.length === 0 && (
            <p className={styles.empty}>
              <strong>Nada pra responder agora</strong>
              <span>{TIP}</span>
            </p>
          )}

          {months.length > 0 && (
            <>
              {months.map((group) => (
                <MonthAgenda key={group.month} month={group.month} items={group.items} />
              ))}
              <ul className={styles.legend} aria-label="Legenda da agenda">
                <li className={styles.legendItem}>
                  <span className={`${styles.swatch} ${styles.teal}`} aria-hidden="true" />
                  Lembrete de data
                </li>
                <li className={styles.legendItem}>
                  <span className={`${styles.swatch} ${styles.pink}`} aria-hidden="true" />
                  Questionário da NISE
                </li>
              </ul>
            </>
          )}
        </main>
      </div>

      <BottomNav active="agenda" />
    </div>
  );
}
