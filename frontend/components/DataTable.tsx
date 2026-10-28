import type { ReactNode } from "react";
import styles from "./DataTable.module.css";

export type Column<T> = {
  key: string;
  header: string;
  /** Como mostrar a célula; recebe a linha inteira. */
  render: (row: T) => ReactNode;
  /** Largura fixa, ex.: "230px". Sem largura, a coluna ocupa o resto. */
  width?: string;
  align?: "left" | "right" | "center";
  /** Texto em destaque (escuro e médio), como a coluna Nome. */
  emphasis?: boolean;
};

type DataTableProps<T> = {
  columns: Column<T>[];
  rows: T[];
  /** Chave única de cada linha, ex.: o id. */
  rowKey: (row: T) => string;
  /** Descrição curta da tabela para leitor de tela. */
  caption: string;
};

/**
 * Tabela simples com divisórias (Figma: Tabela, Cabeçalho da tabela, Linha / ...).
 * Em telas estreitas a tabela rola de lado.
 */
export function DataTable<T>({ columns, rows, rowKey, caption }: DataTableProps<T>) {
  return (
    <div className={styles.wrapper}>
      <table className={styles.table}>
        <caption className={styles.caption}>{caption}</caption>
        <thead>
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                style={{ width: column.width, textAlign: column.align }}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={rowKey(row)}>
              {columns.map((column) => (
                <td
                  key={column.key}
                  className={column.emphasis ? styles.emphasis : undefined}
                  style={{ textAlign: column.align }}
                >
                  {column.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
