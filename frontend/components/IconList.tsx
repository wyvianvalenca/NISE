import type { ReactNode } from "react";
import { Icon, type IconName } from "./Icon";
import styles from "./IconList.module.css";

export type IconListItem = {
  icon: IconName;
  /** Texto do item; use <strong> para destacar uma parte. */
  content: ReactNode;
};

type IconListProps = {
  items: IconListItem[];
};

/** Caixa com itens de ícone + texto (Figma: Lista, nas telas A04). */
export function IconList({ items }: IconListProps) {
  return (
    <ul className={styles.list}>
      {items.map((item, index) => (
        <li key={index} className={styles.item}>
          <Icon name={item.icon} className={styles.icon} />
          <span>{item.content}</span>
        </li>
      ))}
    </ul>
  );
}
