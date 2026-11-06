"use client";

// A06·2 · Sugestões: uma de cada vez, com "Não é pra mim", "Talvez depois" e "Quero fazer".
// Atende RF-F10.04 e RF-F11.04 (issues #102 e #103). Usa os dados de teste de lib/sugestoes.ts.

import Link from "next/link";
import { useState } from "react";
import { Icon, type IconName } from "@/components/Icon";
import { SuggestionCard } from "@/components/SuggestionCard";
import { Tag, TagList } from "@/components/Tag";
import { TextLink } from "@/components/TextLink";
import { BANDS, type BandCode } from "@/lib/descobrir";
import type { Choice, ReasonCode, Suggestion } from "@/lib/sugestoes";
import { ReasonSheet } from "./ReasonSheet";
import { useSuggestionDeck } from "./useSuggestionDeck";
import styles from "./SuggestionsScreen.module.css";

export function SuggestionsScreen({ band }: { band: BandCode }) {
  const title = BANDS[band].title;
  const { state, item, position, total, choose } = useSuggestionDeck(band);
  const [reasonOpen, setReasonOpen] = useState(false);

  function sendReason(reason?: ReasonCode) {
    setReasonOpen(false);
    choose("nao-e-pra-mim", reason);
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <TextLink href="/descobrir" back className={styles.back}>
          {title}
          <span className={styles.srOnly}>, voltar ao Descobrir</span>
        </TextLink>
        {state.status === "ready" && (
          // A tela do filé é a #115; até ela existir, o link dá 404.
          <Link href="/file" className={styles.filePill}>
            <Icon name="plus" />
            Meu filé
            <span className={styles.fileCount}>
              {state.fileTotal}
              <span className={styles.srOnly}> {state.fileTotal === 1 ? "item" : "itens"}</span>
            </span>
          </Link>
        )}
      </header>

      <main className={styles.main}>
        <h1 className={styles.srOnly}>Sugestões de {title}</h1>
        {/* Espaço do aviso no Figma: o "Desfazer" da #107 aparece aqui. */}
        <div className={styles.noticeSlot} />

        {state.status === "loading" ? (
          // Provisório: a tela "Tecendo seu filé…" (E03) é da issue #81 e entra aqui quando existir.
          <p className={styles.status} aria-live="polite">
            Carregando…
          </p>
        ) : item ? (
          <>
            <p className={styles.counter} aria-live="polite">
              Sugestão {position} de {total}
              <span className={styles.srOnly}>: {item.title}</span>
            </p>
            <Deck item={item} behind={Math.min(total - position, 2)} />
            <Actions
              disabled={state.pending}
              onChoose={(choice) => {
                if (choice === "nao-e-pra-mim") setReasonOpen(true);
                else choose(choice);
              }}
            />
          </>
        ) : (
          <End title={title} empty={total === 0} />
        )}
      </main>

      <ReasonSheet open={reasonOpen} onSubmit={sendReason} onCancel={() => setReasonOpen(false)} />
    </div>
  );
}

/** O card da sugestão com até dois cards tortos atrás, quando ainda há mais (Figma: Baralho). */
function Deck({ item, behind }: { item: Suggestion; behind: number }) {
  return (
    <div className={styles.deck}>
      {behind >= 2 && <div className={`${styles.backCard} ${styles.backLeft}`} aria-hidden="true" />}
      {behind >= 1 && <div className={`${styles.backCard} ${styles.backRight}`} aria-hidden="true" />}
      <div className={styles.front}>
        <SuggestionCard
          // A chave nova a cada sugestão faz o leitor de tela tratar o card como conteúdo novo.
          key={item.id}
          kind={item.kind}
          title={item.title}
          source={item.source}
          reason={item.why}
          tags={
            <TagList>
              <Tag variant="chip">{item.format}</Tag>
              <Tag variant="chip">{item.duration}</Tag>
              <Tag variant={item.cost === "Grátis" ? "pink" : "chip"}>{item.cost}</Tag>
              <Tag variant="chip">
                {item.minAge}+<span className={styles.srOnly}> anos</span>
              </Tag>
            </TagList>
          }
        />
      </div>
    </div>
  );
}

const ACTIONS: { choice: Choice; label: string; icon: IconName }[] = [
  { choice: "nao-e-pra-mim", label: "Não é pra mim", icon: "x" },
  { choice: "talvez-depois", label: "Talvez depois", icon: "bookmark" },
  { choice: "quero-fazer", label: "Quero fazer", icon: "plus" },
];

function Actions({ disabled, onChoose }: { disabled: boolean; onChoose: (choice: Choice) => void }) {
  return (
    <div className={styles.actions}>
      {ACTIONS.map((action) => {
        const main = action.choice === "quero-fazer";
        return (
          <button
            key={action.choice}
            type="button"
            className={`${styles.action} ${main ? styles.actionMain : ""}`}
            disabled={disabled}
            onClick={() => onChoose(action.choice)}
          >
            <span className={styles.actionCircle}>
              <Icon name={action.icon} size={main ? 30 : 24} />
            </span>
            {action.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Depois da última sugestão (ou faixa sem nenhuma). PROVISÓRIO: o Figma ainda não tem
 * essa tela; o destino será confirmado com o design (#102).
 */
function End({ title, empty }: { title: string; empty: boolean }) {
  return (
    <div className={styles.end}>
      <h2 className={styles.endTitle}>
        {empty ? "Por enquanto, nada marcado." : `Você viu todas as sugestões de ${title}.`}
      </h2>
      <p className={styles.endText}>Escolha outra faixa ou volte mais tarde para ver novidades.</p>
      <TextLink href="/descobrir" back>
        Voltar ao Descobrir
      </TextLink>
    </div>
  );
}
