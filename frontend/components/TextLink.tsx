import Link, { type LinkProps } from "next/link";
import type { ReactNode } from "react";
import { Icon } from "./Icon";
import styles from "./TextLink.module.css";

type TextLinkProps = LinkProps & {
  children: ReactNode;
  /** Mostra a seta "‹" antes do texto, como em "Etapa anterior". */
  back?: boolean;
  className?: string;
};

/** Link de texto teal com alvo de 44px (Figma: Link target / ...). */
export function TextLink({ children, back = false, className, ...rest }: TextLinkProps) {
  return (
    <Link {...rest} className={className ? `${styles.link} ${className}` : styles.link}>
      {back && <Icon name="left" />}
      {children}
    </Link>
  );
}
