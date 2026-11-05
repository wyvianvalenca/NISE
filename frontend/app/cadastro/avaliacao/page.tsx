"use client";

// A03 · E aí, curtiu a oficina? Só aparece no fluxo M1, depois dos termos.
// Atende RF-F4.03 e RF-F4.07 (issue #58).

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/Button";
import { EventCard } from "@/components/EventCard";
import { RatingScale } from "@/components/RatingScale";
import { TextArea } from "@/components/TextArea";
import { getPendingRating, SIGNUP_PATHS, submitRating, type PendingRating } from "@/lib/signup";
import shared from "../cadastro.module.css";
import styles from "./page.module.css";

export default function RatingPage() {
  const router = useRouter();
  const [pending, setPending] = useState<PendingRating | null>(null);
  const [score, setScore] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let current = true;
    getPendingRating().then((result) => {
      if (!current) return;
      // Nada para avaliar (M2, ou já avaliou): pula a tela.
      if (result) setPending(result);
      else router.replace(SIGNUP_PATHS.interests);
    });
    return () => {
      current = false;
    };
  }, [router]);

  async function handleSubmit() {
    if (!pending || score === null) return;
    setSaving(true);
    setError(null);
    try {
      await submitRating(pending.actionId, score, comment);
      router.push(SIGNUP_PATHS.interests);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não deu pra enviar. Tente de novo.");
      setSaving(false);
    }
  }

  if (!pending) {
    return (
      <p className={shared.status} aria-live="polite">
        Carregando…
      </p>
    );
  }

  return (
    <div className={`${shared.screen} ${styles.rating}`}>
      <EventCard group={pending.groupName} title={pending.actionTitle} details={pending.details} />

      <h1 className={styles.title}>E aí, curtiu a oficina?</h1>
      <p className={styles.lead}>Dá uma nota de 1 a 5. Leva só uns segundinhos.</p>

      <RatingScale label="Sua nota para a oficina, de 1 a 5" value={score} onChange={setScore} />

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
