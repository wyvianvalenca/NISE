"use client";

// A05a · Antes de começar. Depois dos avisos (A04) e da avaliação do evento
// (A03, só no M1), antes de "O que te interessa?" (A05). Atende RF-F10.26 e
// D-64 (issue #303): as perguntas 1 e 2 do questionário "Como está seu
// caminho?" (#293), com as mesmas opções, para dar o "antes" da comparação.
//
// Sem contador de etapas e sem "Etapa anterior", como no Figma (2013:903).

import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useState } from "react";
import { Button } from "@/components/Button";
import { Chip, ChipGroup } from "@/components/Chip";
import { Loading } from "@/components/Loading";
import { SIGNUP_PATHS } from "@/lib/signup";
import { WITHOUT_SESSION } from "@/lib/signup-api";
import {
  type ComputingView,
  type FutureSelf,
  loadStartingPoint,
  sendStartingPoint,
  type StartingPointOut,
} from "@/lib/starting-point";
import shared from "../cadastro.module.css";
import styles from "./page.module.css";

export default function StartingPointPage() {
  const router = useRouter();
  const [screen, setScreen] = useState<StartingPointOut | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  // Muda a cada nova busca, para o efeito abaixo rodar de novo.
  const [attempt, setAttempt] = useState(0);
  const [computingView, setComputingView] = useState<ComputingView | null>(null);
  const [futureSelf, setFutureSelf] = useState<FutureSelf | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    loadStartingPoint(controller.signal).then(
      (result) => {
        if (result.ok && result.screen.open) {
          setScreen(result.screen);
        } else if (result.ok) {
          // Já respondeu, ou já passou dos interesses: a A05a é uma vez só.
          router.replace(SIGNUP_PATHS.interests);
        } else if (result.reason === "terms_not_accepted") {
          // A A05a vem depois do aceite dos termos (Etapa 1).
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

  // "Pular" não grava nada (RF-F10.26).
  function skip() {
    router.push(SIGNUP_PATHS.interests);
  }

  async function handleContinue() {
    setSaving(true);
    setError(null);

    const result = await sendStartingPoint({ computingView, futureSelf }).catch(() => null);

    // "closed": já respondeu (em outra aba, por exemplo). A primeira resposta fica,
    // e ela segue como se tivesse enviado.
    if (result?.ok || result?.reason === "closed") {
      router.push(SIGNUP_PATHS.interests);
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

  // Nada da tela aparece antes de saber se ela ainda responde: quem já respondeu,
  // ou está sem sessão, vai para outra página sem ver a A05a piscar.
  if (!screen) {
    return (
      <div className={shared.screen}>
        {loadFailed ? (
          <div role="alert">
            <p className={shared.error}>Não deu pra carregar as perguntas.</p>
            <div className={shared.actions}>
              <Button variant="secondary" className={shared.fullWidth} onClick={retryLoad}>
                Tentar de novo
              </Button>
              {/* Responder é opcional: ela pode seguir para os interesses. */}
              <button type="button" className={styles.skip} onClick={skip}>
                Pular
              </button>
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
      <h1 className={shared.title}>
        {screen.firstName ? `Antes de começar, ${screen.firstName}` : "Antes de começar"}
      </h1>
      <p className={shared.lead}>
        Duas perguntinhas rápidas pra gente acompanhar seu caminho. Daqui a uns meses vamos
        perguntar de novo.
      </p>

      <div className={styles.questions}>
        {/* Uma escolha por pergunta. Tocar de novo na escolhida desmarca, e trocar
            vale até ela sair da tela. */}
        <ChipGroup label="1. Hoje, computação pra você é…" stacked>
          {screen.computingViews.map((option) => (
            <Chip
              key={option.code}
              size="lg"
              className={styles.choice}
              selected={computingView === option.code}
              onClick={() =>
                setComputingView((chosen) =>
                  chosen === option.code ? null : (option.code as ComputingView),
                )
              }
            >
              {option.label}
            </Chip>
          ))}
        </ChipGroup>

        <ChipGroup label="2. Daqui a uns anos, você se vê estudando ou trabalhando com computação?">
          {screen.futureSelves.map((option) => (
            <Chip
              key={option.code}
              size="lg"
              className={styles.choice}
              selected={futureSelf === option.code}
              onClick={() =>
                setFutureSelf((chosen) =>
                  chosen === option.code ? null : (option.code as FutureSelf),
                )
              }
            >
              {option.label}
            </Chip>
          ))}
        </ChipGroup>
      </div>

      <div className={shared.spacer} />

      <div className={styles.actions}>
        {/* Uma pergunta respondida já basta; sem nenhuma, o caminho é "Pular". */}
        <Button
          className={shared.fullWidth}
          disabled={computingView === null && futureSelf === null}
          loading={saving}
          onClick={handleContinue}
        >
          Continuar
        </Button>
        <button type="button" className={styles.skip} disabled={saving} onClick={skip}>
          Pular
        </button>
      </div>
      {error && (
        <p className={shared.error} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
