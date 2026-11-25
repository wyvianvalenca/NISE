"use client";

// Card "Busca nas listas de ingressantes" (#317, RF-F5.23). Só informa: não tem
// botão, porque a equipe roda a busca por script (D-71), e não mostra nome nem
// quantas meninas foram achadas (RN-24).

import { useEffect, useState } from "react";
import { Tag, TagList } from "@/components/Tag";
import {
  dayMonthLabel,
  getListSearch,
  type ListSearchResult,
  monthLabel,
} from "@/lib/ingressantes-api";
import styles from "./page.module.css";

export function SearchCard() {
  const [result, setResult] = useState<ListSearchResult | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    getListSearch(controller.signal)
      .then(setResult)
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          console.error(error instanceof Error ? error.name : "erro");
          setResult({ ok: false, reason: "failed" });
        }
      });
    return () => controller.abort();
  }, []);

  return (
    <section className={styles.search} aria-labelledby="busca-nas-listas">
      <h2 id="busca-nas-listas" className={styles.searchTitle}>
        Busca nas listas de ingressantes
      </h2>
      <p className={styles.searchText}>
        A NISE procura o nome das meninas do grupo nas listas públicas de aprovados em cursos de
        computação do estado.
      </p>
      <Content result={result} />
    </section>
  );
}

function Content({ result }: { result: ListSearchResult | null }) {
  if (result === null) {
    return <p className={styles.searchText}>Carregando…</p>;
  }
  if (!result.ok) {
    return (
      <p role="alert" className={styles.searchText}>
        Não foi possível carregar as datas da busca.
      </p>
    );
  }

  const { sources, lastSearchAt, nextSearchOn } = result.search;

  return (
    <>
      <TagList>
        {sources.map((source) => (
          <Tag key={source} variant="chip">
            {source}
          </Tag>
        ))}
      </TagList>
      {/* Sem busca ainda, a tela diz só isso (pergunta 2 da #317). */}
      <p className={styles.searchDates}>
        {lastSearchAt && nextSearchOn
          ? `Última busca: ${dayMonthLabel(lastSearchAt)} · próxima: ${monthLabel(nextSearchOn)}`
          : "Ainda não houve busca."}
      </p>
    </>
  );
}
