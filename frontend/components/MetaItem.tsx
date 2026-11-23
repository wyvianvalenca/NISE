import type { ReactNode } from "react";
import { Icon, type IconName } from "./Icon";
import styles from "./MetaItem.module.css";

type MetaItemProps = {
  icon: IconName;
  children: ReactNode;
};

/** Ícone + texto curto, ex.: "Presencial · Maceió" (Figma: Meta / ...). */
export function MetaItem({ icon, children }: MetaItemProps) {
  return (
    <span className={styles.meta}>
      <Icon name={icon} />
      {children}
    </span>
  );
}
