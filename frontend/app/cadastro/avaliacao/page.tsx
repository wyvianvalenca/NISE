"use client";

// A03 · E aí, curtiu a oficina? Só aparece no fluxo M1, depois dos termos.
// Atende RF-F4.03a, RF-F4.03b e RF-F4.07 (issue #58), pelas rotas da #149.

import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useState } from "react";
import { Button } from "@/components/Button";
import { EventCard } from "@/components/EventCard";
import { Loading } from "@/components/Loading";
import { RatingScale } from "@/components/RatingScale";
import { TextArea } from "@/components/TextArea";
import { eventDetails, SIGNUP_PATHS } from "@/lib/signup";
import {
  getPendingRating,
  type PendingRating,
  submitRating,
  WITHOUT_SESSION,
} from "@/lib/signup-api";
import shared from "../cadastro.module.css";
import styles from "./page.module.css";

export default function RatingPage() {
  const router = useRouter();
  const [pending, setPending] = useState<PendingRating | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  // Muda a cada nova busca da ação, para o efeito abaixo rodar de novo.
  const [attempt, setAttempt] = useState(0);
  const [score, setScore] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    getPendingRating(controller.signal).then(
      (result) => {
        if (result.ok && result.pending) {
          setPending(result.pending);
        } else if (result.ok) {
          // Nada para avaliar (M2, ou já avaliou): pula a tela.
          router.replace(SIGNUP_PATHS.interests);
        } else if (result.reason === "terms_not_accepted") {
          // A avaliação vem depois do aceite dos termos (Etapa 1).
          router.replace(SIGNUP_PATHS.terms);
        } else if (result.reason === "failed") {
          setLoadFailed(true);
        } else {
          router.replace(WITHOUT_SESSION[result.reason]);
        }
      },
      () => {
        // Sem rede. Se ela só saiu da página, não há o que mostrar.
        if (!controller.signal.aborted) setLoadFailed(true);
      },
    );
    return () => controller.abort();
  }, [attempt, router]);

  // Ao navegar, o Next esconde a página em vez de desmontá-la (Activity, com cacheComponents)
  // e, se ela voltar, mostra o mesmo estado. Sem isto, os botões voltariam presos em
  // "Enviando…" depois de um envio que deu certo.
  useLayoutEffect(() => {
    return () => setSaving(false);
  }, []);

  function retryLoad() {
    setLoadFailed(false);
    setAttempt((current) => current + 1);
  }

  async function handleSubmit() {
    if (!pending || score === null) return;
    setSaving(true);
    setError(null);

    const result = await submitRating(pending.actionId, score, comment).catch(
      () => null,
    );

    // Já avaliada (em outra aba, por exemplo) ou sem nada para avaliar: não há o
    // que fazer aqui, e ela segue como se tivesse enviado.
    if (
      result?.ok ||
      result?.reason === "already_rated" ||
      result?.reason === "nothing_to_rate"
    ) {
      router.push(SIGNUP_PATHS.interests);
      return;
    }

    setSaving(false);

    if (
      result?.reason === "unauthenticated" ||
      result?.reason === "incomplete_signup"
    ) {
      router.replace(WITHOUT_SESSION[result.reason]);
      return;
    }

    if (result?.reason === "terms_not_accepted") {
      router.replace(SIGNUP_PATHS.terms);
      return;
    }

    setError("Não deu pra enviar. Tente de novo.");
  }

  // Nada da tela aparece antes da ação chegar: quem não tem o que avaliar, ou está sem
  // sessão, vai para outra página sem ver a A03 piscar.
  if (!pending) {
    return (
      <div className={shared.screen}>
        {loadFailed ? (
          <div role="alert">
            <p className={shared.error}>Não deu pra carregar a oficina.</p>
            <div className={styles.actions}>
              <Button
                variant="secondary"
                className={shared.fullWidth}
                onClick={retryLoad}
              >
                Tentar de novo
              </Button>
              {/* Avaliar é opcional: ela pode seguir, e a avaliação fica para o link do e-mail. */}
              <button
                type="button"
                className={styles.skip}
                onClick={() => router.push(SIGNUP_PATHS.interests)}
              >
                Agora não
              </button>
            </div>
          </div>
        ) : (
          <Loading />
        )}
      </div>
    );
  }

  return (
    <div className={`${shared.screen} ${styles.rating}`}>
      <EventCard
        group={pending.groupName}
        title={pending.actionName}
        details={eventDetails(pending.startsOn, pending.cityName)}
      />

      <h1 className={styles.title}>E aí, curtiu a oficina?</h1>
      <p className={styles.lead}>
        Dá uma nota de 1 a 5. Leva só uns segundinhos.
      </p>

      <RatingScale
        label="Sua nota para a oficina, de 1 a 5"
        value={score}
        onChange={setScore}
      />

      <TextArea
        label="Quer contar mais?"
        optional
        value={comment}
        onChange={(event) => setComment(event.target.value)}
        maxLength={500}
      />

      <div className={styles.actions}>
        <Button
          className={shared.fullWidth}
          disabled={score === null}
          loading={saving}
          onClick={handleSubmit}
        >
          Enviar avaliação
        </Button>
        {/* "Agora não" não salva nada; a avaliação continua pendente para o link do e-mail. */}
        <button
          type="button"
          className={styles.skip}
          disabled={saving}
          onClick={() => router.push(SIGNUP_PATHS.interests)}
        >
          Agora não
        </button>
      </div>
      {error && (
        <p className={shared.error} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
