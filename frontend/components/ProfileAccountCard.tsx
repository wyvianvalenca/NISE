import Image from "next/image";
import Link from "next/link";
import { Avatar } from "./Avatar";
import styles from "./ProfileCard.module.css";

type ProfileAccountCardProps = {
  name: string;
  email: string;
  /** "Maceió, AL"; vazio se o registro não tem cidade. */
  city: string | null;
  hasPassword: boolean;
  google: boolean;
  /** Para onde "Mudar senha" leva. */
  onChangePasswordHref: string;
};

/**
 * Conta, e-mail e senha na A10 (RF-S2.09, RF-S2.10).
 *
 * O logo do Google aparece se ela tem conta Google ligada, e "Mudar senha" se
 * ela tem senha. São independentes: quem tem os dois vê os dois (o doc não
 * previu esse caso; vale o que o Wyvian decidiu no épico #130).
 *
 * No Figma, a conta só com Google é uma linha só (avatar, nome, e-mail e o
 * logo); a de e-mail e senha também mostra a cidade e a linha "Senha".
 */
export function ProfileAccountCard({
  name,
  email,
  city,
  hasPassword,
  google,
  onChangePasswordHref,
}: ProfileAccountCardProps) {
  return (
    <section className={styles.section} aria-labelledby="perfil-conta">
      <h2 id="perfil-conta" className={styles.srOnly}>
        Sua conta
      </h2>
      <div className={styles.card}>
        <div className={styles.row}>
          <Avatar name={name} size={48} />
          <div className={styles.texts}>
            <p className={styles.name}>{name}</p>
            <p className={styles.text}>{email}</p>
            {hasPassword && city && <p className={styles.text}>{city}</p>}
          </div>
          {google && (
            <Image src="/icons/google.svg" alt="Conta Google" width={20} height={20} unoptimized />
          )}
        </div>

        {hasPassword && (
          <>
            <hr className={styles.divider} />
            <div className={styles.row}>
              <div className={styles.texts}>
                <p className={styles.label}>Senha</p>
                <p className={styles.text}>Você entra com e-mail e senha.</p>
              </div>
              <Link href={onChangePasswordHref} className={styles.action}>
                Mudar senha
              </Link>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
