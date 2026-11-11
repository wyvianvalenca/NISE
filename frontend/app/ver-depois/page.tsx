"use client";

// A06·2b · Ver depois: o que ela guardou com "Talvez depois", com filtro por faixa.
// Atende RF-F10.06 (issues #110 e #111). Usa os dados de teste de lib/ver-depois.ts
// até a sub-issue do back existir.

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { Avatar } from "@/components/Avatar";
import { BottomNav } from "@/components/BottomNav";
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

          {items ? (
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
          ) : (
            // Provisório: o esqueleto de carregamento das listas (nota "Estados da Alana") ainda não existe.
            <p className={styles.status}>Carregando…</p>
          )}

          <p className={styles.hint}>Toque em “Talvez depois” num cartão de sugestão pra guardar aqui.</p>

          <p className={styles.srOnly} aria-live="polite">
            {status}
          </p>
        </main>
      </div>

      <BottomNav active="ver-depois" />
    </div>
  );
}
