"use client";

// A05 · O que te interessa? Última tela do cadastro, antes de "Por que filé?".
// Atende RF-F10.01 (issues #56 e #76), pelas rotas da #147. O formulário é o
// mesmo da edição pelo perfil (components/InterestsForm.tsx).

import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useState } from "react";
import { Button } from "@/components/Button";
import { InterestsForm } from "@/components/InterestsForm";
import { Loading } from "@/components/Loading";
import { SIGNUP_PATHS } from "@/lib/signup";
import {
  getInterestOptions,
  type InterestOptions,
  type InterestsChoice,
  saveInterests,
  WITHOUT_SESSION,
} from "@/lib/signup-api";
import shared from "../cadastro.module.css";
import styles from "./page.module.css";

export default function InterestsPage() {
  const router = useRouter();
  const [options, setOptions] = useState<InterestOptions | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  // Muda a cada nova busca das listas, para o efeito abaixo rodar de novo.
  const [attempt, setAttempt] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    getInterestOptions(controller.signal).then(
      (result) => {
        if (result.ok) {
          setOptions(result.options);
        } else if (result.reason === "terms_not_accepted") {
          // A A05 vem depois do aceite dos termos (Etapa 1).
          router.replace(SIGNUP_PATHS.terms);
        } else if (result.reason === "failed") {
          setLoadFailed(true);
        } else {
          router.replace(WITHOUT_SESSION[result.reason]);
        }
      },
      () => {
        // Sem rede. Se ela só saiu da página, não há o que mostrar.
        if (!controller.signal.aborted) setLoadFailed(true);
      },
    );
    return () => controller.abort();
  }, [attempt, router]);

  // Ao navegar, o Next esconde a página em vez de desmontá-la (Activity, com cacheComponents)
  // e, se ela voltar, mostra o mesmo estado. Sem isto, o botão voltaria preso em
  // "Enviando…" depois de salvar.
  useLayoutEffect(() => {
    return () => setSaving(false);
  }, []);

  function retryLoad() {
    setLoadFailed(false);
    setAttempt((current) => current + 1);
  }

  async function save(choice: InterestsChoice) {
    setSaving(true);
    setError(null);

    const result = await saveInterests(choice).catch(() => null);

    if (result?.ok) {
      router.push(SIGNUP_PATHS.done);
      return;
    }

    setSaving(false);

    if (result?.reason === "unauthenticated" || result?.reason === "incomplete_signup") {
      router.replace(WITHOUT_SESSION[result.reason]);
      return;
    }

    if (result?.reason === "terms_not_accepted") {
      router.replace(SIGNUP_PATHS.terms);
      return;
    }

    setError("Não deu pra salvar. Tente de novo.");
  }

  // Nada da tela aparece antes das listas chegarem: quem está sem sessão ou sem o
  // aceite dos termos vai para outra página sem ver a A05 piscar.
  if (!options) {
    return (
      <div className={shared.screen}>
        {loadFailed ? (
          <div role="alert">
            <p className={shared.error}>Não deu pra carregar os temas.</p>
            <div className={styles.actions}>
              <Button variant="secondary" className={shared.fullWidth} onClick={retryLoad}>
                Tentar de novo
              </Button>
            </div>
          </div>
        ) : (
          <Loading />
        )}
      </div>
    );
  }

  return (
    <div className={shared.screen}>
      <InterestsForm
        options={options}
        initial={{ topics: [], everything: false, stage: null }}
        title="O que te interessa?"
        saveLabel="Começar meu filé"
        saving={saving}
        error={error}
        onSave={save}
      />
    </div>
  );
}
