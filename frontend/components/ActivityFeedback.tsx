"use client";

// Parte opcional da A06·5: nota e sugestões parecidas (issue #124, RF-F10).
// Fica abaixo da celebração da atividade concluída (#120).

import { useId, useState } from "react";
import { Button } from "./Button";
import { Chip } from "./Chip";
import { RatingScale } from "./RatingScale";
import { sendActivityFeedback, SIMILAR_OPTIONS, type SimilarChoice } from "@/lib/atividade-feedback";
import styles from "./ActivityFeedback.module.css";

type ActivityFeedbackProps = {
  activityId: string;
  /** Chamado depois de "Pular" ou de um envio que deu certo. Ela volta para o filé. */
  onDone: () => void;
};

/**
 * "O que achou?" e "Quer sugestões parecidas?", as duas opcionais.
 * "Pular" e "Enviar" têm o mesmo tamanho: avaliar nunca é cobrança.
 */
export function ActivityFeedback({ activityId, onDone }: ActivityFeedbackProps) {
  const ratingTitle = useId();
  const [score, setScore] = useState<number | null>(null);
  const [similar, setSimilar] = useState<SimilarChoice | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nothingChosen = score === null && similar === null;

  async function handleSend() {
    setSending(true);
    setError(null);
    try {
      await sendActivityFeedback(activityId, { score, similar });
      onDone();
    } catch (caught) {
      // A mensagem é sempre a mesma; o detalhe (às vezes técnico) fica só no console.
      console.warn("Não foi possível enviar a avaliação.", caught);
      setError("Não deu pra enviar. Tente de novo.");
      setSending(false);
    }
  }

  return (
    <section className={styles.feedback} aria-labelledby={ratingTitle}>
      <div className={styles.part}>
        <h2 id={ratingTitle} className={styles.title}>
          O que achou? <span className={styles.optional}>(opcional)</span>
        </h2>
        <RatingScale label="O que achou da atividade, de 1 a 5" value={score} onChange={setScore} />
      </div>

      <fieldset className={styles.part}>
        <legend className={styles.title}>
          Quer sugestões parecidas? <span className={styles.optional}>(opcional)</span>
        </legend>
        <div className={styles.chips}>
          {SIMILAR_OPTIONS.map((option) => (
            <Chip
              key={option.code}
              size="lg"
              selected={similar === option.code}
              // Só uma opção por vez; tocar de novo na escolhida desmarca.
              onClick={() => setSimilar(similar === option.code ? null : option.code)}
            >
              {option.label}
            </Chip>
          ))}
        </div>
      </fieldset>

      {/* O erro fica logo acima dos botões, perto de onde ela tocou. */}
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      <div className={styles.actions}>
        <Button variant="secondary" className={styles.action} disabled={sending} onClick={onDone}>
          Pular
        </Button>
        <Button className={styles.action} disabled={nothingChosen} loading={sending} onClick={handleSend}>
          Enviar
        </Button>
      </div>
    </section>
  );
}
