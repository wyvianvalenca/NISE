"use client";

// Card "Elas se veem na computação no futuro?" (#369, RF-F5.33). Só totais por
// grupo: nenhuma menina aparece (RN-04) e todo número vem com o n (RN-50).

import { CardTitle } from "@/components/CardHelp";
import { ChartLegend, LineChart, type LineSeries } from "@/components/LineChart";
import {
  type FutureSelf,
  GROUP_LABELS,
  MILESTONE_LABELS,
  type ParticipationGroup,
  sharePercent,
} from "@/lib/resultados-future-self";
import styles from "./FutureSelfCard.module.css";

// Cores e traços do Figma: os dois grupos de quem veio em linha contínua; quem
// não veio, tracejada; quem nunca participou, pontilhada.
const STYLE: Record<ParticipationGroup, Pick<LineSeries, "color" | "dash">> = {
  two_or_more: { color: "var(--nise-teal)" },
  one: { color: "var(--nise-pink)" },
  no_show: { color: "var(--nise-muted)", dash: "dashed" },
  never: { color: "var(--nise-muted)", dash: "dotted" },
};

export function FutureSelfCard({ data }: { data: FutureSelf }) {
  const milestones = data.lines[0]?.points.map((point) => point.milestone) ?? [];
  const xLabels = milestones.map((milestone) => MILESTONE_LABELS[milestone]);
  // Sob cada marco, quantas responderam nele, somando as quatro linhas.
  const xSubLabels = milestones.map((_, index) => {
    const responses = data.lines.reduce((sum, line) => sum + (line.points[index]?.responses ?? 0), 0);
    return `${responses} resp.`;
  });

  const series: LineSeries[] = data.lines.map((line) => ({
    label: GROUP_LABELS[line.group],
    ...STYLE[line.group],
    values: line.points.map(sharePercent),
  }));

  const summary = data.lines
    .map((line) => {
      const points = line.points
        .map((point) => {
          const percent = sharePercent(point);
          const value = percent === null ? "sem respostas" : `${percent}%`;
          return `${MILESTONE_LABELS[point.milestone]} ${value} (${point.responses} resp.)`;
        })
        .join(", ");
      return `${GROUP_LABELS[line.group]}, ${line.girls} meninas: ${points}`;
    })
    .join(". ");

  return (
    <section className={styles.card} aria-labelledby="futuro">
      <CardTitle
        id="futuro"
        className={styles.title}
        title="Elas se veem na computação no futuro?"
        help={
          <>
            <span>
              % que respondeu “Com certeza” · por participação · na legenda, quantas meninas há em
              cada linha
            </span>
            <span>
              Compare principalmente com “Não compareceram”: elas se inscreveram, então tinham
              interesse parecido. “Nunca participaram” chegaram sozinhas e já vêm mais motivadas.
              Comparação não prova causa.
            </span>
          </>
        }
      />

      <ChartLegend
        items={data.lines.map((line, index) => ({
          label: `${GROUP_LABELS[line.group]} · ${line.girls}${index === 0 ? " meninas" : ""}`,
          ...STYLE[line.group],
        }))}
      />
      <LineChart
        series={series}
        xLabels={xLabels}
        xSubLabels={xSubLabels}
        label={`Porcentagem que respondeu Com certeza em cada marco, por grupo de participação. ${summary}`}
      />

    </section>
  );
}
