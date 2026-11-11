import { START_CELL, THEMES, fileSquares, type Cell, type FileData } from "@/lib/file";
import styles from "./FileDrawing.module.css";

// Grade 7×7 do Figma: casas de 40px a cada 46px, num quadro de 322px.
const STEP = 46;
const SIZE = 40;

function origin([column, row]: Cell) {
  return { x: column * STEP, y: row * STEP };
}

function countText(count: number, one: string, many: string) {
  return `${count} ${count === 1 ? one : many}`;
}

/**
 * O desenho do filé (Figma: Filé da trilha, A06·3). Cada item é um quadradinho:
 * concluído pinta com a cor do tema, em andamento tem metade teal, próxima aventura
 * tem borda teal e a casa vazia é tracejada. O centro é "Seu começo".
 * As formas mudam com o status, então a informação não depende só da cor (RNF-G.02).
 */
export function FileDrawing({ data }: { data: FileData }) {
  const start = origin(START_CELL);
  const label =
    `Seu filé: ${countText(data.done.length, "concluído", "concluídos")}, ` +
    `${countText(data.inProgress.length, "em andamento", "em andamento")} e ` +
    `${countText(data.next.length, "próxima aventura", "próximas aventuras")}.`;

  return (
    <div className={styles.frame}>
      <svg viewBox="0 0 322 322" className={styles.drawing} role="img" aria-label={label}>
        <rect x={start.x} y={start.y} width={SIZE} height={SIZE} fill="var(--nise-ink)" />
        {fileSquares(data).map(({ cell, item }) => {
          const { x, y } = origin(cell);
          const key = cell.join("-");

          if (!item) {
            return (
              <rect
                key={key}
                x={x + 1}
                y={y + 1}
                width={SIZE - 2}
                height={SIZE - 2}
                fill="none"
                stroke="var(--nise-fileEmpty)"
                strokeDasharray="3 3"
              />
            );
          }

          if (item.status === "concluido") {
            return <rect key={key} x={x} y={y} width={SIZE} height={SIZE} fill={THEMES[item.theme].color} />;
          }

          return (
            <g key={key}>
              <rect
                x={x + 1.5}
                y={y + 1.5}
                width={SIZE - 3}
                height={SIZE - 3}
                fill="var(--nise-surface)"
                stroke="var(--nise-teal)"
                strokeWidth={3}
              />
              {item.status === "em-andamento" && (
                <path d={`M${x} ${y + SIZE}L${x + SIZE} ${y}V${y + SIZE}H${x}Z`} fill="var(--nise-teal)" />
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
