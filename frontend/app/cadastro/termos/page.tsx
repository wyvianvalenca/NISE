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
import { acceptTerms, getTermsSummary, SIGNUP_PATHS, type TermsSummary } from "@/lib/signup";
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

export default function TermsPage() {
  const router = useRouter();
  const [summary, setSummary] = useState<TermsSummary | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let current = true;
    getTermsSummary().then((result) => {
      if (current) setSummary(result);
    });
    return () => {
      current = false;
    };
  }, []);

  async function handleContinue() {
    if (!summary) return;
    setSaving(true);
    setError(null);
    try {
      await acceptTerms(summary.version);
      router.push(SIGNUP_PATHS.opportunities);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não deu pra salvar. Tente de novo.");
      setSaving(false);
    }
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

      <Checkbox checked={agreed} onChange={(event) => setAgreed(event.target.checked)}>
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
