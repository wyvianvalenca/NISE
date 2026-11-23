// Os quatro cartões do passo "Recorte" (#379, RF-F24.10): uma escolha só, e o
// cartão escolhido ganha um check. São botões de rádio, então o teclado anda
// com as setas.

import { type ModelId, MODELS } from "@/lib/exportar";
import styles from "./ExportWizard.module.css";

export function ModelCards({
  value,
  onChange,
}: {
  value: ModelId | null;
  onChange: (id: ModelId) => void;
}) {
  return (
    <fieldset className={styles.modelGrid}>
      <legend className={styles.srOnly}>Pra que você vai usar?</legend>
      {MODELS.map((model) => (
        <label key={model.id} className={value === model.id ? styles.modelOn : styles.model}>
          <input
            type="radio"
            name="export-model"
            className={styles.srOnly}
            checked={value === model.id}
            onChange={() => onChange(model.id)}
          />
          <span className={styles.baseTitle}>{model.name}</span>
          {value === model.id && (
            <span className={styles.modelCheck} aria-hidden="true">
              ✓
            </span>
          )}
          <span className={styles.muted}>{model.description}</span>
          <span className={styles.modelPackages}>{model.packagesLabel}</span>
        </label>
      ))}
    </fieldset>
  );
}
