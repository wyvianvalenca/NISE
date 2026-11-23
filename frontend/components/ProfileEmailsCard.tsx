import Link from "next/link";
import styles from "./ProfileCard.module.css";
import emailStyles from "./ProfileEmailsCard.module.css";

type ProfileEmailsCardProps = {
  /** Se ela recebe os e-mails de oportunidades. Aqui só aparece; o interruptor é da #393. */
  opportunityEmails: boolean;
};

// Texto dos lembretes numa constante só, para trocar numa linha (P3 do épico
// #130: o doc D-111 tira "e o que você marcar pra lembrar").
const REMINDERS_TEXT = "ENEM, IFAL, SISU e outras datas importantes";

/**
 * "O que chega no seu e-mail" na A10 (RF-F7.12, D-26). Só Oportunidades pode
 * ser desligado; lembretes e questionários sempre chegam.
 */
export function ProfileEmailsCard({ opportunityEmails }: ProfileEmailsCardProps) {
  return (
    <section className={styles.section} aria-labelledby="perfil-emails">
      <h2 id="perfil-emails" className={styles.heading}>
        O que chega no seu e-mail
      </h2>

      <div className={styles.card}>
        <div className={styles.row}>
          <div className={styles.texts}>
            <h3 className={styles.name}>Oportunidades</h3>
            <p className={styles.text}>Oficinas, cursos e bolsas. No máximo 2 por mês.</p>
          </div>
          {/* A #393 troca este texto pelo interruptor (Figma: Toggle / Ligado). */}
          <p className={emailStyles.state}>{opportunityEmails ? "Ligado" : "Desligado"}</p>
        </div>

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
