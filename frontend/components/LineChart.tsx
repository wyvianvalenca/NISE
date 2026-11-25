"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./LineChart.module.css";

export type LineSeries = {
  label: string;
  /** Cor da linha, ex.: "var(--nise-teal)". */
  color: string;
  /** Traço da linha; sem ele, contínua. */
  dash?: "dashed" | "dotted";
  /** Um valor de 0 a 100 por marco; null quando não há dado (lacuna, não zero). */
  values: (number | null)[];
};

type LineChartProps = {
  series: LineSeries[];
  /** Rótulo de cada marco no eixo de baixo, ex.: "Cadastro", "3 meses". */
  xLabels: string[];
  /** Linha menor sob cada rótulo, ex.: "40 resp.". */
  xSubLabels?: string[];
  /** Resumo do gráfico para leitor de tela. */
  label: string;
};

// Medidas do desenho em px. A largura acompanha o contêiner (ResizeObserver),
// assim os textos ficam sempre no tamanho do Figma, no celular e no computador.
const DEFAULT_WIDTH = 540;
const HEIGHT = 270;
const LEFT = 40;
const RIGHT = 16;
// Espaço à direita para o valor escrito no fim de cada linha.
const END_LABEL_SPACE = 44;
const TOP = 10;
const BOTTOM = 72;
const TICKS = [0, 20, 40, 60, 80, 100];
// Distância mínima, em px, entre dois valores do fim das linhas.
const END_LABEL_GAP = 14;
// Abaixo disto entre um marco e outro, o rótulo quebra em duas linhas ("12" / "meses").
const NARROW_STEP = 72;

const DASHES = { dashed: "6 5", dotted: "1 5" } as const;

/** O último valor de cada linha e onde escrevê-lo, sem sobrepor os outros. */
function endLabels(series: LineSeries[], y: (value: number) => number) {
  const ends = series
    .map((line, order) => {
      let index = line.values.length - 1;
      while (index >= 0 && line.values[index] === null) index -= 1;
      if (index < 0) return null;
      const value = line.values[index] as number;
      return { order, index, value, top: y(value) };
    })
    .filter((end): end is NonNullable<typeof end> => end !== null);

  // Só se afastam os que terminam no mesmo marco; de cima para baixo.
  const byColumn = new Map<number, typeof ends>();
  for (const end of ends) {
    byColumn.set(end.index, [...(byColumn.get(end.index) ?? []), end]);
  }
  for (const column of byColumn.values()) {
    column.sort((a, b) => a.top - b.top);
    for (let i = 1; i < column.length; i += 1) {
      column[i].top = Math.max(column[i].top, column[i - 1].top + END_LABEL_GAP);
    }
  }
  return ends;
}

/**
 * Gráfico de linhas em % (Figma C5: "Elas se veem na computação no futuro?").
 * Desenhado em SVG puro, sem biblioteca de gráficos.
 */
export function LineChart({ series, xLabels, xSubLabels, label }: LineChartProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(DEFAULT_WIDTH);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      setWidth(Math.max(260, Math.round(entry.contentRect.width)));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const right = RIGHT + END_LABEL_SPACE;
  const plotWidth = width - LEFT - right;
  const plotHeight = HEIGHT - TOP - BOTTOM;
  const step = xLabels.length > 1 ? plotWidth / (xLabels.length - 1) : 0;
  const narrow = step < NARROW_STEP;
  const x = (index: number) => LEFT + index * step;
  const y = (value: number) => TOP + plotHeight * (1 - value / 100);
  const axisY = TOP + plotHeight + 22;

  // Junta os pontos seguidos em trechos; um null quebra a linha.
  const pathOf = (values: (number | null)[]) => {
    let d = "";
    let drawing = false;
    values.forEach((value, index) => {
      if (value === null) {
        drawing = false;
        return;
      }
      d += `${drawing ? "L" : "M"}${x(index)},${y(value)} `;
      drawing = true;
    });
    return d.trim();
  };

  const ends = endLabels(series, y);

  return (
    <div ref={ref} className={styles.wrapper}>
      <svg className={styles.chart} viewBox={`0 0 ${width} ${HEIGHT}`} role="img" aria-label={label}>
        {TICKS.map((tick) => (
          <g key={tick}>
            <line x1={LEFT} x2={width - right} y1={y(tick)} y2={y(tick)} className={styles.grid} />
            <text x={0} y={y(tick) + 4} className={styles.yLabel}>
              {tick}%
            </text>
          </g>
        ))}

        {series.map((line) => (
          <g key={line.label} style={{ color: line.color }}>
            <path
              d={pathOf(line.values)}
              className={styles.line}
              strokeDasharray={line.dash ? DASHES[line.dash] : undefined}
              strokeLinecap={line.dash === "dotted" ? "round" : undefined}
            />
            {line.values.map((value, index) =>
              value === null ? null : (
                <circle key={index} cx={x(index)} cy={y(value)} r={4} className={styles.dot} />
              ),
            )}
          </g>
        ))}

        {/* O valor fica ao lado do último ponto da linha, mesmo que ela acabe antes. */}
        {ends.map((end) => (
          <text
            key={series[end.order].label}
            x={x(end.index) + 10}
            y={end.top + 4}
            className={styles.endLabel}
            style={{ color: series[end.order].color }}
          >
            {end.value}%
          </text>
        ))}

        {xLabels.map((text, index) => {
          const words = narrow && text.includes(" ") ? text.split(" ") : [text];
          const subY = axisY + 14 * words.length + 4;
          return (
            <g key={text}>
              <text x={x(index)} y={axisY} className={styles.xLabel}>
                {words.map((word, line) => (
                  <tspan key={word} x={x(index)} dy={line === 0 ? 0 : 14}>
                    {word}
                  </tspan>
                ))}
              </text>
              {xSubLabels?.[index] && (
                <text x={x(index)} y={subY} className={styles.xSubLabel}>
                  {(narrow ? xSubLabels[index].split(" ") : [xSubLabels[index]]).map(
                    (word, line) => (
                      <tspan key={word} x={x(index)} dy={line === 0 ? 0 : 12}>
                        {word}
                      </tspan>
                    ),
                  )}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

type LegendItem = {
  label: string;
  color: string;
  dash?: LineSeries["dash"];
};

/** Legenda das linhas (Figma C5: Legenda do card "Elas se veem…"). */
export function ChartLegend({ items }: { items: LegendItem[] }) {
  return (
    <ul className={styles.legend}>
      {items.map((item) => (
        <li key={item.label} className={styles.legendItem}>
          <svg width="20" height="10" aria-hidden="true" style={{ color: item.color }}>
            <line
              x1="1"
              x2="19"
              y1="5"
              y2="5"
              className={styles.legendLine}
              strokeDasharray={item.dash ? DASHES[item.dash] : undefined}
              strokeLinecap={item.dash === "dotted" ? "round" : undefined}
            />
          </svg>
          <span>{item.label}</span>
        </li>
      ))}
    </ul>
  );
}
