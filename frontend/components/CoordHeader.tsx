import Link from "next/link";
import { Brand } from "./Brand";
import { Icon } from "./Icon";
import styles from "./CoordHeader.module.css";

/**
 * Top menu sections (RF-F30.17). Only the ones with an `href` have a screen
 * yet; the rest render as tabs that go nowhere, so nothing leads to a 404.
 * Add the `href` of each one when its screen lands.
 */
const SECTIONS = [
  { key: "acoes", label: "Ações", href: "/coordenacao/acoes" },
  { key: "resultados", label: "Resultados", href: "/coordenacao/resultados" },
  { key: "ingressantes", label: "Ingressantes", href: "/coordenacao/ingressantes" },
  { key: "relatorios", label: "Relatórios" },
  { key: "exportar", label: "Exportar", href: "/coordenacao/exportar" },
] as const satisfies readonly { key: string; label: string; href?: string }[];

export type CoordSection = (typeof SECTIONS)[number]["key"];

type CoordHeaderProps = {
  /** Section of the current page; gets the teal underline. */
  active?: CoordSection;
  /** Name of the coordinator's group, e.g. "Rendeiras do Código". */
  groupName: string;
  /** Initial shown in the account circle. */
  accountInitial: string;
};

/** Coordinator site header (Figma: Header of the K screens). */
export function CoordHeader({ active, groupName, accountInitial }: CoordHeaderProps) {
  return (
    <header className={styles.header}>
      <div className={styles.left}>
        <Brand />
        <nav aria-label="Seções" className={styles.nav}>
          {SECTIONS.map((section) =>
            "href" in section ? (
              <Link
                key={section.key}
                href={section.href}
                className={styles.navLink}
                aria-current={section.key === active ? "page" : undefined}
              >
                {section.label}
              </Link>
            ) : (
              <span
                key={section.key}
                role="link"
                aria-disabled="true"
                className={styles.navLink}
              >
                {section.label}
              </span>
            ),
          )}
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
