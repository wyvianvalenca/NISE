"use client";

// Filtros e card "Logo depois da ação" (#367, RF-F5.06, RF-F5.09). Só totais:
// nenhum nome de menina chega a esta tela (RF-F5.08, RN-50).

import { type ReactNode, useEffect, useState } from "react";
import { Button } from "@/components/Button";
import { Loading } from "@/components/Loading";
import { Select } from "@/components/Select";
import { ACTION_TOPICS, ACTION_TYPES } from "@/lib/action-form";
import {
  type ActionOption,
  type AfterActionResult,
  DEFAULT_FILTERS,
  fraction,
  getActionOptions,
  getAfterAction,
  PERIODS,
  percentLabel,
  type ResultsFilters,
} from "@/lib/resultados-api";
import styles from "./page.module.css";

export const FAILURE_TEXT: Record<Exclude<AfterActionResult, { ok: true }>["reason"], string> = {
  signed_out: "Sua sessão acabou. Entre de novo para ver os resultados.",
  forbidden: "Os resultados são só para a coordenação de um grupo.",
  several_groups: "Você coordena mais de um grupo, e esta tela ainda mostra um só.",
  failed: "Não foi possível carregar os resultados. Tente novamente.",
};

/** `below` desenha os cards seguintes, que usam os mesmos filtros. */
export function AfterActionResults({ below }: { below?: (filters: ResultsFilters) => ReactNode }) {
  const [filters, setFilters] = useState<ResultsFilters>(DEFAULT_FILTERS);
  const [actions, setActions] = useState<ActionOption[]>([]);
  const [result, setResult] = useState<AfterActionResult | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    getActionOptions(controller.signal)
      .then(setActions)
      // Sem a lista, o filtro fica só com "Todas as ações".
      .catch(() => {});
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    getAfterAction(filters, controller.signal)
      .then(setResult)
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          console.error(error instanceof Error ? error.name : "erro");
          setResult({ ok: false, reason: "failed" });
        }
      });
    return () => controller.abort();
  }, [filters, attempt]);

  function change(next: Partial<ResultsFilters>) {
    setResult(null);
    setFilters((current) => ({ ...current, ...next }));
  }

  return (
    <>
      <div className={styles.filters}>
        <Select
          label="Período"
          value={filters.period}
          onChange={(event) => change({ period: event.target.value as ResultsFilters["period"] })}
        >
          {PERIODS.map((period) => (
            <option key={period.value} value={period.value}>
              {period.label}
            </option>
          ))}
        </Select>
        <Select
          label="Ação"
          value={filters.actionId}
          onChange={(event) => change({ actionId: event.target.value })}
        >
          <option value="">Todas as ações</option>
          {actions.map((action) => (
            <option key={action.id} value={String(action.id)}>
              {action.name}
            </option>
          ))}
        </Select>
        <Select
          label="Tipo"
          value={filters.type}
          onChange={(event) => change({ type: event.target.value as ResultsFilters["type"] })}
        >
          <option value="">Todos os tipos</option>
          {ACTION_TYPES.map((type) => (
            <option key={type.value} value={type.value}>
              {type.label}
            </option>
          ))}
        </Select>
        <Select
          label="Tags"
          className={styles.wideFilter}
          value={filters.topic}
          onChange={(event) => change({ topic: event.target.value as ResultsFilters["topic"] })}
        >
          <option value="">Todas as tags</option>
          {ACTION_TOPICS.map((topic) => (
            <option key={topic.code} value={topic.code}>
              {topic.label}
            </option>
          ))}
        </Select>
        <button type="button" className={styles.clear} onClick={() => change(DEFAULT_FILTERS)}>
          Limpar filtros
        </button>
      </div>

      <section className={styles.card} aria-labelledby="logo-depois">
        <h2 id="logo-depois" className={styles.cardTitle}>
          Logo depois da ação
        </h2>
        <p className={styles.description}>
          Quem participou das ações do período · comparado com quem se inscreveu e não compareceu
        </p>

        {result === null && <Loading label="Carregando os resultados…" />}

        {result !== null && !result.ok && (
          <div className={styles.failure}>
            <p role="alert">{FAILURE_TEXT[result.reason]}</p>
            {result.reason === "failed" && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setResult(null);
                  setAttempt((count) => count + 1);
                }}
              >
                Tentar novamente
              </Button>
            )}
          </div>
        )}

        {result?.ok && (
          <div className={styles.indicators}>
            <Indicator
              title="Voltaram a outra ação"
              participants={result.numbers.participants}
              noShows={result.numbers.noShows}
              didIt={result.numbers.returned}
            />
            <Indicator
              title="Começaram o filé"
              participants={result.numbers.participants}
              noShows={result.numbers.noShows}
              didIt={result.numbers.startedFile}
            />
            <Indicator
              title="Concluíram algo do filé"
              participants={result.numbers.participants}
              noShows={result.numbers.noShows}
              didIt={result.numbers.concludedFile}
            />
          </div>
        )}

        <p className={styles.footnote}>
          “Voltaram a outra ação” conta qualquer ação de qualquer grupo da NISE. O filé mostra se o
          incentivo continuou logo depois do evento, antes do primeiro questionário.
        </p>
      </section>

      {below?.(filters)}
    </>
  );
}

type IndicatorProps = {
  title: string;
  /** Quantas participaram e quantas não compareceram: o "de M" de cada lado. */
  participants: number;
  noShows: number;
  /** Quantas de cada lado fizeram o que o indicador conta. */
  didIt: { participants: number; noShows: number };
};

/** Um dos números do card: porcentagem, "N de M participantes", barra e a comparação. */
function Indicator({ title, participants, noShows, didIt }: IndicatorProps) {
  return (
    <div className={styles.indicator}>
      <h3 className={styles.indicatorTitle}>{title}</h3>
      <p className={styles.percent}>{percentLabel(didIt.participants, participants)}</p>
      <p className={styles.count}>
        {didIt.participants} de {participants} participantes
      </p>
      <span className={styles.track} aria-hidden="true">
        <span
          className={styles.fill}
          style={{ width: `${fraction(didIt.participants, participants) * 100}%` }}
        />
      </span>
      <p className={styles.compare}>
        Não compareceram: {percentLabel(didIt.noShows, noShows)} ({didIt.noShows} de {noShows})
      </p>
    </div>
  );
}
