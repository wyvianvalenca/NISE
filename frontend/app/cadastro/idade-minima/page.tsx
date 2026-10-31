import type { Metadata } from "next";
import Image from "next/image";
import comum from "../cadastro.module.css";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Ainda não dá pra criar sua conta · NISE",
};

/**
 * A02c "Ainda não dá (menos de 13)" (Figma 511:593), para quem ainda não tem
 * 13 anos (RN-03, RF-F7.01).
 *
 * A tela não recebe nem mostra nada que ela preencheu: quem manda para cá já
 * descartou a sessão incompleta, e nada do que veio do Google fica guardado.
 */
export default function IdadeMinima() {
  return (
    <div className={comum.screen}>
      <Image
        className={styles.simbolo}
        src="/icons/simbolo-nise-lg.svg"
        alt=""
        width={84}
        height={84}
        unoptimized
      />

      <h1 className={styles.title}>Ainda não dá pra criar sua conta</h1>
      <p className={styles.lead}>
        Por enquanto, a NISE não está disponível pra sua idade. Que bom que você
        se interessa por tecnologia, continua curiosa!
      </p>

      <div className={styles.lista}>
        <Image src="/icons/check.svg" alt="" width={16} height={16} unoptimized />
        <p className={styles.item}>Não guardamos os dados que você preencheu.</p>
      </div>

      {/* O Figma reserva 48px de ações aqui (nó "Ações / A02c") e deixa o
          espaço vazio nas duas versões, M1 e M2. Mantido como está até a
          equipe decidir o que entra. */}
      <div className={styles.acoes} />
    </div>
  );
}
