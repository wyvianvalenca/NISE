"use client";

// Card "Elas se veem na computação no futuro?" (#369, RF-F5.33). Só totais por
// grupo: nenhuma menina aparece (RN-04) e todo número vem com o n (RN-50).

import { ChartLegend, LineChart, type LineSeries } from "@/components/LineChart";
import {
  type FutureSelf,
  GROUP_LABELS,
  MILESTONE_LABELS,
  sharePercent,
} from "@/lib/resultados-future-self";
import styles from "./FutureSelfCard.module.css";

const COLORS = [
  "var(--nise-chart-1)",
  "var(--nise-chart-2)",
  "var(--nise-chart-3)",
  "var(--nise-muted)",
];

export function FutureSelfCard({ data }: { data: FutureSelf }) {
  const xLabels = data.lines[0]?.points.map((point) => MILESTONE_LABELS[point.milestone]) ?? [];

  const series: LineSeries[] = data.lines.map((line, index) => {
    const values = line.points.map(sharePercent);
    const last = [...values].reverse().find((value) => value !== null);
    return {
      label: GROUP_LABELS[line.group],
      color: COLORS[index % COLORS.length],
      dashed: line.group === "never",
      values,
      endLabel: last === undefined ? undefined : `${last}%`,
    };
  });

  return (
    <section className={styles.card} aria-labelledby="futuro">
      <h2 id="futuro" className={styles.title}>
        Elas se veem na computação no futuro?
      </h2>
      <p className={styles.description}>% que respondeu “Com certeza” · por participação</p>

      <ChartLegend
        items={series.map((line) => ({
          label: line.label,
          color: line.color,
          kind: line.dashed ? "dashed" : "line",
        }))}
      />
      <LineChart
        series={series}
        xLabels={xLabels}
        label="Porcentagem que respondeu Com certeza em cada marco, por grupo de participação"
      />

      <div className={styles.scroll}>
        <table className={styles.table}>
          <caption className={styles.caption}>Quantas responderam em cada marco</caption>
          <thead>
            <tr>
              <th scope="col">Grupo</th>
              {xLabels.map((label) => (
                <th key={label} scope="col">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.lines.map((line) => (
              <tr key={line.group}>
                <th scope="row">{GROUP_LABELS[line.group]}</th>
                {line.points.map((point) => {
                  const percent = sharePercent(point);
                  return (
                    <td key={point.milestone}>
                      {percent === null ? "—" : `${percent}%`}
                      <span className={styles.n}>{point.responses} resp.</span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className={styles.footnote}>
        Compare principalmente com “Não compareceram”: elas se inscreveram, então tinham interesse
        parecido. “Nunca participaram” chegaram sozinhas e já vêm mais motivadas. Comparação não
        prova causa.
      </p>
    </section>
  );
}
