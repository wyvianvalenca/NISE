import type { ReactNode } from "react";
import { Icon, type IconName } from "./Icon";
import styles from "./Toast.module.css";

type ToastProps = {
  /** Texto do aviso; use <strong> na parte principal ("Ação salva."). */
  children: ReactNode;
  /** Ícone à esquerda; o padrão é o check. */
  icon?: IconName;
  /**
   * Ação opcional à direita, como "Desfazer". Com `busy`, o botão continua focável,
   * mas avisa que está ocupado; quem usa ignora os cliques nesse meio-tempo.
   */
  action?: { label: string; onClick: () => void; busy?: boolean };
};

/**
 * Aviso escuro que confirma uma ação (Figma: Aviso / Ação salva, Aviso / Inscrita).
 * Quem usa decide onde ele aparece e quando some.
 */
export function Toast({ children, icon = "check", action }: ToastProps) {
  return (
    <div role="status" className={styles.toast}>
      <Icon name={icon} className={styles.icon} />
      <p className={styles.text}>{children}</p>
      {action && (
        <button
          type="button"
          className={styles.action}
          aria-disabled={action.busy || undefined}
          onClick={action.onClick}
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
