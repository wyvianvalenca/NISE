import Link from "next/link";
import styles from "./ProfileCard.module.css";

/**
 * "Termos e privacidade" na A10 (RF-F7.12). Abre a tela provisória /termos
 * nas âncoras de cada parte; "de=perfil" faz a tela mostrar "Voltar" para cá.
 */
export function ProfileTermsCard() {
  return (
    <section className={styles.section} aria-labelledby="perfil-termos">
      <h2 id="perfil-termos" className={styles.heading}>
        Termos e privacidade
      </h2>
      <div className={styles.card}>
        <Link href="/termos?de=perfil#uso" className={styles.linkRow}>
          <span className={styles.linkText}>Termos de uso</span>
          <span className={styles.chevron} aria-hidden="true">
            ›
          </span>
        </Link>
        <hr className={styles.divider} />
        <Link href="/termos?de=perfil#privacidade" className={styles.linkRow}>
          <span className={styles.linkText}>Política de privacidade</span>
          <span className={styles.chevron} aria-hidden="true">
            ›
          </span>
        </Link>
      </div>
    </section>
  );
}
