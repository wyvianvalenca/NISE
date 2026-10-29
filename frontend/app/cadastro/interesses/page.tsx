"use client";

// A05 · O que te interessa? Última tela do cadastro, antes de "Por que filé?".
// Atende RF-F10.01 (issue #56).

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/Button";
import { Chip } from "@/components/Chip";
import type { IconName } from "@/components/Icon";
import { TopicToggle } from "@/components/TopicToggle";
import {
  getInterestOptions,
  getOrigin,
  saveInterests,
  SIGNUP_PATHS,
  type InterestOptions,
  type InterestsChoice,
  type Origin,
} from "@/lib/signup";
import shared from "../cadastro.module.css";
import styles from "./page.module.css";

export default function InterestsPage() {
  const router = useRouter();
  const [options, setOptions] = useState<InterestOptions | null>(null);
  const [origin, setOrigin] = useState<Origin | null>(null);
  const [topics, setTopics] = useState<string[]>([]);
  const [everything, setEverything] = useState(false);
  const [stage, setStage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let current = true;
    Promise.all([getInterestOptions(), getOrigin()]).then(([lists, from]) => {
      if (!current) return;
      setOptions(lists);
      setOrigin(from);
    });
    return () => {
      current = false;
    };
  }, []);

  // Escolher um tema desmarca "me mostra de tudo", e vice-versa.
  function toggleTopic(code: string) {
    setEverything(false);
    setTopics((chosen) => (chosen.includes(code) ? chosen.filter((item) => item !== code) : [...chosen, code]));
  }

  function toggleEverything() {
    setTopics([]);
    setEverything((value) => !value);
  }

  async function save(choice: InterestsChoice) {
    setSaving(true);
    setError(null);
    try {
      await saveInterests(choice);
      router.push(SIGNUP_PATHS.done);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não deu pra salvar. Tente de novo.");
      setSaving(false);
    }
  }

  if (!options || !origin) {
    return (
      <p className={shared.status} aria-live="polite">
        Carregando…
      </p>
    );
  }

  const canStart = (topics.length > 0 || everything) && stage !== null;

  return (
    <div className={`${shared.screen} ${styles.interests}`}>
      <h1 className={styles.title}>O que te interessa?</h1>
      <p className={styles.lead}>Escolha um ou mais temas para seu filé.</p>

      <div className={styles.topics} role="group" aria-label="Temas">
        {options.topics.map((topic) => (
          <TopicToggle
            key={topic.code}
            icon={`topic-${topic.code}` as IconName}
            label={topic.label}
            selected={topics.includes(topic.code)}
            onClick={() => toggleTopic(topic.code)}
          />
        ))}
      </div>
      <TopicToggle
        variant="dashed"
        icon="compass"
        label="Ainda não sei, me mostra de tudo"
        selected={everything}
        onClick={toggleEverything}
      />

      <h2 className={styles.stageTitle}>Seu momento de estudo</h2>
      <div className={styles.stages} role="group" aria-label="Seu momento de estudo">
        {options.stages.map((option) => (
          <Chip
            key={option.code}
            size="lg"
            selected={stage === option.code}
            onClick={() => setStage(option.code)}
          >
            {option.label}
          </Chip>
        ))}
      </div>

      <div className={styles.actions}>
        <Button
          className={shared.fullWidth}
          disabled={!canStart}
          loading={saving}
          onClick={() => save({ topics, everything, stage })}
        >
          Começar meu filé
        </Button>
        {/* "Pular por agora" só existe no M2 (a confirmar com o design se a diferença é de propósito). */}
        {origin.kind === "self" && (
          <button
            type="button"
            className={styles.skip}
            disabled={saving}
            onClick={() => save({ topics: [], everything: false, stage: null })}
          >
            Pular por agora
          </button>
        )}
      </div>
      {error && (
        <p className={shared.error} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
