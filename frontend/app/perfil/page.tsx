"use client";

// A10 · Perfil, só com "Seu caminho" por enquanto. Mostra o curso que ela
// registrou, ou convida a registrar (RF-F6.04, RF-F6.05, #298). As outras
// seções do perfil vêm nas próprias histórias.

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { BottomNav } from "@/components/BottomNav";
import { Button } from "@/components/Button";
import { Loading } from "@/components/Loading";
import { LoadFailed } from "@/components/LoadFailed";
import { accessPath } from "@/lib/lista-oficial";
import {
  PROFILE_COURSE_PATH,
  type ProfileCourseOut,
  getProfileCourse,
} from "@/lib/perfil-curso";
import styles from "./page.module.css";

// O nível chega como código (CourseLevel); o nome na tela é o da pergunta 3.
const LEVEL_LABELS = { tecnico: "Curso técnico", graduacao: "Graduação" } as const;

export default function ProfilePage() {
  const router = useRouter();
  const [profile, setProfile] = useState<ProfileCourseOut | "error" | undefined>();
  // Muda a cada nova busca, para o efeito abaixo rodar de novo.
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    getProfileCourse(controller.signal)
      .then((result) => {
        if (result.ok) setProfile(result.profile);
        else if (result.reason === "failed") setProfile("error");
        // Login vencido ou termos novos: "Tentar novamente" não resolveria.
        else router.replace(accessPath(result.reason));
      })
      .catch(() => {
        if (!controller.signal.aborted) setProfile("error");
      });
    return () => controller.abort();
  }, [attempt, router]);

  if (profile === "error") {
    return (
      <LoadFailed
        onRetry={() => {
          setProfile(undefined);
          setAttempt((value) => value + 1);
        }}
      />
    );
  }

  return (
    <div className={styles.page}>
      <AppHeader />

      <div className={styles.scroll}>
        <main className={styles.main}>
          <h1 className={styles.title}>Seu perfil</h1>

          {profile === undefined ? (
            <Loading />
          ) : (
            <section className={styles.section} aria-labelledby="seu-caminho">
              <h2 id="seu-caminho" className={styles.sectionTitle}>
                Seu caminho
              </h2>
              {profile.course && profile.level ? (
                <>
                  <p className={styles.course}>
                    {LEVEL_LABELS[profile.level]} · {profile.course}
                  </p>
                  <Button
                    variant="secondary"
                    onClick={() => router.push(PROFILE_COURSE_PATH)}
                  >
                    Mudar curso
                  </Button>
                </>
              ) : (
                <>
                  <p className={styles.question}>Entrou num curso da área?</p>
                  <Button onClick={() => router.push(PROFILE_COURSE_PATH)}>
                    Registrar ingresso
                  </Button>
                </>
              )}
            </section>
          )}
        </main>
      </div>

      <BottomNav />
    </div>
  );
}
