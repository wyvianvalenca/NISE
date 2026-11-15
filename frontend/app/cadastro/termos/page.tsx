"use client";

// A04·1 · Como usamos seus dados (Etapa 1 de 3).
// Atende RF-F7.02, RF-F7.03, RF-F7.04 e RF-F7.05 (issue #53).

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/Button";
import { Checkbox } from "@/components/Checkbox";
import { IconList } from "@/components/IconList";
import { StepProgress } from "@/components/StepProgress";
import { TextLink } from "@/components/TextLink";
import { SIGNUP_PATHS } from "@/lib/signup";
import { acceptTerms, getTermsSummary, type SessionProblem, type TermsSummary } from "@/lib/signup-api";
import styles from "../cadastro.module.css";

const WHAT_WE_COLLECT = [
  "Os eventos e ações de que você participa",
  "Seu filé: o que você fez, guardou ou dispensou",
  "Suas respostas a questionários e avaliações",
  "Se você entrou num curso de TI (técnico, graduação…) ou num trabalho na área",
];

/** Primeiro item de "Pra que usamos": muda se ela veio de um grupo (RN-01) ou sozinha (RN-04). */
function whoSees(summary: TermsSummary) {
  if (summary.origin.kind === "group") {
    return (
      <>
        <strong>A liderança do grupo {summary.origin.groupName}</strong> vê seu filé, suas respostas aos
        questionários e suas avaliações das ações, pra saber se elas estão funcionando. Outros grupos só veem
        números gerais, sem identificar você.
      </>
    );
  }
  return "Os grupos de incentivo cadastrados no NISE só veem números gerais, sem identificar você.";
}

/**
 * Para onde vai quem chega aqui sem sessão: a página inicial, onde ela entra ou cria conta,
 * ou a A02b, se ainda falta completar o cadastro pelo Google (#52).
 */
const WITHOUT_SESSION: Record<SessionProblem, string> = {
  unauthenticated: "/",
  incomplete_signup: "/cadastro/google",
};

export default function TermsPage() {
  const router = useRouter();
  const [summary, setSummary] = useState<TermsSummary | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  // Muda a cada nova busca do resumo: dispara o efeito e remonta a caixa "Li e concordo".
  const [attempt, setAttempt] = useState(0);
  const [agreed, setAgreed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    getTermsSummary(controller.signal).then(
      (result) => {
        if (result.ok) {
          setSummary(result.summary);
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

  /** Busca o resumo de novo. Ela precisa marcar "Li e concordo" de novo depois de ler. */
  function reloadSummary() {
    setSummary(null);
    setLoadFailed(false);
    setAgreed(false);
    setAttempt((current) => current + 1);
  }

  async function handleContinue() {
    if (!summary) return;
    setSaving(true);
    setError(null);

    const result = await acceptTerms(summary.version).catch(() => null);

    if (result?.ok) {
      router.push(SIGNUP_PATHS.opportunities);
      return;
    }

    setSaving(false);

    if (result?.reason === "unauthenticated" || result?.reason === "incomplete_signup") {
      router.replace(WITHOUT_SESSION[result.reason]);
      return;
    }

    if (result?.reason === "outdated") {
      // Ela leu um texto que já mudou: mostra o resumo atual antes de ela aceitar.
      setError("Os termos mudaram. Leia o resumo de novo e marque Li e concordo.");
      reloadSummary();
      return;
    }

    setError("Não deu pra salvar. Tente de novo.");
  }

  return (
    <div className={styles.screen}>
      <StepProgress current={1} total={3} />
      <h1 className={styles.title}>Como usamos seus dados</h1>
      <p className={styles.lead}>Veja o que a NISE guarda sobre você e pra quê.</p>

      <h2 className={styles.sectionTitle}>O que coletamos</h2>
      <IconList items={WHAT_WE_COLLECT.map((text) => ({ icon: "check", content: text }))} />

      <h2 className={styles.sectionTitle}>Pra que usamos</h2>
      {summary ? (
        <IconList
          items={[
            { icon: "arrow-right", content: whoSees(summary) },
            { icon: "arrow-right", content: "Sugerir atividades com base no que você curtiu, fez ou não quis" },
          ]}
        />
      ) : loadFailed ? (
        <div role="alert">
          <p className={styles.error}>Não deu pra carregar quem vê seus dados.</p>
          <Button variant="secondary" onClick={reloadSummary}>
            Tentar de novo
          </Button>
        </div>
      ) : (
        <p className={styles.status} aria-live="polite">
          Carregando…
        </p>
      )}

      <div className={styles.linkRow}>
        <TextLink href="/termos" external>
          Ler os termos completos
        </TextLink>
      </div>

      <div className={styles.spacer} />

      {/*
        Só libera depois que o resumo carrega: ela precisa ler quem vê os dados dela (RN-01, RN-04)
        antes de concordar. Isso também evita perder o toque: o resumo empurra a caixa para baixo
        quando aparece, e um toque dado nesse instante cairia fora dela.
      */}
      <Checkbox key={attempt} disabled={!summary} onCheckedChange={setAgreed}>
        Li e concordo com os{" "}
        <a href="/termos#uso" target="_blank" rel="noopener noreferrer">
          Termos de uso
        </a>{" "}
        e a{" "}
        <a href="/termos#privacidade" target="_blank" rel="noopener noreferrer">
          Política de privacidade
        </a>{" "}
        da NISE.
      </Checkbox>

      <div className={styles.actions}>
        <Button
          className={styles.fullWidth}
          disabled={!agreed || !summary}
          loading={saving}
          onClick={handleContinue}
        >
          Entendi, continuar
        </Button>
      </div>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      <p className={styles.footnote}>Você pode rever suas escolhas quando quiser, em Perfil.</p>
    </div>
  );
}
