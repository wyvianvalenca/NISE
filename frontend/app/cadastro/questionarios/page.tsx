"use client";

// A04·3 · Avisos de questionários (Etapa 3 de 3).
// Atende RF-F7.07 com a mudança da issue #54: é só um aviso, sem opção de recusar
// (RN-30). O Figma ainda mostra "Sim / Não, obrigada"; o texto abaixo segue a issue.

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/Button";
import { Icon } from "@/components/Icon";
import { IconList } from "@/components/IconList";
import { StepProgress } from "@/components/StepProgress";
import { TextLink } from "@/components/TextLink";
import { confirmQuestionnaireNotice, pathAfterConsent, SIGNUP_PATHS } from "@/lib/signup";
import styles from "../cadastro.module.css";

export default function QuestionnairesPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleContinue() {
    setSaving(true);
    setError(null);
    try {
      await confirmQuestionnaireNotice();
      // M1 vai para a avaliação do evento; M2 vai direto para os interesses.
      router.push(await pathAfterConsent());
    } catch {
      setError("Não deu pra salvar. Tente de novo.");
      setSaving(false);
    }
  }

  return (
    <div className={styles.screen}>
      <div className={styles.backRow}>
        <TextLink href={SIGNUP_PATHS.opportunities} back>
          Etapa anterior
        </TextLink>
      </div>
      <StepProgress current={3} total={3} />

      <div className={styles.tile}>
        <Icon name="clipboard" />
      </div>
      <h1 className={styles.titleLoose}>Você vai receber questionários por e-mail</h1>
      <p className={styles.lead}>
        Como a avaliação de uma oficina e pesquisas sobre sua trajetória, depois de 3 e de 6 meses.
      </p>

      <div className={styles.block}>
        <IconList
          items={[
            { icon: "check", content: "O aviso chega por e-mail" },
            { icon: "check", content: "Responder é sempre opcional" },
          ]}
        />
      </div>

      <div className={styles.spacer} />

      <div className={styles.actions}>
        <Button className={styles.fullWidth} loading={saving} onClick={handleContinue}>
          Entendi, continuar
        </Button>
      </div>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
