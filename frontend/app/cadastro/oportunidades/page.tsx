"use client";

// A04·2 · Oportunidades por e-mail (Etapa 2 de 3).
// Atende RF-F7.06 e RN-30 (issue #55).

import { useRouter } from "next/navigation";
import { useLayoutEffect, useState } from "react";
import { Button } from "@/components/Button";
import { Icon } from "@/components/Icon";
import { IconList } from "@/components/IconList";
import { StepProgress } from "@/components/StepProgress";
import { TextLink } from "@/components/TextLink";
import { SIGNUP_PATHS } from "@/lib/signup";
import { setOpportunityEmails, WITHOUT_SESSION } from "@/lib/signup-api";
import styles from "../cadastro.module.css";

export default function OpportunitiesPage() {
  const router = useRouter();
  // Qual botão está salvando, para mostrar "Enviando…" só nele.
  const [saving, setSaving] = useState<"yes" | "no" | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Ao navegar, o Next esconde a página em vez de desmontá-la (Activity, com cacheComponents)
  // e, na volta pela "Etapa anterior" da Etapa 3, mostra o mesmo estado. Sem isto, os botões
  // voltariam presos em "Enviando…" depois de uma escolha que deu certo.
  useLayoutEffect(() => {
    return () => setSaving(null);
  }, []);

  async function choose(enabled: boolean) {
    setSaving(enabled ? "yes" : "no");
    setError(null);

    const result = await setOpportunityEmails(enabled).catch(() => null);

    if (result?.ok) {
      router.push(SIGNUP_PATHS.questionnaires);
      return;
    }

    setSaving(null);

    if (result?.reason === "unauthenticated" || result?.reason === "incomplete_signup") {
      router.replace(WITHOUT_SESSION[result.reason]);
      return;
    }

    if (result?.reason === "terms_not_accepted") {
      // A preferência só é guardada depois do aceite dos termos (Etapa 1).
      router.replace(SIGNUP_PATHS.terms);
      return;
    }

    setError("Não deu pra salvar. Tente de novo.");
  }

  return (
    <div className={styles.screen}>
      <div className={styles.backRow}>
        <TextLink href={SIGNUP_PATHS.terms} back>
          Etapa anterior
        </TextLink>
      </div>
      <StepProgress current={2} total={3} />

      <div className={styles.tile}>
        <Icon name="mail" />
      </div>
      <h1 className={styles.titleLoose}>Quer receber oportunidades por e‑mail?</h1>
      <p className={styles.lead}>Avisos de oficinas, cursos e bolsas que combinam com você.</p>

      <div className={styles.block}>
        <IconList
          items={[
            { icon: "check", content: "No máximo 2 e-mails por mês" },
            { icon: "check", content: "Você cancela quando quiser" },
          ]}
        />
      </div>

      <div className={styles.spacer} />

      <div className={styles.actions}>
        <Button
          className={styles.fullWidth}
          loading={saving === "yes"}
          disabled={saving !== null}
          onClick={() => choose(true)}
        >
          Sim, quero receber
        </Button>
        <Button
          variant="secondary"
          className={styles.fullWidthTall}
          loading={saving === "no"}
          disabled={saving !== null}
          onClick={() => choose(false)}
        >
          Não, obrigada
        </Button>
      </div>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      <p className={styles.footnote}>Dá pra mudar quando quiser no seu perfil.</p>
    </div>
  );
}
