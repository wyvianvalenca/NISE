"use client";

import Link from "next/link";
import { useCoordinator } from "@/lib/coordinator";
import { AccountMenu } from "./AccountMenu";
import { Brand } from "./Brand";
import { Icon } from "./Icon";
import styles from "./CoordHeader.module.css";

/**
 * Top menu sections (RF-F30.17: Ações, Resultados, Ingressantes and Exportar).
 * Only the ones with an `href` have a screen yet; the rest would render as tabs
 * that go nowhere, so nothing leads to a 404. Add the `href` of each one when
 * its screen lands (all four have one now).
 */
const SECTIONS = [
  { key: "acoes", label: "Ações", href: "/coordenacao/acoes" },
  { key: "resultados", label: "Resultados", href: "/coordenacao/resultados" },
  { key: "ingressantes", label: "Ingressantes", href: "/coordenacao/ingressantes" },
  { key: "exportar", label: "Exportar", href: "/coordenacao/exportar" },
] as const satisfies readonly { key: string; label: string; href?: string }[];

/** The same list, typed so a section without `href` still compiles. */
const SECTION_LIST: readonly { key: string; label: string; href?: string }[] = SECTIONS;

export type CoordSection = (typeof SECTIONS)[number]["key"];

type CoordHeaderProps = {
  /** Section of the current page; gets the teal underline. */
  active?: CoordSection;
};

/**
 * Coordinator site header (Figma: Header of the K screens).
 *
 * The group and the account come from the session (`useCoordinator`), so they
 * appear a moment after the rest. Without a coordinator session the right side
 * stays empty: the data routes refuse her anyway. The account circle opens the
 * same menu as the girl's, with "Sair da conta" (the text of A10); the Figma of
 * K10 draws the circle with no menu, so this was decided without a design.
 */
export function CoordHeader({ active }: CoordHeaderProps) {
  const session = useCoordinator();
  const coordinator = session?.ok ? session.coordinator : null;

  return (
    <header className={styles.header}>
      <div className={styles.left}>
        <Brand />
        <nav aria-label="Seções" className={styles.nav}>
          {SECTION_LIST.map((section) =>
            section.href ? (
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
        {coordinator?.groupName && (
          <span className={styles.group}>
            <Icon name="users" />
            {coordinator.groupName}
          </span>
        )}
        {coordinator && (
          <AccountMenu name={coordinator.name} withProfile={false} leaveLabel="Sair da conta" />
        )}
      </div>
    </header>
  );
}
