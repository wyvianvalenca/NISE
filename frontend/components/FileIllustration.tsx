import Image from "next/image";
import styles from "./FileIllustration.module.css";

/**
 * Ilustração do filé das telas de entrada (Figma: Ilustração / Filé, nas
 * A01 e A01b). São duas camadas: a malha esmaecida ao fundo e os motivos
 * por cima.
 *
 * No Figma a malha é desenhada linha a linha (uns 40 retângulos de 1px com
 * gradiente). Aqui ela vira uma grade em CSS com a mesma medida — 18px entre
 * linhas — e uma máscara que apaga as pontas, que é o que aqueles gradientes
 * faziam. Só os motivos são imagem de verdade.
 */
export function FileIllustration() {
  return (
    <div className={styles.wrap} aria-hidden="true">
      <div className={styles.malha} />
      <Image
        className={styles.motivos}
        src="/motivos-de-file.svg"
        alt=""
        width={396}
        height={342}
        priority
        unoptimized
      />
    </div>
  );
}
