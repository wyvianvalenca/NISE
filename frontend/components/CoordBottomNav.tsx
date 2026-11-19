import Link from "next/link";
import { Icon, type IconName } from "./Icon";
import styles from "./BottomNav.module.css";

// Not used anywhere (D-40 dropped the coordinator's phone screens). It keeps
// its own sections now that the CoordHeader ones changed with #210.
type CoordSection = "visao-geral" | "acoes" | "acompanhamento" | "relatorios";

const SECTIONS = [
  {
    key: "visao-geral",
    label: "Visão geral",
    href: "/coordenacao",
    icon: "dashboard",
  },
  {
    key: "acoes",
    label: "Ações",
    href: "/coordenacao/acoes",
    icon: "calendar",
  },
  {
    key: "acompanhamento",
    label: "Acompanhamento",
    href: "/coordenacao/acompanhamento",
    icon: "users-lg",
  },
  {
    key: "relatorios",
    label: "Relatórios",
    href: "/coordenacao/relatorios",
    icon: "reports",
  },
] as const satisfies readonly {
  key: CoordSection;
  label: string;
  href: string;
  icon: IconName;
}[];

type CoordBottomNavProps = {
  active?: CoordSection;
};

/**
 * Coordinator phone navigation (Figma: Bottom bar · coordination).
 * Only shown below 768px; above that the navigation lives in CoordHeader.
 */
export function CoordBottomNav({ active }: CoordBottomNavProps) {
  return (
    <nav
      aria-label="Seções"
      className={`${styles.bar} ${styles.compact} ${styles.mobileOnly}`}
    >
      {SECTIONS.map((section) => (
        <Link
          key={section.key}
          href={section.href}
          className={styles.tab}
          aria-current={section.key === active ? "page" : undefined}
        >
          <Icon name={section.icon} />
          {section.label}
        </Link>
      ))}
    </nav>
  );
}
