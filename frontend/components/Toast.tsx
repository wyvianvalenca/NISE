import type { ReactNode } from "react";
import { Icon } from "./Icon";
import styles from "./Toast.module.css";

type ToastProps = {
  /** Texto do aviso; use <strong> na parte principal ("Ação salva."). */
  children: ReactNode;
  /** Ação opcional à direita, como "Desfazer". */
  action?: { label: string; onClick: () => void };
};

/**
 * Aviso escuro que confirma uma ação (Figma: Aviso / Ação salva, Aviso / Inscrita).
 * Quem usa decide onde ele aparece e quando some.
 */
export function Toast({ children, action }: ToastProps) {
  return (
    <div role="status" className={styles.toast}>
      <Icon name="check" className={styles.icon} />
      <p className={styles.text}>{children}</p>
      {action && (
        <button type="button" className={styles.action} onClick={action.onClick}>
          {action.label}
        </button>
      )}
    </div>
  );
}
