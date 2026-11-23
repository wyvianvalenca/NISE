"use client";

// A10b · Conta pra gente do seu curso. A mesma pergunta 3 da A18, aberta pelo
// perfil quando ela quiser (RF-F6.04, RF-F6.05, RF-F6.02, #298). "Salvar"
// grava o curso no perfil e não responde questionário nenhum.

import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/Button";
import { CourseQuestion } from "@/components/CourseQuestion";
import { Loading } from "@/components/Loading";
import { LoadFailed } from "@/components/LoadFailed";
import {
  type CourseAnswer,
  EMPTY_COURSE_ANSWER,
  type FollowupOptionsOut,
  courseAnswerReady,
} from "@/lib/caminho";
import { accessPath } from "@/lib/lista-oficial";
import {
  PROFILE_PATH,
  getCourseOptions,
  getProfileCourse,
  saveProfileCourse,
} from "@/lib/perfil-curso";
import styles from "./page.module.css";

type Loaded = { firstName: string; options: FollowupOptionsOut };

export default function ProfileCoursePage() {
  const router = useRouter();
  const [loaded, setLoaded] = useState<Loaded | "error" | undefined>();
  // Muda a cada nova busca, para o efeito abaixo rodar de novo.
  const [attempt, setAttempt] = useState(0);
  const [course, setCourse] = useState<CourseAnswer>(EMPTY_COURSE_ANSWER);
  const [saving, setSaving] = useState(false);
  // O `saving` só muda na próxima renderização: um clique duplo muito rápido
  // mandaria dois envios. A trava abaixo vale na hora.
  const sending = useRef(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([getProfileCourse(controller.signal), getCourseOptions(controller.signal)])
      .then(([profile, options]) => {
        if (profile.ok && options.ok) {
          setLoaded({ firstName: profile.profile.firstName, options: options.options });
          return;
        }
        const failure = profile.ok ? options : profile;
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

  // Ao navegar, o Next esconde a página em vez de desmontá-la (Activity, com
  // cacheComponents) e, se ela voltar, mostra o mesmo estado. Sem isto, o
  // botão voltaria preso em "Enviando…" depois de um envio que deu certo.
  useLayoutEffect(() => {
    return () => {
      sending.current = false;
      setSaving(false);
    };
  }, []);

  async function handleSave() {
    if (course.courseStatus === null || !courseAnswerReady(course)) return;
    if (sending.current) return;
    sending.current = true;
    setSaving(true);
    setError(null);

    const result = await saveProfileCourse(course);

    if (result.ok) {
      router.replace(PROFILE_PATH);
      return;
    }

    sending.current = false;
    setSaving(false);

    if (result.reason !== "failed") {
      router.replace(accessPath(result.reason));
      return;
    }

    // As escolhas continuam na tela para ela tentar de novo.
    setError("Não deu pra enviar. Tente de novo.");
  }

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
      <AppHeader />
      <main className={styles.main}>
        {loaded === undefined ? (
          <Loading />
        ) : (
          <div className={styles.screen}>
            <h1 className={styles.title}>Conta pra gente do seu curso</h1>
            {/* D-61: os grupos só veem as respostas somadas, nunca as dela sozinhas. */}
            <p className={styles.notice}>
              A liderança do grupo só vê números somados de todas as meninas,
              nunca a sua resposta sozinha.
            </p>

            <CourseQuestion
              legend="Você entrou num curso da área? (técnico ou graduação em tecnologia)"
              firstName={loaded.firstName}
              options={loaded.options}
              value={course}
              onChange={setCourse}
            />

            <div className={styles.actions}>
              <Button
                className={styles.fullWidth}
                disabled={course.courseStatus === null || !courseAnswerReady(course)}
                loading={saving}
                onClick={handleSave}
              >
                Salvar
              </Button>
              {/* "Voltar" não salva nada. */}
              <button
                type="button"
                className={styles.back}
                disabled={saving}
                onClick={() => router.push(PROFILE_PATH)}
              >
                Voltar
              </button>
            </div>
            {error && (
              <p className={styles.error} role="alert">
                {error}
              </p>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
