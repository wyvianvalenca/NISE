import styles from "./FunnelChart.module.css";

export type FunnelStage = {
  label: string;
  value: number;
};

type FunnelChartProps = {
  stages: FunnelStage[];
  /** Nota embaixo da primeira etapa, ex.: "Das listas importadas". */
  firstNote?: string;
};

// Medidas do desenho (em unidades do viewBox), tiradas do Figma.
const STAGE_WIDTH = 192;
const GAP = 2;
const MAX_HEIGHT = 178;
const FUNNEL_COLORS = 6;

/**
 * Funil horizontal (Figma: Card / Do convite ao ingresso).
 * A altura de cada etapa é proporcional à raiz do valor, como no Figma;
 * assim as etapas pequenas continuam visíveis.
 * Embaixo, o percentual em relação à etapa anterior.
 */
export function FunnelChart({ stages, firstNote }: FunnelChartProps) {
  const max = Math.max(...stages.map((stage) => stage.value), 1);
  const heightOf = (value: number) => Math.sqrt(value / max) * MAX_HEIGHT;
  const width = stages.length * STAGE_WIDTH;
  const middle = MAX_HEIGHT / 2;

  const shapes = stages.map((stage, index) => {
    const left = heightOf(stage.value);
    const next = stages[index + 1];
    // A última etapa afina um pouco no fim, como no Figma.
    const right = next ? heightOf(next.value) : left * 0.75;
    const x0 = index * STAGE_WIDTH;
    const x1 = x0 + STAGE_WIDTH - GAP;
    const points = [
      [x0, middle - left / 2],
      [x1, middle - right / 2],
      [x1, middle + right / 2],
      [x0, middle + left / 2],
    ];
    // Espalha as cores do funil pelas etapas, da mais clara à mais escura.
    const colorIndex =
      stages.length === 1
        ? FUNNEL_COLORS
        : Math.round((index * (FUNNEL_COLORS - 1)) / (stages.length - 1)) + 1;
    return {
      points: points.map((point) => point.join(",")).join(" "),
      color: `var(--nise-funnel-${colorIndex})`,
    };
  });

  return (
    // Em telas estreitas o funil rola de lado em vez de espremer os números.
    <div className={styles.wrapper}>
      <div className={styles.funnel} style={{ gridTemplateColumns: `repeat(${stages.length}, 1fr)` }}>
        {stages.map((stage) => (
          <div key={stage.label} className={styles.head}>
            <span className={styles.value}>{stage.value}</span>
            <span className={styles.label}>{stage.label}</span>
          </div>
        ))}

        <svg
          className={styles.chart}
          viewBox={`0 0 ${width} ${MAX_HEIGHT}`}
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          {shapes.map((shape, index) => (
            <polygon key={stages[index].label} points={shape.points} fill={shape.color} />
          ))}
        </svg>

        {stages.map((stage, index) => {
          const previous = stages[index - 1];
          const note = previous
            ? `${previous.value ? Math.round((stage.value / previous.value) * 100) : 0}% da etapa anterior`
            : firstNote;
          return (
            <span key={stage.label} className={previous ? styles.rate : styles.firstNote}>
              {note}
            </span>
          );
        })}
      </div>
    </div>
  );
}
