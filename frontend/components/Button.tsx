import type { ButtonHTMLAttributes } from "react";
import styles from "./Button.module.css";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  /** Mostra "Enviando…" e bloqueia o clique enquanto algo é salvo. */
  loading?: boolean;
  loadingLabel?: string;
  /** "primary": fundo escuro. "secondary": contorno, para a ação menos importante. */
  variant?: "primary" | "secondary";
};

/**
 * Botão principal (Figma: NISE/Button).
 * Estados: padrão, hover (teal), foco (borda rosa), carregando e desabilitado.
 * A variante "secondary" é o "Agora não" / "Adicionar e incluir outra" dos painéis.
 */
export function Button({
  loading = false,
  loadingLabel = "Enviando…",
  disabled,
  className,
  children,
  type = "button",
  variant = "primary",
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={[styles.button, styles[variant], className].filter(Boolean).join(" ")}
    >
      {loading ? loadingLabel : children}
    </button>
  );
}
