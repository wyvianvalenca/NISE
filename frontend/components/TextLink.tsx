import Link, { type LinkProps } from "next/link";
import type { ReactNode } from "react";
import { Icon } from "./Icon";
import styles from "./TextLink.module.css";

type TextLinkProps = LinkProps & {
  children: ReactNode;
  /** Mostra a seta "‹" antes do texto, como em "Etapa anterior". */
  back?: boolean;
  /** Abre em outra aba e mostra o ícone ↗, como em "Ler os termos completos". */
  external?: boolean;
  className?: string;
};

/** Link de texto teal com alvo de 44px (Figma: Link target / ...). */
export function TextLink({ children, back = false, external = false, className, ...rest }: TextLinkProps) {
  return (
    <Link
      {...rest}
      target={external ? "_blank" : undefined}
      rel={external ? "noopener noreferrer" : undefined}
      className={className ? `${styles.link} ${className}` : styles.link}
    >
      {back && <Icon name="left" />}
      {children}
      {external && <Icon name="external" />}
      {external && <span className={styles.srOnly}> (abre em outra aba)</span>}
    </Link>
  );
}
