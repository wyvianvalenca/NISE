"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { setOpportunityEmails, WITHOUT_SESSION } from "@/lib/signup-api";
import { Switch } from "./Switch";
import styles from "./ProfileCard.module.css";
import emailStyles from "./ProfileEmailsCard.module.css";

type ProfileEmailsCardProps = {
  /** Se ela recebe os e-mails de oportunidades (o que está salvo no servidor). */
  opportunityEmails: boolean;
};

// Texto dos lembretes numa constante só, para trocar numa linha (P3 do épico
// #130: o doc D-111 tira "e o que você marcar pra lembrar").
const REMINDERS_TEXT = "ENEM, IFAL, SISU e outras datas importantes";

// Mesmo texto da A04·2 (P1 da #393: nenhum lugar escreve o erro do interruptor).
const SAVE_ERROR = "Não deu pra salvar. Tente de novo.";

/**
 * "O que chega no seu e-mail" na A10 (RF-F7.06, RF-F7.07, RF-F7.08, RF-F7.12,
 * D-26). Só Oportunidades tem interruptor; lembretes e questionários sempre
 * chegam e ficam só em texto.
 */
export function ProfileEmailsCard({ opportunityEmails }: ProfileEmailsCardProps) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(opportunityEmails);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function choose(next: boolean) {
    const previous = enabled;
    // Muda na hora; se não salvar, volta ao valor anterior (RF-S2.15).
    setEnabled(next);
    setSaving(true);
    setError(null);

    const result = await setOpportunityEmails(next).catch(() => null);
    setSaving(false);

    if (result?.ok) return;

    setEnabled(previous);

    if (result?.reason === "unauthenticated" || result?.reason === "incomplete_signup") {
      router.replace(WITHOUT_SESSION[result.reason]);
      return;
    }

    if (result?.reason === "terms_not_accepted") {
      router.replace("/cadastro/termos");
      return;
    }

    setError(SAVE_ERROR);
  }

  return (
    <section className={styles.section} aria-labelledby="perfil-emails">
      <h2 id="perfil-emails" className={styles.heading}>
        O que chega no seu e-mail
      </h2>

      <div className={styles.card}>
        <div className={styles.row}>
          <div className={styles.texts}>
            <h3 id="perfil-emails-oportunidades" className={styles.name}>
              Oportunidades
            </h3>
            <p className={styles.text}>Oficinas, cursos e bolsas. No máximo 2 por mês.</p>
          </div>
          <Switch
            checked={enabled}
            onChange={choose}
            labelledBy="perfil-emails-oportunidades"
            busy={saving}
          />
        </div>

        {error && (
          <p className={emailStyles.error} role="alert">
            {error}
          </p>
        )}

        <hr className={styles.divider} />

        <div className={styles.texts}>
          <h3 className={styles.name}>Lembretes de datas importantes</h3>
          <p className={styles.text}>{REMINDERS_TEXT}. Sempre chegam no seu e-mail.</p>
        </div>

        <hr className={styles.divider} />

        <div className={styles.texts}>
          <h3 className={styles.name}>Questionários</h3>
          <p className={styles.text}>Sempre chegam no seu e-mail. Responder é opcional.</p>
        </div>

        <Link href="/agenda" className={`${styles.linkRow} ${styles.teal}`}>
          <span className={styles.linkText}>Ver minha agenda</span>
          <span className={styles.chevron} aria-hidden="true">
            ›
          </span>
        </Link>
      </div>
    </section>
  );
}
