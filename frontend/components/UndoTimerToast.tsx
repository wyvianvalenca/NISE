"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Toast } from "./Toast";
import styles from "./UndoTimerToast.module.css";

/** Quanto tempo o aviso fica na tela, em ms (#107 sugere uns 5 s). */
export const UNDO_TIMEOUT_MS = 5000;

type UndoTimerToastProps = {
  /** Texto do aviso; use <strong> na parte principal ("Você tá inscrita!"). */
  children: ReactNode;
  /** "undoing" enquanto o back desfaz; "error" se não deu certo. */
  status: "ready" | "undoing" | "error";
  /** Texto em vez do aviso quando o "Desfazer" falha, ex.: "Não deu pra desfazer." */
  errorText: string;
  onUndo: () => void;
  /** Outra ação da tela está sendo enviada: o "Desfazer" fica bloqueado até ela voltar. */
  busy?: boolean;
  /** Chamado quando o tempo acaba; aí o "Desfazer" deixa de ser oferecido. */
  onTimeout: () => void;
};

/**
 * Aviso com "Desfazer" no alto da tela, abaixo do cabeçalho (Figma: Aviso / Inscrita).
 * Some sozinho depois de UNDO_TIMEOUT_MS, como o aviso das sugestões (#107). O tempo
 * para enquanto o mouse ou o foco estão nele (assim dá tempo de usar pelo teclado) e
 * enquanto o "Desfazer" está sendo enviado; depois de um erro, recomeça.
 */
export function UndoTimerToast({ children, status, busy, errorText, onUndo, onTimeout }: UndoTimerToastProps) {
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused || status === "undoing") return;
    const timer = setTimeout(onTimeout, UNDO_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [status, paused, onTimeout]);

  const failed = status === "error";

  return (
    <div
      className={styles.area}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <Toast
        icon={failed ? "info-lg" : "check"}
        action={{ label: failed ? "Tentar de novo" : "Desfazer", onClick: onUndo, busy: status === "undoing" || busy }}
      >
        {failed ? <strong>{errorText}</strong> : children}
      </Toast>
    </div>
  );
}
