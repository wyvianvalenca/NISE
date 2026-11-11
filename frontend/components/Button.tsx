import Link, { type LinkProps } from "next/link";
import type { ComponentProps, ReactNode } from "react";
import styles from "./Button.module.css";

type ButtonProps = ComponentProps<"button"> & {
  /** Mostra "Enviando…" e bloqueia o clique enquanto algo é salvo. */
  loading?: boolean;
  loadingLabel?: string;
  /** "primary": fundo escuro. "secondary": contorno, para a ação menos importante. */
  variant?: "primary" | "secondary";
  /** "sm": 44px de altura, para ações dentro de cartões ("+ Quero fazer"). */
  size?: "md" | "sm";
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
  size = "md",
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={[
        styles.button,
        styles[variant],
        size === "sm" && styles.sm,
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {loading ? loadingLabel : children}
    </button>
  );
}

type LinkButtonProps = LinkProps & {
  children: ReactNode;
  className?: string;
  variant?: "primary" | "secondary";
};

/**
 * A link wearing the `Button` look, for an action that is navigation
 * (Figma: Action / ...).
 *
 * It exists so a screen does not become a client component just for a
 * `router.push`, and so she can open it in another tab, like any link.
 */
export function LinkButton({
  className,
  variant = "primary",
  children,
  ...rest
}: LinkButtonProps) {
  return (
    <Link
      {...rest}
      className={[styles.button, styles[variant], className]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </Link>
  );
}
