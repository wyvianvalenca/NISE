import Link from "next/link";
import { Icon, type IconName } from "./Icon";
import styles from "./BottomNav.module.css";

// Rotas provisórias: ajustar quando as páginas da menina existirem.
const TABS = [
  { key: "inicio", label: "Início", href: "/inicio", icon: "home" },
  { key: "file", label: "Filé", href: "/file", icon: "file" },
  { key: "ver-depois", label: "Ver depois", href: "/ver-depois", icon: "bookmark" },
  { key: "perfil", label: "Perfil", href: "/perfil", icon: "user" },
] as const satisfies readonly { key: string; label: string; href: string; icon: IconName }[];

export type BottomNavTab = (typeof TABS)[number]["key"];

type BottomNavProps = {
  /** Aba da página atual; fica teal. */
  active?: BottomNavTab;
};

/** Barra de navegação inferior do PWA da menina (Figma: NISE/Barra inferior). */
export function BottomNav({ active }: BottomNavProps) {
  return (
    <nav aria-label="Navegação principal" className={styles.bar}>
      {TABS.map((tab) => (
        <Link
          key={tab.key}
          href={tab.href}
          className={styles.tab}
          aria-current={tab.key === active ? "page" : undefined}
        >
          <Icon name={tab.icon} />
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
