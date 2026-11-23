import Image from "next/image";
import styles from "./Brand.module.css";

/** Símbolo + nome da NISE, usado nos cabeçalhos (Figma: Marca). */
export function Brand() {
  return (
    <span className={styles.brand}>
      <Image src="/icons/simbolo-nise.svg" alt="" width={30} height={30} unoptimized />
      NISE
    </span>
  );
}
