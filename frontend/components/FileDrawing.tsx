"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { START_CELL, fileSquares, themeOf, type Cell, type FileData, type FileSquareData } from "@/lib/file";
import styles from "./FileDrawing.module.css";

// Grade 7×7 do Figma: casas de 40px a cada 46px, num quadro de 322px.
const STEP = 46;
const SIZE = 40;
const BOARD = 322;

function origin([column, row]: Cell) {
  return { x: column * STEP, y: row * STEP };
}

function countText(count: number, one: string, many: string) {
  return `${count} ${count === 1 ? one : many}`;
}

/** Nada é novo: o padrão, para a primeira visita. */
const NOTHING_NEW: ReadonlySet<string> = new Set();

type FileDrawingProps = {
  data: FileData;
  /**
   * Ids dos quadradinhos que entraram desde a versão que estava na tela: eles desenham a
   * borda, um depois do outro. Os outros só deslizam se a casa deles mudou.
   */
  fresh?: ReadonlySet<string>;
};

/**
 * O desenho do filé (Figma: Filé da trilha, A06·3). Cada item é um quadradinho:
 * concluído pinta com a cor do tema, em andamento tem metade teal, próxima aventura
 * tem borda teal e a casa vazia é tracejada. O centro é "Seu começo".
 * As formas mudam com o status, então a informação não depende só da cor (RNF-G.02).
 *
 * Passar o mouse num quadradinho, ou tocar nele, mostra o nome do item num balãozinho.
 * O balãozinho é só visual: o leitor de tela lê o resumo do desenho e a lista abaixo,
 * que tem os mesmos nomes.
 */
export function FileDrawing({ data, fresh = NOTHING_NEW }: FileDrawingProps) {
  const start = origin(START_CELL);
  const label =
    `Seu filé: ${countText(data.done.length, "concluído", "concluídos")}, ` +
    `${countText(data.inProgress.length, "em andamento", "em andamento")} e ` +
    `${countText(data.next.length, "próxima aventura", "próximas aventuras")}.`;

  const cells = fileSquares(data);
  const [active, setActive] = useState<string | null>(null);
  const activeCell = cells.find(({ square }) => square?.id === active);

  // Um toque fora de um quadradinho, ou o Esc, fecha o balãozinho.
  useEffect(() => {
    if (active === null) return;
    function closeOutside(event: PointerEvent) {
      if (!(event.target instanceof Element) || !event.target.closest("[data-square]")) setActive(null);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setActive(null);
    }
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [active]);

  // A ordem em que os quadradinhos novos desenham a borda.
  let freshOrder = 0;

  return (
    <div className={styles.frame}>
      <div className={styles.board}>
        <svg viewBox={`0 0 ${BOARD} ${BOARD}`} className={styles.drawing} role="img" aria-label={label}>
          <rect x={start.x} y={start.y} width={SIZE} height={SIZE} fill="var(--nise-ink)" />
          {cells.map(({ cell, square }) => {
            const { x, y } = origin(cell);

            if (!square) {
              return (
                <rect
                  key={cell.join("-")}
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

            const isFresh = fresh.has(square.id);
            const style = {
              transform: `translate(${x}px, ${y}px)`,
              "--fresh-delay": isFresh ? `${freshOrder++ * 120}ms` : undefined,
            } as CSSProperties;

            return (
              // A chave é o item, não a casa: quando um quadradinho novo entra no meio, os
              // outros deslizam para a casa nova em vez de trocar de lugar de repente.
              <g
                key={square.id}
                className={`${styles.square} ${isFresh ? styles.fresh : ""}`}
                style={style}
                data-square={square.id}
                data-fresh={isFresh || undefined}
                onPointerEnter={(event) => {
                  if (event.pointerType === "mouse") setActive(square.id);
                }}
                onPointerLeave={(event) => {
                  if (event.pointerType === "mouse") setActive(null);
                }}
                // No toque não há hover: um toque abre o balãozinho e outro, fecha. No mouse, o
                // hover já abriu; o clique só o mantém aberto.
                onClick={(event) => {
                  if ((event.nativeEvent as PointerEvent).pointerType === "mouse") setActive(square.id);
                  else setActive((current) => (current === square.id ? null : square.id));
                }}
              >
                <Square square={square} />
              </g>
            );
          })}
        </svg>

        {activeCell?.square && (
          <Tooltip cell={activeCell.cell} title={activeCell.square.title} />
        )}
      </div>
    </div>
  );
}

/** O quadradinho, desenhado a partir do canto da casa (o <g> leva até ela). */
function Square({ square }: { square: FileSquareData }) {
  if (square.status === "concluido") {
    return <rect className={styles.solid} width={SIZE} height={SIZE} fill={themeOf(square.theme).color} />;
  }

  return (
    <>
      <rect className={styles.fill} x={1.5} y={1.5} width={SIZE - 3} height={SIZE - 3} fill="var(--nise-surface)" />
      {square.status === "em-andamento" && (
        <path className={styles.fill} d={`M0 ${SIZE}L${SIZE} 0V${SIZE}H0Z`} fill="var(--nise-teal)" />
      )}
      <rect
        className={styles.border}
        x={1.5}
        y={1.5}
        width={SIZE - 3}
        height={SIZE - 3}
        fill="none"
        stroke="var(--nise-teal)"
        strokeWidth={3}
        // Com pathLength 1, a animação desenha a borda de 0 a 1, qualquer que seja o tamanho.
        pathLength={1}
      />
    </>
  );
}

/**
 * O balãozinho com o nome do item, logo acima do quadradinho. Nas duas colunas de cada
 * ponta ele se alinha pela borda, para não sair da tela de 360px.
 */
function Tooltip({ cell, title }: { cell: Cell; title: string }) {
  const { x, y } = origin(cell);
  const [column] = cell;
  const align = column <= 1 ? styles.alignStart : column >= 5 ? styles.alignEnd : "";
  const anchor = column <= 1 ? x : column >= 5 ? x + SIZE : x + SIZE / 2;

  return (
    <p
      className={`${styles.tooltip} ${align}`}
      style={{ left: `${(anchor / BOARD) * 100}%`, top: `${(y / BOARD) * 100}%` }}
      aria-hidden="true"
      data-testid="file-tooltip"
    >
      {title}
    </p>
  );
}
