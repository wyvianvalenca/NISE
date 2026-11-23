"use client";

import { useRouter } from "next/navigation";
import { PROFILE_COURSE_PATH, type ProfileCourseOut } from "@/lib/perfil-curso";
import styles from "./ProfileCard.module.css";

// O nível chega como código (CourseLevel); o nome na tela é o da pergunta 3.
const LEVEL_LABELS = { tecnico: "Curso técnico", graduacao: "Graduação" } as const;

type ProfilePathCardProps = {
  /** O curso atual dela (GET /api/profile/course). */
  profile: ProfileCourseOut;
};

/**
 * "Seu caminho" na A10: mostra o curso que ela registrou, ou convida a
 * registrar (RF-F6.04, RF-F6.05, #298).
 */
export function ProfilePathCard({ profile }: ProfilePathCardProps) {
  const router = useRouter();

  return (
    <section className={styles.section} aria-labelledby="seu-caminho">
      <h2 id="seu-caminho" className={styles.heading}>
        Seu caminho
      </h2>
      <div className={styles.card}>
        {profile.course && profile.level ? (
          <>
            <p className={styles.name}>
              {LEVEL_LABELS[profile.level]} · {profile.course}
            </p>
            <button type="button" className={styles.action} onClick={() => router.push(PROFILE_COURSE_PATH)}>
              Mudar curso
            </button>
          </>
        ) : (
          <>
            <div className={styles.texts}>
              <p className={styles.name}>Entrou num curso da área?</p>
              <p className={styles.text}>
                Curso técnico ou graduação em tecnologia. Conta pra gente quando quiser, sem esperar o
                questionário.
              </p>
            </div>
            <button type="button" className={styles.action} onClick={() => router.push(PROFILE_COURSE_PATH)}>
              Registrar ingresso
            </button>
          </>
        )}
      </div>
    </section>
  );
}
