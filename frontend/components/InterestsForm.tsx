"use client";

// O formulário de temas e momento de estudo. Serve à A05 do cadastro (RF-F10.01)
// e à edição pelo perfil (RF-F10.10, #392): muda o título, a escolha inicial e o
// rótulo do botão. Quem usa guarda o "enviando" e o erro, e decide para onde ir.

import { type ReactNode, useState } from "react";
import { Button } from "@/components/Button";
import { Chip } from "@/components/Chip";
import type { IconName } from "@/components/Icon";
import { TopicToggle } from "@/components/TopicToggle";
import type { InterestOptions, InterestsChoice } from "@/lib/signup-api";
import styles from "./InterestsForm.module.css";

// Ícone de cada tema. Os temas vêm do back: um código sem ícone aqui usa o
// ícone genérico, em vez de quebrar a imagem.
const TOPIC_ICONS: Record<string, IconName> = {
  programacao: "topic-programacao",
  robotica: "topic-robotica",
  ia: "topic-ia",
  dados: "topic-dados",
  ciberseguranca: "topic-ciberseguranca",
  jogos: "topic-jogos",
  sites: "topic-sites",
  design: "topic-design",
};
const DEFAULT_TOPIC_ICON: IconName = "sparkle";

/** O que já está marcado quando o formulário abre. `stage` é null enquanto ela não escolheu. */
export type InitialInterests = {
  topics: string[];
  everything: boolean;
  stage: string | null;
};

type InterestsFormProps = {
  options: InterestOptions;
  initial: InitialInterests;
  title: string;
  /** Texto do botão principal ("Começar meu filé", "Salvar"). */
  saveLabel: string;
  /** O envio está em andamento: o botão mostra a espera. */
  saving: boolean;
  /** Erro do envio, mostrado com as escolhas ainda marcadas. */
  error: string | null;
  onSave: (choice: InterestsChoice) => void;
  /** Ações extras, logo abaixo do botão principal (ex.: "Voltar"). */
  children?: ReactNode;
};

export function InterestsForm({
  options,
  initial,
  title,
  saveLabel,
  saving,
  error,
  onSave,
  children,
}: InterestsFormProps) {
  const [topics, setTopics] = useState<string[]>(initial.topics);
  const [everything, setEverything] = useState(initial.everything);
  const [stage, setStage] = useState<string | null>(initial.stage);

  // Escolher um tema desmarca "me mostra de tudo", e vice-versa.
  function toggleTopic(code: string) {
    setEverything(false);
    setTopics((chosen) => (chosen.includes(code) ? chosen.filter((item) => item !== code) : [...chosen, code]));
  }

  function toggleEverything() {
    setTopics([]);
    setEverything((value) => !value);
  }

  // Não há "Pular por agora" (D-19): ela escolhe um tema ou "me mostra de tudo", e a etapa.
  const canStart = (topics.length > 0 || everything) && stage !== null;

  return (
    <div className={styles.interests}>
      <h1 className={styles.title}>{title}</h1>
      <p className={styles.lead}>Escolha um ou mais temas para seu filé.</p>

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

      {/* O aviso geral fica acima do botão, à vista: embaixo do "Voltar" ele sai da tela no celular. */}
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      <div className={styles.actions}>
        <Button
          className={styles.fullWidth}
          disabled={!canStart}
          loading={saving}
          onClick={() => stage && onSave({ topics, everything, stage })}
        >
          {saveLabel}
        </Button>
        {children}
      </div>
    </div>
  );
}
