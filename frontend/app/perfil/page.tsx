"use client";

// A10 · Perfil. "Seu caminho" mostra o curso que ela registrou, ou convida a
// registrar (RF-F6.04, RF-F6.05, #298). "Seus interesses" troca temas e etapa
// de estudo (RF-F10.10, #392) e "E-mails" liga ou desliga as oportunidades
// (RF-F7.08, #393). Apagar a conta e trocar a senha vêm nas próprias histórias.

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { BottomNav } from "@/components/BottomNav";
import { Button } from "@/components/Button";
import { Loading } from "@/components/Loading";
import { LoadFailed } from "@/components/LoadFailed";
import { ProfileEmails } from "@/components/ProfileEmails";
import { ProfileInterests } from "@/components/ProfileInterests";
import { accessPath } from "@/lib/lista-oficial";
import { getProfile, type ProfileOut } from "@/lib/perfil-interesses";
import {
  PROFILE_COURSE_PATH,
  type ProfileCourseOut,
  getProfileCourse,
} from "@/lib/perfil-curso";
import { getInterestOptions, type InterestOptions } from "@/lib/signup-api";
import styles from "./page.module.css";

// O nível chega como código (CourseLevel); o nome na tela é o da pergunta 3.
const LEVEL_LABELS = { tecnico: "Curso técnico", graduacao: "Graduação" } as const;

export default function ProfilePage() {
  const router = useRouter();
  const [profile, setProfile] = useState<ProfileCourseOut | "error" | undefined>();
  const [choices, setChoices] = useState<ProfileOut | undefined>();
  const [options, setOptions] = useState<InterestOptions | undefined>();
  // Muda a cada nova busca, para o efeito abaixo rodar de novo.
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      getProfileCourse(controller.signal),
      getProfile(controller.signal),
      getInterestOptions(controller.signal),
    ])
      .then(([course, mine, lists]) => {
        // Login vencido ou termos novos: "Tentar novamente" não resolveria.
        for (const result of [course, mine, lists]) {
          if (!result.ok && result.reason !== "failed") {
            router.replace(accessPath(result.reason));
            return;
          }
        }
        if (course.ok && mine.ok && lists.ok) {
          setProfile(course.profile);
          setChoices(mine.profile);
          setOptions(lists.options);
        } else {
          setProfile("error");
        }
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
          setChoices(undefined);
          setOptions(undefined);
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

          {profile === undefined || choices === undefined || options === undefined ? (
            <Loading />
          ) : (
            <>
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

            <ProfileInterests
              options={options}
              initial={{ topics: choices.topics, everything: choices.everything, stage: choices.stage }}
              onAccessProblem={(problem) => router.replace(accessPath(problem))}
            />

            <ProfileEmails
              initial={choices.opportunityEmails}
              onAccessProblem={(problem) => router.replace(accessPath(problem))}
            />
            </>
          )}
        </main>
      </div>

      <BottomNav />
    </div>
  );
}
