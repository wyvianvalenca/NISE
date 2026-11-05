import type { Metadata } from "next";
import { AppHeader } from "@/components/AppHeader";
import { currentTermsVersion } from "@/lib/signup";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Termos de uso e Política de privacidade · NISE",
};

// "Ler os termos completos" (issue #53). O texto final ainda não existe (pendência D-01);
// por enquanto a página mostra um texto provisório com a versão atual.
export default function FullTermsPage() {
  return (
    <div className={styles.page}>
      <AppHeader />
      <main className={styles.main}>
        <h1 className={styles.title}>Termos de uso e Política de privacidade</h1>
        <p className={styles.version}>Versão {currentTermsVersion()}</p>
        <p className={styles.draft} role="note">
          Texto provisório. A versão final está sendo escrita pela equipe e vai substituir este conteúdo.
        </p>

        <h2 id="uso" className={styles.heading}>
          Termos de uso
        </h2>
        <p>
          A NISE liga grupos de incentivo à computação em Alagoas às meninas que participam das ações deles. Ao
          criar uma conta, você concorda em usar a plataforma para acompanhar seu caminho na computação.
        </p>

        <h2 id="privacidade" className={styles.heading}>
          Política de privacidade
        </h2>
        <p>
          Guardamos as ações de que você participa, o seu filé, suas respostas a questionários e avaliações e se você
          entrou num curso ou trabalho na área. Se você veio pelo convite de um grupo, a liderança desse grupo vê
          essas informações; os outros grupos só veem números gerais, sem identificar você.
        </p>
      </main>
    </div>
  );
}
