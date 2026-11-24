"use client";

import { useState } from "react";
import { Button } from "@/components/Button";
import { Chip } from "@/components/Chip";
import { TopicToggle } from "@/components/TopicToggle";
import { type AccessProblem } from "@/lib/lista-oficial";
import { saveInterests, type InterestOptions } from "@/lib/signup-api";
import { DEFAULT_TOPIC_ICON, TOPIC_ICONS } from "@/lib/topic-icons";
import styles from "./ProfileInterests.module.css";

type ProfileInterestsProps = {
  options: InterestOptions;
  /** What she has saved so far. `stage` is null when she never answered A05. */
  initial: { topics: string[]; everything: boolean; stage: string | null };
  /** A401 or a terms change while saving: the page sends her elsewhere. */
  onAccessProblem: (problem: AccessProblem) => void;
};

/**
 * "Seus interesses" in the profile (RF-F10.10): the A05 choices, already marked,
 * saved with the same route and the same rules (a topic or "me mostra de tudo",
 * never both, and a study stage).
 */
export function ProfileInterests({ options, initial, onAccessProblem }: ProfileInterestsProps) {
  const [topics, setTopics] = useState(initial.topics);
  const [everything, setEverything] = useState(initial.everything);
  const [stage, setStage] = useState(initial.stage);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ kind: "saved" | "error"; text: string } | null>(null);

  function toggleTopic(code: string) {
    setMessage(null);
    setEverything(false);
    setTopics((chosen) =>
      chosen.includes(code) ? chosen.filter((item) => item !== code) : [...chosen, code],
    );
  }

  function toggleEverything() {
    setMessage(null);
    setTopics([]);
    setEverything((value) => !value);
  }

  function chooseStage(code: string) {
    setMessage(null);
    setStage(code);
  }

  async function save() {
    if (stage === null) return;
    setSaving(true);
    setMessage(null);

    const result = await saveInterests({ topics, everything, stage }).catch(() => null);
    setSaving(false);

    if (result?.ok) {
      setMessage({ kind: "saved", text: "Interesses salvos." });
      return;
    }

    if (result && result.reason !== "failed") {
      onAccessProblem(result.reason);
      return;
    }

    setMessage({ kind: "error", text: "Não deu pra salvar. Tente de novo." });
  }

  const canSave = (topics.length > 0 || everything) && stage !== null;

  return (
    <section className={styles.section} aria-labelledby="seus-interesses">
      <h2 id="seus-interesses" className={styles.title}>
        Seus interesses
      </h2>

      <div className={styles.topics} role="group" aria-label="Temas">
        {options.topics.map((topic) => (
          <TopicToggle
            key={topic.code}
            icon={TOPIC_ICONS[topic.code] ?? DEFAULT_TOPIC_ICON}
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

      <h3 className={styles.stageTitle}>Seu momento de estudo</h3>
      <div className={styles.stages} role="group" aria-label="Seu momento de estudo">
        {options.stages.map((option) => (
          <Chip
            key={option.code}
            size="lg"
            selected={stage === option.code}
            onClick={() => chooseStage(option.code)}
          >
            {option.label}
          </Chip>
        ))}
      </div>

      <Button disabled={!canSave} loading={saving} onClick={save}>
        Salvar interesses
      </Button>
      {message && (
        <p
          className={message.kind === "error" ? styles.error : styles.saved}
          role={message.kind === "error" ? "alert" : "status"}
        >
          {message.text}
        </p>
      )}
    </section>
  );
}
