"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  NO_CHANGES,
  START_CELL,
  fileSquares,
  themeOf,
  type Cell,
  type FileChanges,
  type FileData,
  type FileSquareData,
} from "@/lib/file";
import styles from "./FileDrawing.module.css";
import { LEAVE_MS, playFileChanges } from "./fileMotion";

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

type FileDrawingProps = {
  data: FileData;
  /**
   * O que mudou desde a versão que estava na tela (lib/file.ts, fileChanges): o que
   * entrou desenha a borda, o que andou se preenche e o que saiu faz o caminho de volta.
   * Os outros só deslizam se a casa deles mudou.
   */
  changes?: FileChanges;
  /** Chamado quando um quadradinho removido termina de sair. */
  onRemoved?: (id: string) => void;
  /** Chamado quando um quadradinho novo ou que andou termina de se animar. */
  onSettled?: (id: string) => void;
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
export function FileDrawing({ data, changes = NO_CHANGES, onRemoved, onSettled }: FileDrawingProps) {
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

  // Cada rodada de mudanças se anima uma vez só (components/fileMotion.ts). Os efeitos rodam
  // de novo quando o Next mostra a tela escondida; a rodada já animada não se repete.
  const svg = useRef<SVGSVGElement>(null);
  const played = useRef(0);
  useLayoutEffect(() => {
    if (!svg.current || changes.round === 0 || played.current === changes.round) return;
    played.current = changes.round;
    playFileChanges(svg.current, changes, {
      onSettled: (id) => onSettled?.(id),
      onRemoved: (id) => onRemoved?.(id),
    });
  }, [changes, onSettled, onRemoved]);

  // Com algum quadradinho saindo, os outros esperam ele sair para deslizar.
  const slideDelay = changes.removed.length > 0 ? `${LEAVE_MS}ms` : "0ms";

  return (
    <div className={styles.frame}>
      <div className={styles.board}>
        <svg ref={svg} viewBox={`0 0 ${BOARD} ${BOARD}`} className={styles.drawing} role="img" aria-label={label}>
          <rect x={start.x} y={start.y} width={SIZE} height={SIZE} fill="var(--nise-ink)" />
          {/* As casas vazias vão por baixo, para não passarem por cima de um quadradinho que
              ainda está deslizando para a casa nova. */}
          {cells.map(({ cell, square }) => {
            if (square) return null;
            const { x, y } = origin(cell);
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
          })}
          {cells.map(({ cell, square }) => {
            if (!square) return null;
            const { x, y } = origin(cell);

            const isFresh = changes.fresh.has(square.id);
            const isFilled = changes.filled.has(square.id);
            const style = { transform: `translate(${x}px, ${y}px)`, transitionDelay: slideDelay };

            return (
              // A chave é o item, não a casa: quando um quadradinho novo entra no meio, os
              // outros deslizam para a casa nova em vez de trocar de lugar de repente.
              <g
                key={square.id}
                className={styles.square}
                style={style}
                data-square={square.id}
                data-fresh={isFresh || undefined}
                data-filled={isFilled || undefined}
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

          {/* Os que saíram ficam na casa antiga só enquanto fazem o caminho de volta. */}
          {changes.removed.map(({ cell, square }) => {
            const { x, y } = origin(cell);
            return (
              <g
                key={`saindo-${square.id}`}
                className={`${styles.square} ${styles.leaving}`}
                style={{ transform: `translate(${x}px, ${y}px)` }}
                data-leaving={square.id}
                aria-hidden="true"
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
    return (
      <rect className={styles.solid} data-part="solid" width={SIZE} height={SIZE} fill={themeOf(square.theme).color} />
    );
  }

  return (
    <>
      <rect data-part="fill" x={1.5} y={1.5} width={SIZE - 3} height={SIZE - 3} fill="var(--nise-surface)" />
      {square.status === "em-andamento" && (
        <path className={styles.half} data-part="half" d={`M0 ${SIZE}L${SIZE} 0V${SIZE}H0Z`} fill="var(--nise-teal)" />
      )}
      <rect
        data-part="border"
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
