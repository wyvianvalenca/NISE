"use client";

// A06·0 · Por que filé?: the metaphor explained, before she starts.
// Covers RF-F10.02 (issues #82 and #83). Whether she has seen it comes from
// her profile on the back-end (#84, #85).

import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState, type ReactNode } from "react";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/Button";
import {
  FILE_PATHS,
  FILE_STEPS,
  introAlreadySeen,
  markIntroSeen,
  type ProfileProblem,
  REVIEW_PARAM,
} from "@/lib/file-intro";
import { SIGNUP_PATHS } from "@/lib/signup";
import { WITHOUT_SESSION } from "@/lib/signup-api";
import styles from "./page.module.css";

/**
 * Where she goes when a profile route says no. Without a session she goes to
 * log in, and without the terms accepted she goes to accept them: the filé
 * comes after both. `null` for a plain failure, which the screen handles.
 */
function pathWhenRefused(reason: ProfileProblem): string | null {
  if (reason === "terms_not_accepted") {
    return SIGNUP_PATHS.terms;
  }
  if (reason === "unauthenticated" || reason === "incomplete_signup") {
    return WITHOUT_SESSION[reason];
  }
  return null;
}

/**
 * Without `?rever=1` the screen only shows the first time: whoever has seen
 * it goes straight to Descobrir. With `?rever=1` it always opens, which is how
 * the "?" next to "Seu filé" (#114) brings the explanation back.
 */
function FileIntro() {
  const router = useRouter();
  const review = useSearchParams().get(REVIEW_PARAM) === "1";
  /** `null` while the answer has not arrived. */
  const [seen, setSeen] = useState<boolean | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (review) return;

    const controller = new AbortController();
    introAlreadySeen(controller.signal).then(
      (result) => {
        if (result.ok) {
          setSeen(result.seen);
          return;
        }

        const elsewhere = pathWhenRefused(result.reason);
        if (elsewhere) {
          router.replace(elsewhere);
        } else {
          // The profile did not load: the explanation shows, which is the
          // safe way to be wrong. "Começar meu filé" tries to mark it again.
          setSeen(false);
        }
      },
      () => {
        // No network. If she just left the page, there is nothing to show.
        if (!controller.signal.aborted) setSeen(false);
      },
    );

    return () => controller.abort();
  }, [review, router]);

  useEffect(() => {
    if (!review && seen === true) {
      router.replace(FILE_PATHS.discover);
    }
  }, [review, seen, router]);

  /**
   * `replace` and not `push`: the explanation is a doorway, not a step in the
   * history. With `push`, the browser's Back would bring it up again, it would
   * redirect to Descobrir right away, and she would have to press Back twice
   * to leave.
   */
  async function start() {
    setLeaving(true);
    setError(undefined);

    const result = await markIntroSeen().catch(() => null);

    if (result?.ok) {
      router.replace(FILE_PATHS.discover);
      return;
    }

    const elsewhere = result ? pathWhenRefused(result.reason) : null;
    if (elsewhere) {
      router.replace(elsewhere);
      return;
    }

    setLeaving(false);
    setError("Não deu pra continuar agora. Tente de novo.");
  }

  const showing = review || seen === false;

  if (!showing) {
    return (
      <Frame>
        <p className={styles.status} aria-live="polite">
          Carregando...
        </p>
      </Frame>
    );
  }

  return (
    <div className={styles.page}>
      <AppHeader />

      <main className={styles.main}>
        <p className={styles.before}>Antes de começar</p>
        <h1 className={styles.title}>Por que filé?</h1>
        <p className={styles.lead}>
          Nas lagoas Mundaú e Manguaba, mulheres tecem o filé há gerações, e{" "}
          <strong className={styles.highlight}>uma ensina a outra</strong>. A
          NISE se inspira nelas.
        </p>

        <ol className={styles.steps}>
          {FILE_STEPS.map((step, index) => (
            <li key={step.image} className={styles.step}>
              <Image
                src={`/file/${step.image}.svg`}
                alt=""
                width={100}
                height={100}
                unoptimized
              />
              <span className={styles.text}>
                <span className={styles.stepTitle}>{step.title}</span>
                <span className={styles.stepDetail}>{step.text}</span>
              </span>
              {index < FILE_STEPS.length - 1 && (
                <span className={styles.thread} aria-hidden="true" />
              )}
            </li>
          ))}
        </ol>
      </main>

      <footer className={styles.footer}>
        <p className={styles.motto}>
          Sem ordem certa e sem pressa,
          <br />
          do seu jeito.
        </p>
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
        <Button className={styles.fullWidth} loading={leaving} onClick={start}>
          Começar meu filé
        </Button>
      </footer>
    </div>
  );
}

/** The header and the shell, which need neither JavaScript nor the query. */
function Frame({ children }: { children: ReactNode }) {
  return (
    <div className={styles.page}>
      <AppHeader />
      <main className={styles.main}>{children}</main>
    </div>
  );
}

/**
 * A06·0's wrapper. The `useSearchParams` inside only runs under a Suspense
 * boundary; without one, the whole page stops being statically generated.
 *
 * The fallback draws the shell rather than a blank page: while the JavaScript
 * has not arrived, she already sees the brand and knows she is in the right
 * place.
 */
export default function FileIntroPage() {
  return (
    <Suspense
      fallback={
        <Frame>
          <p className={styles.status} aria-live="polite">
            Carregando...
          </p>
        </Frame>
      }
    >
      <FileIntro />
    </Suspense>
  );
}
