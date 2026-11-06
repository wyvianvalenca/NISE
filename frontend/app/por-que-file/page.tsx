"use client";

// A06·0 · Por que filé?: a explicação da metáfora, antes de ela começar.
// Atende RF-F10.02 (issues #82 e #83). Usa os dados de teste de lib/file.ts até a #85.

import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/Button";
import {
  FILE_PATHS,
  introJaVista,
  marcarIntroVista,
  PASSOS,
  REVER,
} from "@/lib/file";
import styles from "./page.module.css";

/**
 * Sem `?rever=1`, a tela só aparece na primeira vez: quem já viu segue direto
 * para o Descobrir. Com `?rever=1` ela sempre abre, que é como o "?" ao lado
 * de "Seu filé" (#114) traz a explicação de volta.
 */
function PorQueFile() {
  const router = useRouter();
  const rever = useSearchParams().get(REVER) === "1";
  /** `null` enquanto a resposta não chegou. */
  const [vista, setVista] = useState<boolean | null>(null);
  const [saindo, setSaindo] = useState(false);

  useEffect(() => {
    if (rever) return;

    let atual = true;
    introJaVista().then((resposta) => {
      if (atual) setVista(resposta);
    });

    return () => {
      atual = false;
    };
  }, [rever]);

  useEffect(() => {
    if (!rever && vista === true) {
      router.replace(FILE_PATHS.discover);
    }
  }, [rever, vista, router]);

  async function comecar() {
    setSaindo(true);
    await marcarIntroVista();
    router.push(FILE_PATHS.discover);
  }

  const mostrando = rever || vista === false;

  if (!mostrando) {
    return (
      <div className={styles.page}>
        <AppHeader />
        <main className={styles.main}>
          <p className={styles.status} aria-live="polite">
            Carregando...
          </p>
        </main>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <AppHeader />

      <main className={styles.main}>
        <p className={styles.antes}>Antes de começar</p>
        <h1 className={styles.title}>Por que filé?</h1>
        <p className={styles.lead}>
          Nas lagoas Mundaú e Manguaba, mulheres tecem o filé há gerações, e{" "}
          <strong className={styles.destaque}>uma ensina a outra</strong>. A NISE
          se inspira nelas.
        </p>

        <ol className={styles.passos}>
          {PASSOS.map((passo, indice) => (
            <li key={passo.imagem} className={styles.passo}>
              <Image
                src={`/file/${passo.imagem}.svg`}
                alt=""
                width={100}
                height={100}
                unoptimized
              />
              <span className={styles.texto}>
                <span className={styles.passoTitulo}>{passo.titulo}</span>
                <span className={styles.passoDetalhe}>{passo.texto}</span>
              </span>
              {indice < PASSOS.length - 1 && (
                <span className={styles.fio} aria-hidden="true" />
              )}
            </li>
          ))}
        </ol>
      </main>

      <footer className={styles.rodape}>
        <p className={styles.lema}>
          Sem ordem certa e sem pressa,
          <br />
          do seu jeito.
        </p>
        <Button
          className={styles.fullWidth}
          loading={saindo}
          onClick={comecar}
        >
          Começar meu filé
        </Button>
      </footer>
    </div>
  );
}

/**
 * Envelope da A06·0. O `useSearchParams` lá dentro só roda sob um limite de
 * Suspense; sem ele, a página inteira deixa de ser gerada estaticamente.
 */
export default function PorQueFilePage() {
  return (
    <Suspense>
      <PorQueFile />
    </Suspense>
  );
}
