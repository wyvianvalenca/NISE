"use client";

// A06·2 · Sugestões: uma de cada vez, com "Não é pra mim", "Talvez depois" e "Quero fazer",
// e o aviso com "Desfazer" depois de cada escolha.
// Atende RF-F10.04, RF-F10.05 e RF-F11.04 (issues #102, #103 e #107), pelas rotas da #104
// (integração na #105) e a do "Desfazer" da #108 (integração na #109).

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { LinkButton } from "@/components/Button";
import { Icon, type IconName } from "@/components/Icon";
import { LoadFailed } from "@/components/LoadFailed";
import { SuggestionCard } from "@/components/SuggestionCard";
import { Tag, TagList } from "@/components/Tag";
import { TecendoFile } from "@/components/TecendoFile";
import { TextLink } from "@/components/TextLink";
import { BANDS, type BandCode } from "@/lib/descobrir";
import { useLongWait } from "@/lib/loading";
import { SIGNUP_PATHS } from "@/lib/signup";
import { WITHOUT_SESSION } from "@/lib/signup-api";
import {
  getSuggestions,
  type Choice,
  type ReasonCode,
  type Suggestion,
  type SuggestionsData,
  type SuggestionsResult,
} from "@/lib/sugestoes";
import { ReasonSheet } from "./ReasonSheet";
import { UndoToast, type UndoNotice } from "./UndoToast";
import { useSuggestionDeck } from "./useSuggestionDeck";
import styles from "./SuggestionsScreen.module.css";

/** Para onde ela vai quando a rota recusa: sem sessão, ou sem o aceite dos termos. */
function redirectFor(result: SuggestionsResult | null): string | null {
  if (!result || result.ok) return null;
  if (result.reason === "terms_not_accepted") return SIGNUP_PATHS.terms;
  if (result.reason === "failed") return null;
  return WITHOUT_SESSION[result.reason];
}

// Uma falha vira erro, para useLongWait mostrar a E04 com "Tentar novamente".
async function fetchBand(band: BandCode): Promise<SuggestionsResult> {
  const result = await getSuggestions(band);
  if (!result.ok && result.reason === "failed") {
    throw new Error("As sugestões não carregaram");
  }
  return result;
}

/**
 * Busca a faixa com a espera da #81: uma espera curta não mostra nada, uma longa mostra o
 * "Tecendo seu filé…" (E03) e uma falha mostra a E04 (RNF-F10.02).
 */
export function SuggestionsScreen({ band }: { band: BandCode }) {
  const router = useRouter();
  // useLongWait recomeça a busca quando a função muda; useCallback a mantém a mesma por faixa.
  const fetcher = useCallback(() => fetchBand(band), [band]);
  const { phase, data: result, retry } = useLongWait(fetcher);
  const redirect = redirectFor(result);

  useEffect(() => {
    if (redirect) router.replace(redirect);
  }, [redirect, router]);

  if (phase === "weaving") return <TecendoFile />;
  if (phase === "error") return <LoadFailed onRetry={retry} />;

  return <BandSuggestions band={band} data={result?.ok ? result.data : null} />;
}

