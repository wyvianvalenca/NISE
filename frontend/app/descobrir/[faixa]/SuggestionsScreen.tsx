"use client";

// A06·2 · Sugestões: uma de cada vez, com "Não é pra mim", "Talvez depois" e "Quero fazer",
// e o aviso com "Desfazer" depois de cada escolha.
// Atende RF-F10.04, RF-F10.05 e RF-F11.04 (issues #102, #103 e #107). Usa os dados de teste de lib/sugestoes.ts.

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/Button";
import { Icon, type IconName } from "@/components/Icon";
import { SuggestionCard } from "@/components/SuggestionCard";
import { Tag, TagList } from "@/components/Tag";
import { TextLink } from "@/components/TextLink";
import { BANDS, type BandCode } from "@/lib/descobrir";
import type { Choice, ReasonCode, Suggestion } from "@/lib/sugestoes";
import { ReasonSheet } from "./ReasonSheet";
import { UndoToast, type UndoNotice } from "./UndoToast";
import { useSuggestionDeck } from "./useSuggestionDeck";
import styles from "./SuggestionsScreen.module.css";

export function SuggestionsScreen({ band }: { band: BandCode }) {
  const title = BANDS[band].title;
  const [notice, setNotice] = useState<UndoNotice | null>(null);
  const noticeKey = useRef(0);

  // O aviso só aparece depois que o back confirma a escolha; assim o "Desfazer" nunca vem antes.
  const showNotice = useCallback((chosen: Suggestion, choice: Choice) => {
    noticeKey.current += 1;
    setNotice({ key: noticeKey.current, id: chosen.id, title: chosen.title, choice, status: "ready" });
  }, []);
  const hideNotice = useCallback(() => setNotice(null), []);

  const { state, item, position, total, choose, undo, reload } = useSuggestionDeck(band, { onChoiceConfirmed: showNotice });
  const [reasonOpen, setReasonOpen] = useState(false);

  // Depois de desfazer, o foco vai para o contador, que lê "Sugestão N de M: <título>".
  const counterRef = useRef<HTMLParagraphElement>(null);
  const [restored, setRestored] = useState(0);
  useEffect(() => {
    if (restored) counterRef.current?.focus();
  }, [restored]);

  /** Uma escolha nova substitui o aviso: só a última pode ser desfeita. */
  function decide(choice: Choice, reason?: ReasonCode) {
    setNotice(null);
    choose(choice, reason);
  }

  function sendReason(reason?: ReasonCode) {
    setReasonOpen(false);
    decide("nao-e-pra-mim", reason);
  }

  async function undoLast() {
    if (!notice || notice.status === "undoing") return;
    setNotice({ ...notice, status: "undoing" });
    try {
      await undo(notice.id);
      setNotice(null);
      setRestored((count) => count + 1);
    } catch {
      // Ela vê o erro e pode tentar de novo enquanto o aviso estiver na tela.
      setNotice({ ...notice, status: "error" });
    }
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

      {notice && <UndoToast key={notice.key} notice={notice} onUndo={undoLast} onTimeout={hideNotice} />}

      <main className={styles.main}>
        <h1 className={styles.srOnly}>Sugestões de {title}</h1>
        {/* Espaço do aviso no Figma; o aviso fica por cima dele (.toastArea), para não empurrar o card. */}
        <div className={styles.noticeSlot} />

        {state.status === "loading" ? (
          // Provisório: a tela "Tecendo seu filé…" (E03) é da issue #81 e entra aqui quando existir.
          <p className={styles.status} aria-live="polite">
            Carregando…
          </p>
        ) : state.status === "error" ? (
          <LoadError onRetry={reload} />
        ) : item ? (
          <>
            {state.choiceFailed && (
              <p className={styles.error} role="alert">
                Não deu pra guardar. Tente de novo.
              </p>
            )}
            <p ref={counterRef} tabIndex={-1} className={styles.counter} aria-live="polite">
              Sugestão {position} de {total}
              <span className={styles.srOnly}>: {item.title}</span>
            </p>
            <Deck item={item} behind={Math.min(total - position, 2)} />
            <Actions
              disabled={state.pending}
              onChoose={(choice) => {
                if (choice === "nao-e-pra-mim") setReasonOpen(true);
                else decide(choice);
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
 * A busca da faixa falhou. PROVISÓRIO: quando a #81 entrar, a E04 "Não foi possível carregar"
 * ocupa este lugar, com o mesmo "Tentar de novo".
 */
function LoadError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className={styles.end} role="alert">
      <h2 className={styles.endTitle}>Não foi possível carregar as sugestões.</h2>
      <p className={styles.endText}>Confira sua conexão e tente de novo.</p>
      <Button onClick={onRetry} className={styles.retry}>
        Tentar de novo
      </Button>
    </div>
  );
}

/**
 * Depois da última sugestão (A06·2 · Sugestões acabaram, #166) ou faixa sem nenhuma.
 * O foco vai para o título, porque os botões de escolha saíram da tela.
 */
function End({ title, empty }: { title: string; empty: boolean }) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => titleRef.current?.focus(), []);

  return (
    <div className={styles.end}>
      <EmptyDeck />
      <h2 ref={titleRef} tabIndex={-1} className={styles.endTitle}>
        {empty ? "Por enquanto, nada marcado." : `Você viu todas as sugestões de ${title}`}
      </h2>
      {!empty && <p className={styles.endText}>Por enquanto, é isso por aqui.</p>}
      <div className={styles.endActions}>
        <Link href="/descobrir" className={styles.endMain}>
          Escolher outra categoria
        </Link>
        {/* A tela Ver depois é a #111; até ela entrar, o link dá 404. */}
        <Link href="/ver-depois" className={styles.endSecondary}>
          Ver o que salvei pra depois
        </Link>
      </div>
    </div>
  );
}

/** Dois cards tracejados, sem nada dentro (Figma: Card / Acabaram as sugestões · Ícone). */
function EmptyDeck() {
  return (
    <svg className={styles.endArt} width="130" height="110" viewBox="0 0 130 110" fill="none" aria-hidden="true">
      <g stroke="currentColor" strokeWidth="2" strokeDasharray="5 4">
        <rect x="22" y="14" width="44" height="78" rx="5" transform="rotate(-8 44 53)" />
        <rect x="64" y="14" width="44" height="78" rx="5" transform="rotate(8 86 53)" />
        <rect x="43" y="10" width="44" height="78" rx="5" transform="rotate(-3 65 49)" />
      </g>
    </svg>
  );
}
