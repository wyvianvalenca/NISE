import type { ReactNode } from "react";
import { Brand } from "./Brand";
import styles from "./AppHeader.module.css";

type AppHeaderProps = {
  /** Conteúdo à direita, ex.: o link "Entrar". */
  children?: ReactNode;
};

/** Cabeçalho das telas da menina no celular (Figma: Header, 390×68). */
export function AppHeader({ children }: AppHeaderProps) {
  return (
    <header className={styles.header}>
      <Brand />
      {children}
    </header>
  );
}
