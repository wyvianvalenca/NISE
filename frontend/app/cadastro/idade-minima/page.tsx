import type { Metadata } from "next";
import Image from "next/image";
import { Icon } from "@/components/Icon";
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
 *
 * O símbolo de 84px é colorido, então entra como imagem; o `Icon` viraria
 * máscara e perderia as cores. O espaço vazio no fim é o nó "Ações / A02c" do
 * Figma, que reserva 48px e não tem conteúdo nas versões M1 nem M2 — fica
 * assim até a equipe decidir o que entra ali.
 */
export default function IdadeMinima() {
  return (
    <div className={styles.screen}>
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
        <span className={styles.check}>
          <Icon name="check" />
        </span>
        <p className={styles.item}>Não guardamos os dados que você preencheu.</p>
      </div>

      <div className={styles.acoes} />
    </div>
  );
}