function BandSuggestions({ band, data }: { band: BandCode; data: SuggestionsData | null }) {
  const title = BANDS[band].title;
  const [notice, setNotice] = useState<UndoNotice | null>(null);
  const noticeKey = useRef(0);

  // O card que acabou de ser escolhido, saindo para o lado da escolha (some quando a animação
  // termina), e o que voltou com o "Desfazer", entrando pelo mesmo lado.
  const [leaving, setLeaving] = useState<CardMotion | null>(null);
  const [returning, setReturning] = useState<CardMotion | null>(null);

  // O aviso e a saída do card só vêm depois que o back confirma a escolha; assim o
  // "Desfazer" nunca vem antes, e o card não sai para voltar se der erro.
  const onChoiceConfirmed = useCallback((chosen: Suggestion, choice: Choice) => {
    noticeKey.current += 1;
    setNotice({ key: noticeKey.current, id: chosen.id, title: chosen.title, choice, status: "ready" });
    setLeaving({ key: noticeKey.current, item: chosen, choice });
    setReturning(null);
  }, []);
  const hideNotice = useCallback(() => setNotice(null), []);

  const { state, item, position, total, choose, undo } = useSuggestionDeck(data, { onChoiceConfirmed });
  const [reasonOpen, setReasonOpen] = useState(false);
  // O fim da faixa só puxa o foco quando ela chega lá escolhendo, não quando a página já abre nele.
  const [decided, setDecided] = useState(false);

  // Cada volta à faixa começa do zero: sem o aviso "Desfazer" nem o motivo aberto de antes.
  // Com cacheComponents, o Next esconde a tela (Activity) em vez de desmontá-la, e a limpeza
  // de um useLayoutEffect roda nessa hora. A lista e a posição, quem zera é o
  // useSuggestionDeck, quando o useLongWait descarta os dados.
  // Uma animação interrompida pela troca de tela não termina, então os cards em movimento
  // também saem aqui.
  useLayoutEffect(() => {
    return () => {
      setNotice(null);
      setReasonOpen(false);
      setDecided(false);
      setLeaving(null);
      setReturning(null);
    };
  }, []);

  // Depois de desfazer, o foco vai para o contador, que lê "Sugestão N de M: <título>".
  const counterRef = useRef<HTMLParagraphElement>(null);
  const [restored, setRestored] = useState(0);
  useEffect(() => {
    if (restored) counterRef.current?.focus();
  }, [restored]);

  /** Uma escolha nova substitui o aviso: só a última pode ser desfeita. */
  function decide(choice: Choice, reason?: ReasonCode) {
    setNotice(null);
    setDecided(true);
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
      // O card volta pelo lado de onde saiu. Se ele ainda estava saindo, a saída para ali.
      const restoredItem = state.items.find((candidate) => candidate.id === notice.id);
      setLeaving(null);
      if (restoredItem) setReturning({ key: notice.key, item: restoredItem, choice: notice.choice });
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

        {/* Antes de 1 s não aparece nada no meio, para a tela não piscar (#81).
            Depois da última escolha, o fim da faixa espera o último card terminar de sair. */}
        {state.status === "loading" ? null : item || leaving ? (
          <>
            {state.choiceFailed && (
              <p className={styles.error} role="alert">
                Não deu pra guardar. Tente de novo.
              </p>
            )}
            {item && (
              <p ref={counterRef} tabIndex={-1} className={styles.counter} aria-live="polite">
                Sugestão {position} de {total}
                <span className={styles.srOnly}>: {item.title}</span>
              </p>
            )}
            <Deck
              item={item}
              behind={Math.min(total - position, 2)}
              leaving={leaving}
              returning={returning?.item.id === item?.id ? returning : null}
              onLeft={() => setLeaving(null)}
            />
            <Actions
              disabled={state.pending || !item}
              onChoose={(choice) => {
                if (choice === "nao-e-pra-mim") setReasonOpen(true);
                else decide(choice);
              }}
            />
          </>
        ) : (
          <End title={title} empty={total === 0} takeFocus={decided} />
        )}
      </main>

      <ReasonSheet open={reasonOpen} onSubmit={sendReason} onCancel={() => setReasonOpen(false)} />
    </div>
  );
}

/** Um card em movimento: o que saiu com uma escolha, ou o que voltou com o "Desfazer". */
type CardMotion = { key: number; item: Suggestion; choice: Choice };

/**
 * Para onde o card sai em cada escolha, o mesmo lado do botão: "Não é pra mim" à esquerda,
 * "Quero fazer" à direita e "Talvez depois", no meio, para cima. Com o "Desfazer", ele volta
 * pelo mesmo lado. Vai no data-motion, que o CSS e os testes leem.
 */
const MOTION: Record<Choice, "esquerda" | "direita" | "cima"> = {
  "nao-e-pra-mim": "esquerda",
  "quero-fazer": "direita",
  "talvez-depois": "cima",
};

type DeckProps = {
  /** A sugestão à mostra; undefined quando o último card está saindo. */
  item: Suggestion | undefined;
  behind: number;
  leaving: CardMotion | null;
  /**
   * O "Desfazer" trouxe esta sugestão de volta; só vem quando é a que está à mostra. Fica até
   * a próxima escolha: trocar o data-motion depois faria a animação de chegada rodar de novo.
   */
  returning: CardMotion | null;
  onLeft: () => void;
};

