import Link from "next/link";
import { Brand } from "./Brand";
import styles from "./AdminHeader.module.css";

/**
 * Sections of the NISE team admin. Only "Coordenadoras" exists in this story;
 * "Grupos" joins the menu with its own story.
 */
const SECTIONS = [
  { key: "coordenadoras", label: "Coordenadoras", href: "/admin/coordenadoras" },
] as const;

export type AdminSection = (typeof SECTIONS)[number]["key"];

type AdminHeaderProps = {
  /** Section of the current page; gets the teal underline. */
  active: AdminSection;
};

/** Header of the admin screens (AD02). Desktop only (RN-41). */
export function AdminHeader({ active }: AdminHeaderProps) {
  return (
    <header className={styles.header}>
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
    </header>
  );
}
