"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { Toast } from "./Toast";
import styles from "./DeletedAccountNotice.module.css";

/** Quanto tempo o aviso fica na tela antes de sumir sozinho. */
const NOTICE_MS = 5000;

/**
 * O aviso "Sua conta foi excluída" na A01, depois de excluir a conta (RF-F7.09,
 * #394). A exclusão leva até aqui com `?conta=excluida`. Sem o parâmetro, nada
 * aparece. O aviso some sozinho e tira o parâmetro da URL, para recarregar a
 * página não mostrá-lo de novo.
 *
 * Ler a query string pede uma fronteira de Suspense em volta deste componente.
 */
export function DeletedAccountNotice() {
  const router = useRouter();
  const shown = useSearchParams().get("conta") === "excluida";

  useEffect(() => {
    if (!shown) return;

    const timer = setTimeout(() => router.replace("/"), NOTICE_MS);
    return () => clearTimeout(timer);
  }, [shown, router]);

  if (!shown) return null;

  return (
    <div className={styles.notice}>
      <Toast>
        <strong>Sua conta foi excluída</strong>
      </Toast>
    </div>
  );
}
