import styles from "./Tabs.module.css";

export type TabItem<K extends string> = {
  key: K;
  label: string;
  /** Número pequeno ao lado, ex.: "Presentes 17". */
  count?: number;
};

type TabsProps<K extends string> = {
  tabs: TabItem<K>[];
  active: K;
  onChange: (key: K) => void;
  /** Nome do conjunto de abas para leitor de tela. */
  label: string;
};

/**
 * Abas com sublinhado teal (Figma: Abas, em K05e e K11).
 * Só troca a aba; o conteúdo de cada uma fica com a página.
 */
export function Tabs<K extends string>({ tabs, active, onChange, label }: TabsProps<K>) {
  return (
    <div role="tablist" aria-label={label} className={styles.tabs}>
      {tabs.map((tab) => (
        <button
          key={tab.key}
          type="button"
          role="tab"
          aria-selected={tab.key === active}
          className={styles.tab}
          onClick={() => onChange(tab.key)}
        >
          {tab.label}
          {tab.count !== undefined && <span className={styles.count}>{tab.count}</span>}
        </button>
      ))}
    </div>
  );
}
