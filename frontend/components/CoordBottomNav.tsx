import Link from "next/link";
import { Icon, type IconName } from "./Icon";
import type { CoordSection } from "./CoordHeader";
import styles from "./BottomNav.module.css";

// Mesmas seções e rotas provisórias do CoordHeader.
const SECTIONS = [
  { key: "visao-geral", label: "Visão geral", href: "/coordenacao", icon: "dashboard" },
  { key: "acoes", label: "Ações", href: "/coordenacao/acoes", icon: "calendar" },
  {
    key: "acompanhamento",
    label: "Acompanhamento",
    href: "/coordenacao/acompanhamento",
    icon: "users-lg",
  },
  { key: "relatorios", label: "Relatórios", href: "/coordenacao/relatorios", icon: "reports" },
] as const satisfies readonly { key: CoordSection; label: string; href: string; icon: IconName }[];

type CoordBottomNavProps = {
  active?: CoordSection;
};

/**
 * Navegação da coordenadora no celular (Figma: Barra inferior · coordenação).
 * Só aparece abaixo de 768px; acima disso a navegação fica no CoordHeader.
 */
export function CoordBottomNav({ active }: CoordBottomNavProps) {
  return (
    <nav aria-label="Seções" className={`${styles.bar} ${styles.compact} ${styles.mobileOnly}`}>
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
