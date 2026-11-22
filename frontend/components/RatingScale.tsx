import { useId } from "react";
import { Icon } from "./Icon";
import styles from "./RatingScale.module.css";

// Texto de cada nota. O Figma só mostra "4 · Curti bastante!" e os extremos;
// as notas 2 e 3 precisam ser confirmadas com o design.
const LABELS = ["Não curti", "Curti pouco", "Foi ok", "Curti bastante!", "Amei!"] as const;

type RatingScaleProps = {
  /** Pergunta, para leitor de tela (o título visível fica na página). */
  label: string;
  value: number | null;
  onChange: (value: number) => void;
};

/**
 * Nota de 1 a 5 com carinhas (Figma: Notas, tela A03).
 * Usa rádios nativos: dá para escolher com as setas do teclado.
 */
export function RatingScale({ label, value, onChange }: RatingScaleProps) {
  const name = useId();

  return (
    <fieldset className={styles.scale}>
      <legend className={styles.srOnly}>{label}</legend>
      <div className={styles.options}>
        {LABELS.map((text, index) => {
          const score = index + 1;
          return (
            <label key={score} className={styles.option}>
              <input
                type="radio"
                name={name}
                value={score}
                checked={value === score}
                onChange={() => onChange(score)}
                className={styles.input}
                aria-label={`${score} · ${text}`}
              />
              <span className={styles.face} aria-hidden="true">
                <Icon name={`face-${score}` as `face-${1 | 2 | 3 | 4 | 5}`} />
              </span>
              <span className={styles.number} aria-hidden="true">
                {score}
              </span>
            </label>
          );
        })}
      </div>
      <div className={styles.ends} aria-hidden="true">
        <span>1 · {LABELS[0]}</span>
        <span>5 · {LABELS[4]}</span>
      </div>
      <p className={styles.chosen} aria-live="polite">
        {value ? `${value} · ${LABELS[value - 1]}` : " "}
      </p>
    </fieldset>
  );
}
