"use client";

// A05 em modo edição · "Seus interesses". O mesmo formulário do cadastro, aberto
// pelo "Editar" do perfil já com as escolhas dela marcadas (RF-F10.10, #392).
// "Salvar" troca temas e etapa; as próximas sugestões do filé seguem a mudança.
// O que já está no filé fica. "Voltar" não envia nada.

import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { InterestsForm, type InitialInterests } from "@/components/InterestsForm";
import { LoadFailed } from "@/components/LoadFailed";
import { Loading } from "@/components/Loading";
import { accessPath } from "@/lib/lista-oficial";
import { getProfileDetails, PROFILE_PATHS } from "@/lib/profile-api";
import {
  getInterestOptions,
  type InterestOptions,
  type InterestsChoice,
  saveInterests,
} from "@/lib/signup-api";
import styles from "./page.module.css";

type Loaded = { options: InterestOptions; initial: InitialInterests };

export default function EditInterestsPage() {
  const router = useRouter();
  const [loaded, setLoaded] = useState<Loaded | "error" | undefined>();
  // Muda a cada nova busca, para o efeito abaixo rodar de novo.
  const [attempt, setAttempt] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([getInterestOptions(controller.signal), getProfileDetails(controller.signal)])
      .then(([options, details]) => {
        if (options.ok && details.ok) {
          // O perfil traz {code, label}: o formulário marca pelo código.
          setLoaded({
            options: options.options,
            initial: {
              topics: details.profile.topics.map((topic) => topic.code),
              everything: details.profile.allTopics,
              stage: details.profile.studyStage?.code ?? null,
            },
          });
          return;
        }
        const failure = options.ok ? details : options;
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
  // cacheComponents) e, se ela voltar, mostra o mesmo estado. Sem isto, o botão
  // voltaria preso em "Enviando…" depois de salvar.
  useLayoutEffect(() => {
    return () => setSaving(false);
  }, []);

  async function save(choice: InterestsChoice) {
    setSaving(true);
    setError(null);

    const result = await saveInterests(choice).catch(() => null);

    if (result?.ok) {
      // replace: o "voltar" do navegador, a partir do perfil, não reabre o
      // formulário que ela acabou de salvar.
      router.replace(PROFILE_PATHS.home);
      return;
    }

    setSaving(false);

    if (result && result.reason !== "failed") {
      router.replace(accessPath(result.reason));
      return;
    }

    // As escolhas continuam marcadas para ela tentar de novo.
    setError("Não deu pra salvar. Tente de novo.");
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
          <InterestsForm
            options={loaded.options}
            initial={loaded.initial}
            title="Seus interesses"
            saveLabel="Salvar"
            saving={saving}
            error={error}
            onSave={save}
          >
            {/* "Voltar" não salva nada. */}
            <button
              type="button"
              className={styles.back}
              disabled={saving}
              onClick={() => router.replace(PROFILE_PATHS.home)}
            >
              Voltar
            </button>
          </InterestsForm>
        )}
      </main>
    </div>
  );
}
