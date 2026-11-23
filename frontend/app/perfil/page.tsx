"use client";

// A10 · Perfil (RF-F7.11, RF-F7.12, RF-S2.09, RF-S2.10, #391): conta, o que
// interessa a ela, grupo, caminho, e-mails, termos e sair. Cada seção é um
// cartão em components/Profile*Card.tsx. Só ela vê o próprio perfil: não há id
// na URL, e o servidor decide quem pode abrir (RNF-G.03).

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { BottomNav } from "@/components/BottomNav";
import { Icon } from "@/components/Icon";
import { Loading } from "@/components/Loading";
import { LoadFailed } from "@/components/LoadFailed";
import { ProfileAccountCard } from "@/components/ProfileAccountCard";
import { ProfileEmailsCard } from "@/components/ProfileEmailsCard";
import { ProfileGroupCard } from "@/components/ProfileGroupCard";
import { ProfileInterestsCard } from "@/components/ProfileInterestsCard";
import { ProfileLeaveCard } from "@/components/ProfileLeaveCard";
import { ProfilePathCard } from "@/components/ProfilePathCard";
import { ProfileTermsCard } from "@/components/ProfileTermsCard";
import { accessPath } from "@/lib/lista-oficial";
import { type ProfileCourseOut, getProfileCourse } from "@/lib/perfil-curso";
import { PROFILE_PATHS, type ProfileDetails, getProfileDetails } from "@/lib/profile-api";
import styles from "./page.module.css";

type Loaded = { details: ProfileDetails; course: ProfileCourseOut };

export default function ProfilePage() {
  const router = useRouter();
  const [loaded, setLoaded] = useState<Loaded | "error" | undefined>();
  // Muda a cada nova busca, para o efeito abaixo rodar de novo.
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([getProfileDetails(controller.signal), getProfileCourse(controller.signal)])
      .then(([details, course]) => {
        if (details.ok && course.ok) {
          setLoaded({ details: details.profile, course: course.profile });
          return;
        }
        const failure = details.ok ? course : details;
        if (failure.ok) return;
        if (failure.reason === "failed") setLoaded("error");
        // Login vencido ou termos novos: "Tentar novamente" não resolveria.
        else router.replace(accessPath(failure.reason));
      })
      .catch(() => {
        // Sem rede. Se ela só saiu da página, não há o que mostrar.
        if (!controller.signal.aborted) setLoaded("error");
      });
    return () => controller.abort();
  }, [attempt, router]);

  if (loaded === "error") {
    return (
      <LoadFailed
        onRetry={() => {
          setLoaded(undefined);
          setAttempt((value) => value + 1);
        }}
      />
    );
  }

  return (
    <div className={styles.page}>
      <AppHeader>
        <button type="button" className={styles.back} onClick={() => router.back()}>
          <Icon name="left" />
          Voltar
        </button>
      </AppHeader>

      <div className={styles.scroll}>
        <main className={styles.main}>
          <h1 className={styles.title}>Perfil</h1>
          <p className={styles.lead}>Sua conta, seu grupo e o que a NISE manda pra você.</p>

          {loaded === undefined ? (
            <Loading />
          ) : (
            <>
              <ProfileAccountCard
                name={loaded.details.name}
                email={loaded.details.email}
                city={loaded.details.city}
                hasPassword={loaded.details.hasPassword}
                google={loaded.details.google}
                onChangePasswordHref={PROFILE_PATHS.password}
              />
              <ProfileInterestsCard
                topics={loaded.details.topics.map((topic) => topic.label)}
                allTopics={loaded.details.allTopics}
                studyStage={loaded.details.studyStage?.label ?? null}
                editHref={PROFILE_PATHS.interests}
              />
              <ProfileGroupCard origin={loaded.details.origin} />
              <ProfilePathCard profile={loaded.course} />
              <ProfileEmailsCard opportunityEmails={loaded.details.opportunityEmails} />
              <ProfileTermsCard />
              <ProfileLeaveCard />
            </>
          )}
        </main>
      </div>

      <BottomNav />
    </div>
  );
}
