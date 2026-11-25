"use client";

import { AfterActionResults } from "./AfterActionResults";
import { EnteredFieldResults } from "./EnteredFieldResults";
import { FutureSelfSection } from "./FutureSelfSection";
import { InterestCards } from "./InterestCards";
import styles from "./page.module.css";

/**
 * Os cards da tela: os filtros ficam em AfterActionResults e valem para todos.
 * Como no Figma, os quatro cards seguintes ficam dois a dois: interesse e "quem
 * mudou" numa linha, futuro e "entraram na área" na outra. Cada card busca de
 * novo quando os filtros mudam, sem ser recriado (nada de `key` pelos filtros:
 * irmãos com a mesma `key` se acumulavam na tela).
 */
export function ResultsCards() {
  return (
    <AfterActionResults
      below={(filters) => (
        <>
          <div className={styles.row}>
            <InterestCards filters={filters} />
          </div>
          <div className={styles.row}>
            <FutureSelfSection filters={filters} />
            <EnteredFieldResults filters={filters} />
          </div>
        </>
      )}
    />
  );
}
