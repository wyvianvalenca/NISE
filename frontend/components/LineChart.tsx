"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./LineChart.module.css";

export type LineSeries = {
  label: string;
  /** Cor da linha, ex.: "var(--nise-chart-1)". */
  color: string;
  /** Linha tracejada, como "Chegaram sozinhas". */
  dashed?: boolean;
  /** Um valor de 0 a 100 por etapa; null quando não há dado. */
  values: (number | null)[];
};

type LineChartProps = {
  series: LineSeries[];
  /** Rótulo de cada ponto no eixo de baixo, ex.: "1", "2"... */
  xLabels: string[];
  /** Índice da etapa destacada (coluna verde e número escuro). */
  highlighted?: number;
  /** Quando existe, os números do eixo viram botões. */
  onSelect?: (index: number) => void;
  /** Resumo do gráfico para leitor de tela. */
  label: string;
};

// Medidas do desenho em px. A largura acompanha o contêiner (ResizeObserver),
// assim os textos ficam sempre no tamanho do Figma, no celular e no computador.
const DEFAULT_WIDTH = 600;
const HEIGHT = 240;
const LEFT = 36;
const RIGHT = 16;
const TOP = 12;
const BOTTOM = 44;

/**
 * Gráfico de linhas em % (Figma: Gráfico de linhas, telas K07 Linhas).
 * Desenhado em SVG puro, sem biblioteca de gráficos.
 */
export function LineChart({ series, xLabels, highlighted, onSelect, label }: LineChartProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(DEFAULT_WIDTH);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      setWidth(Math.max(280, Math.round(entry.contentRect.width)));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const plotWidth = width - LEFT - RIGHT;
  const plotHeight = HEIGHT - TOP - BOTTOM;
  const step = xLabels.length > 1 ? plotWidth / (xLabels.length - 1) : 0;
  const x = (index: number) => LEFT + index * step;
  const y = (value: number) => TOP + plotHeight * (1 - value / 100);
  const axisY = HEIGHT - 20;

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

  return (
    <div ref={ref} className={styles.wrapper}>
      <svg className={styles.chart} viewBox={`0 0 ${width} ${HEIGHT}`} role="img" aria-label={label}>
        {highlighted !== undefined && (
          <rect
            x={x(highlighted) - 14}
            y={TOP - 6}
            width={28}
            height={plotHeight + 12}
            rx={8}
            className={styles.highlight}
          />
        )}

        {[0, 50, 100].map((tick) => (
          <g key={tick}>
            <line x1={LEFT} x2={width - RIGHT} y1={y(tick)} y2={y(tick)} className={styles.grid} />
            <text x={LEFT - 6} y={y(tick) + 3} className={styles.yLabel}>
              {tick}%
            </text>
          </g>
        ))}

        {series.map((line) => (
          <g key={line.label} style={{ color: line.color }}>
            <path
              d={pathOf(line.values)}
              className={styles.line}
              strokeDasharray={line.dashed ? "6 5" : undefined}
            />
            {line.values.map((value, index) =>
              value === null ? null : (
                <circle key={index} cx={x(index)} cy={y(value)} r={4} className={styles.dot} />
              ),
            )}
          </g>
        ))}

        {xLabels.map((text, index) => {
          const isHighlighted = index === highlighted;
          const select = onSelect ? () => onSelect(index) : undefined;
          return (
            <g
              key={text}
              className={onSelect ? styles.xButton : undefined}
              role={onSelect ? "button" : undefined}
              tabIndex={onSelect ? 0 : undefined}
              aria-label={onSelect ? `Ver detalhes da etapa ${text}` : undefined}
              aria-pressed={onSelect ? isHighlighted : undefined}
              onClick={select}
              onKeyDown={
                select
                  ? (event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        select();
                      }
                    }
                  : undefined
              }
            >
              <circle
                cx={x(index)}
                cy={axisY}
                r={10}
                className={isHighlighted ? styles.xCircleActive : styles.xCircle}
              />
              <text
                x={x(index)}
                y={axisY + 4}
                className={isHighlighted ? styles.xLabelActive : styles.xLabel}
              >
                {text}
              </text>
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
  /** "line" e "dashed" para linhas; "swatch" para faixas; "stripes" para "ainda não recebeu". */
  kind?: "line" | "dashed" | "swatch" | "stripes";
  /** Número pequeno ao lado, ex.: "Participantes 42". */
  count?: number;
};

/** Legenda dos gráficos (Figma: Legenda, Legenda / Participantes). */
export function ChartLegend({ items }: { items: LegendItem[] }) {
  return (
    <ul className={styles.legend}>
      {items.map((item) => (
        <li key={item.label} className={styles.legendItem}>
          {item.kind === "swatch" || item.kind === "stripes" ? (
            <span
              aria-hidden="true"
              className={item.kind === "stripes" ? styles.stripes : styles.swatch}
              style={item.kind === "swatch" ? { background: item.color } : undefined}
            />
          ) : (
            <svg width="22" height="10" aria-hidden="true" style={{ color: item.color }}>
              <line
                x1="1"
                x2="21"
                y1="5"
                y2="5"
                className={styles.legendLine}
                strokeDasharray={item.kind === "dashed" ? "3 2" : undefined}
              />
              <circle cx="11" cy="5" r="3" className={styles.legendDot} />
            </svg>
          )}
          <span>{item.label}</span>
          {item.count !== undefined && <span className={styles.legendCount}>{item.count}</span>}
        </li>
      ))}
    </ul>
  );
}
