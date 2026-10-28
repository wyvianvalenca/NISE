import Link from "next/link";
import { Brand } from "./Brand";
import { Icon } from "./Icon";
import styles from "./CoordHeader.module.css";

// Rotas provisórias: ajustar quando as páginas da coordenadora existirem.
const SECTIONS = [
  { key: "visao-geral", label: "Visão geral", href: "/coordenacao" },
  { key: "acoes", label: "Ações", href: "/coordenacao/acoes" },
  { key: "acompanhamento", label: "Acompanhamento", href: "/coordenacao/acompanhamento" },
  { key: "relatorios", label: "Relatórios", href: "/coordenacao/relatorios" },
] as const;

export type CoordSection = (typeof SECTIONS)[number]["key"];

type CoordHeaderProps = {
  /** Seção da página atual; ganha o sublinhado teal. */
  active?: CoordSection;
  /** Nome do grupo da coordenadora, ex.: "Rendeiras do Código". */
  groupName: string;
  /** Inicial mostrada no círculo da conta. */
  accountInitial: string;
};

/** Cabeçalho do site da coordenadora (Figma: Header das telas K). */
export function CoordHeader({ active, groupName, accountInitial }: CoordHeaderProps) {
  return (
    <header className={styles.header}>
      <div className={styles.left}>
        <Brand />
        <nav aria-label="Seções" className={styles.nav}>
          {SECTIONS.map((section) => (
            <Link
              key={section.key}
              href={section.href}
              className={styles.navLink}
              aria-current={section.key === active ? "page" : undefined}
            >
              {section.label}
            </Link>
          ))}
        </nav>
      </div>
      <div className={styles.right}>
        <span className={styles.group}>
          <Icon name="users" />
          {groupName}
        </span>
        <span className={styles.account} aria-label="Sua conta">
          {accountInitial}
        </span>
      </div>
    </header>
  );
}
