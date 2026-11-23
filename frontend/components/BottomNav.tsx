import Link from "next/link";
import { Icon, type IconName } from "./Icon";
import styles from "./BottomNav.module.css";

// Rotas provisórias: Filé, Ver depois e Agenda ainda não têm página e dão 404 por enquanto.
const TABS = [
  { key: "file", label: "Filé", href: "/file", icon: "file" },
  { key: "descobrir", label: "Descobrir", href: "/descobrir", icon: "compass-lg" },
  { key: "ver-depois", label: "Ver depois", href: "/ver-depois", icon: "bookmark" },
  { key: "agenda", label: "Agenda", href: "/agenda", icon: "agenda" },
] as const satisfies readonly { key: string; label: string; href: string; icon: IconName }[];

export type BottomNavTab = (typeof TABS)[number]["key"];

type BottomNavProps = {
  /** Aba da página atual; fica teal. */
  active?: BottomNavTab;
};

/** Barra de navegação inferior do PWA da menina (Figma: NISE/Barra inferior · v2). */
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
