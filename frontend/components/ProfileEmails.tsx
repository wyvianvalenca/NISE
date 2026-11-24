"use client";

import { useState } from "react";
import { Chip } from "@/components/Chip";
import { type AccessProblem } from "@/lib/lista-oficial";
import { setOpportunityEmails } from "@/lib/signup-api";
import styles from "./ProfileEmails.module.css";

type ProfileEmailsProps = {
  /** Whether she receives opportunity e-mails right now. */
  initial: boolean;
  /** A 401 or a terms change while saving: the page sends her elsewhere. */
  onAccessProblem: (problem: AccessProblem) => void;
};

/**
 * "E-mails" in the profile (RF-F7.08, RF-F11.03). Only the opportunity e-mails
 * have a switch; questionnaires and date reminders are shown as information.
 * The choice is saved on click, and the screen only changes after the server
 * accepts it, so what she sees is what is stored.
 */
export function ProfileEmails({ initial, onAccessProblem }: ProfileEmailsProps) {
  const [enabled, setEnabled] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ kind: "saved" | "error"; text: string } | null>(null);

  async function choose(next: boolean) {
    if (saving || next === enabled) return;
    setSaving(true);
    setMessage(null);

    const result = await setOpportunityEmails(next).catch(() => null);
    setSaving(false);

    if (result?.ok) {
      setEnabled(next);
      setMessage({
        kind: "saved",
        text: next ? "Você vai receber oportunidades por e-mail." : "Você não vai receber oportunidades por e-mail.",
      });
      return;
    }

    if (result && result.reason !== "failed") {
      onAccessProblem(result.reason);
      return;
    }

    setMessage({ kind: "error", text: "Não deu pra salvar. Tente de novo." });
  }

  return (
    <section className={styles.section} aria-labelledby="emails">
      <h2 id="emails" className={styles.title}>
        E-mails
      </h2>

      <p className={styles.question}>Oportunidades por e-mail</p>
      <p className={styles.hint}>Avisos de oficinas, cursos e bolsas. No máximo 2 por mês.</p>
      <div className={styles.choices} role="group" aria-label="Oportunidades por e-mail">
        <Chip size="lg" selected={enabled} disabled={saving} onClick={() => choose(true)}>
          Quero receber
        </Chip>
        <Chip size="lg" selected={!enabled} disabled={saving} onClick={() => choose(false)}>
          Não quero receber
        </Chip>
      </div>
      {message && (
        <p
          className={message.kind === "error" ? styles.error : styles.saved}
          role={message.kind === "error" ? "alert" : "status"}
        >
          {message.text}
        </p>
      )}

      <p className={styles.question}>Questionários e lembretes de datas importantes</p>
      <p className={styles.hint}>
        Esses e-mails continuam chegando, porque fazem parte do seu acompanhamento.
      </p>
    </section>
  );
}
