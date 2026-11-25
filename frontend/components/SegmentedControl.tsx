import styles from "./SegmentedControl.module.css";

type SegmentedControlProps<V extends string> = {
  /** Nome do grupo para leitor de tela, ex.: "Formato da ação". */
  label: string;
  options: { value: V; label: string }[];
  value: V;
  onChange: (value: V) => void;
  /** "pill": opções em pílula, a escolhida em verde (Figma C5, "Elas entraram na área?"). */
  variant?: "bar" | "pill";
};

/** Escolha entre poucas opções lado a lado (Figma: Segmentado, Presencial/Online). */
export function SegmentedControl<V extends string>({
  label,
  options,
  value,
  onChange,
  variant = "bar",
}: SegmentedControlProps<V>) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={`${styles.group} ${variant === "pill" ? styles.pill : ""}`}
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={option.value === value}
          className={styles.option}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
