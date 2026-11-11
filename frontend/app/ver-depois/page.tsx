"use client";

// A06·2b · Ver depois: o que ela guardou com "Talvez depois", com filtro por faixa.
// Atende RF-F10.06 (issues #110 e #111). Usa os dados de teste de lib/ver-depois.ts
// até a sub-issue do back existir.

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { Avatar } from "@/components/Avatar";
import { BottomNav } from "@/components/BottomNav";
import { LinkButton } from "@/components/Button";
import { Chip } from "@/components/Chip";
import { SavedItemCard } from "@/components/SavedItemCard";
import { BAND_CODES, BANDS, type BandCode } from "@/lib/descobrir";
import {
  deadlineLabel,
  getSavedItems,
  itemMeta,
  moveToFile,
  removeSaved,
  typeIcon,
  type SavedItem,
} from "@/lib/ver-depois";
import styles from "./page.module.css";

// O nome virá da sessão, como no Descobrir.
const FIRST_NAME = "Alana";

type Filter = BandCode | "todos";

export default function SavedForLaterPage() {
  const [items, setItems] = useState<SavedItem[] | null>(null);
  const [filter, setFilter] = useState<Filter>("todos");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const titleRef = useRef<HTMLHeadingElement>(null);
  const wantButtons = useRef(new Map<string, HTMLButtonElement>());
  // Item que recebe o foco depois que outro sai da lista.
  const focusNext = useRef<string | null>(null);

  useEffect(() => {
    let current = true;
    getSavedItems().then((result) => {
      if (current) setItems(result);
    });
    return () => {
      current = false;
    };
  }, []);

  const visible = items?.filter((item) => filter === "todos" || item.band === filter) ?? [];

  // Quando um cartão sai, o foco vai para o próximo (ou para o título, se a lista esvaziou),
  // para quem usa teclado não voltar ao começo da página.
  useEffect(() => {
    if (focusNext.current === null) return;
    const target = focusNext.current ? wantButtons.current.get(focusNext.current) : null;
    (target ?? titleRef.current)?.focus();
    focusNext.current = null;
  }, [items]);

  async function decide(item: SavedItem, action: "want" | "remove") {
    setBusyId(item.id);
    if (action === "want") {
      await moveToFile(item.id);
    } else {
      await removeSaved(item.id);
    }
    const index = visible.findIndex((other) => other.id === item.id);
    const next = visible[index + 1] ?? visible[index - 1];
    focusNext.current = next ? next.id : "";
    setItems((list) => list?.filter((other) => other.id !== item.id) ?? null);
    setBusyId(null);
    setStatus(
      action === "want" ? `${item.title} foi pro seu filé.` : `${item.title} saiu do Ver depois.`,
    );
  }

  return (
    <div className={styles.page}>
      <AppHeader>
        {/* O perfil ainda não existe; por enquanto o link dá 404. */}
        <Link href="/perfil" className={styles.profile} aria-label="Seu perfil">
          <Avatar name={FIRST_NAME} size={36} />
        </Link>
      </AppHeader>

      <div className={styles.scroll}>
        <main className={styles.main}>
          <h1 ref={titleRef} tabIndex={-1} className={styles.title}>
            Ver depois
          </h1>
          <p className={styles.subtitle}>O que você guardou pra decidir com calma.</p>

          {!items ? (
            // Provisório: o esqueleto de carregamento das listas (nota "Estados da Alana") ainda não existe.
            <p className={styles.status}>Carregando…</p>
          ) : items.length === 0 ? (
            <EmptySaved />
          ) : (
            <>
              <div role="group" aria-label="Filtrar por faixa" className={styles.filters}>
                <Chip variant="filter" size="lg" selected={filter === "todos"} onClick={() => setFilter("todos")}>
                  Todos
                </Chip>
                {BAND_CODES.map((code) => (
                  <Chip
                    key={code}
                    variant="filter"
                    size="lg"
                    selected={filter === code}
                    onClick={() => setFilter(code)}
                  >
                    {BANDS[code].title}
                  </Chip>
                ))}
              </div>

              <ul className={styles.list}>
                {visible.map((item) => (
                  <li key={item.id}>
                    <SavedItemCard
                      icon={typeIcon(item.type)}
                      tone={item.kind === "evento" ? "pink" : "teal"}
                      meta={itemMeta(item)}
                      title={item.title}
                      details={item.details}
                      deadline={item.deadline && deadlineLabel(item.deadline)}
                      busy={busyId === item.id}
                      onWant={() => decide(item, "want")}
                      onRemove={() => decide(item, "remove")}
                      wantRef={(button) => {
                        if (button) wantButtons.current.set(item.id, button);
                        else wantButtons.current.delete(item.id);
                      }}
                    />
                  </li>
                ))}
              </ul>

              <p className={styles.hint}>Toque em “Talvez depois” num cartão de sugestão pra guardar aqui.</p>
            </>
          )}

          <p className={styles.srOnly} aria-live="polite">
            {status}
          </p>
        </main>
      </div>

      <BottomNav active="ver-depois" />
    </div>
  );
}

/** V01 · Ver depois vazio (#167): nada guardado ainda, sem filtros nem dica. */
function EmptySaved() {
  return (
    <section className={styles.empty} aria-labelledby="ver-depois-vazio">
      <SymbolOutline />
      <h2 id="ver-depois-vazio" className={styles.emptyTitle}>
        Nada guardado por enquanto
      </h2>
      <p className={styles.emptyText}>
        Quando uma sugestão parecer legal mas não for a hora, toque em “Talvez depois” e ela fica aqui.
      </p>
      <LinkButton href="/descobrir" variant="secondary" className={styles.emptyAction}>
        Ver sugestões
      </LinkButton>
    </section>
  );
}

// O símbolo da NISE só no contorno, com o centro cheio (Figma: Ilustração / Filé do V01).
const SYMBOL_CELLS = [
  [2, 0],
  [1, 1], [2, 1], [3, 1],
  [0, 2], [1, 2], [3, 2], [4, 2],
  [1, 3], [2, 3], [3, 3],
  [2, 4],
];

function SymbolOutline() {
  return (
    <svg width="84" height="84" viewBox="0 0 84 84" fill="none" aria-hidden="true" className={styles.emptyArt}>
      {SYMBOL_CELLS.map(([col, row]) => (
        <rect key={`${col}-${row}`} x={2.5 + col * 16} y={2.5 + row * 16} width="11" height="11" stroke="currentColor" strokeDasharray="3 2" />
      ))}
      <rect x="34" y="34" width="12" height="12" fill="var(--nise-ink)" />
      <rect x="66" y="66" width="11" height="11" fill="var(--nise-pink)" transform="rotate(15 71.5 71.5)" />
    </svg>
  );
}