/**
 * O card da sugestão com até dois cards tortos atrás, quando ainda há mais (Figma: Baralho).
 * O card que acabou de ser escolhido sai por cima dele, numa camada que o leitor de tela e o
 * teclado ignoram (aria-hidden e inert): para eles, a sugestão já é a próxima.
 */
function Deck({ item, behind, leaving, returning, onLeft }: DeckProps) {
  return (
    <div className={styles.deck}>
      {item && behind >= 2 && <div className={`${styles.backCard} ${styles.backLeft}`} aria-hidden="true" />}
      {item && behind >= 1 && <div className={`${styles.backCard} ${styles.backRight}`} aria-hidden="true" />}
      {item && (
        <div
          // A chave nova a cada sugestão faz o leitor de tela tratar o card como conteúdo novo,
          // e a animação de chegada roda de novo.
          key={item.id}
          className={styles.front}
          data-motion={returning ? `volta-${MOTION[returning.choice]}` : "chega"}
        >
          <SuggestionFace item={item} />
        </div>
      )}
      {leaving && (
        <div
          key={leaving.key}
          className={`${styles.leaving} ${item ? "" : styles.leavingLast}`}
          data-motion={`sai-${MOTION[leaving.choice]}`}
          aria-hidden="true"
          inert
          onAnimationEnd={(event) => {
            if (event.target === event.currentTarget) onLeft();
          }}
        >
          <SuggestionFace item={leaving.item} />
        </div>
      )}
    </div>
  );
}

function SuggestionFace({ item }: { item: Suggestion }) {
  return (
    <SuggestionCard
      kind={item.kind}
      title={item.title}
      source={item.source}
      reason={item.why}
      tags={
        <TagList>
          <Tag variant="chip">{item.format}</Tag>
          <Tag variant="chip">{item.duration}</Tag>
          {/* Custo e idade mínima podem faltar (as ações dos grupos não têm): sem eles, sem chip. */}
          {item.cost !== null && <Tag variant={item.cost === "Grátis" ? "pink" : "chip"}>{item.cost}</Tag>}
          {item.minAge !== null && (
            <Tag variant="chip">
              {item.minAge}+<span className={styles.srOnly}> anos</span>
            </Tag>
          )}
        </TagList>
      }
    />
  );
}

const ACTIONS: { choice: Choice; label: string; icon: IconName }[] = [
  { choice: "nao-e-pra-mim", label: "Não é pra mim", icon: "x" },
  { choice: "talvez-depois", label: "Talvez depois", icon: "bookmark" },
  { choice: "quero-fazer", label: "Quero fazer", icon: "plus" },
];

/**
 * Os três botões. Enquanto a escolha é guardada, ficam bloqueados com aria-disabled, e não com
 * disabled: um botão com disabled perde o foco, e quem usa o teclado voltaria para o começo da
 * página (como o "Desfazer" do Toast).
 */
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
            aria-disabled={disabled || undefined}
            onClick={() => {
              if (!disabled) onChoose(action.choice);
            }}
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
 * Depois da última sugestão (A06·2 · Sugestões acabaram, #166) ou faixa sem nenhuma.
 * Depois da última escolha, o foco vai para o título, porque os botões de escolha saíram da tela.
 * Se a página já abre aqui, o foco fica onde está.
 */
function End({ title, empty, takeFocus }: { title: string; empty: boolean; takeFocus: boolean }) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (takeFocus) titleRef.current?.focus();
  }, [takeFocus]);

  return (
    <div className={styles.end}>
      <EmptyDeck />
      <h2 ref={titleRef} tabIndex={-1} className={styles.endTitle}>
        {empty ? "Por enquanto, nada marcado." : `Você viu todas as sugestões de ${title}`}
      </h2>
      {!empty && <p className={styles.endText}>Por enquanto, é isso por aqui.</p>}
      <div className={styles.endActions}>
        <LinkButton href="/descobrir" className={styles.endAction}>
          Escolher outra categoria
        </LinkButton>
        <LinkButton href="/ver-depois" variant="secondary" className={`${styles.endAction} ${styles.endSecondary}`}>
          Ver o que salvei pra depois
        </LinkButton>
      </div>
    </div>
  );
}

/** Três cards tracejados, sem nada dentro (Figma: Card / Acabaram as sugestões · Ícone). */
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
