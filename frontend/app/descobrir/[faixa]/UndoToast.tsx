import { useEffect, useState } from "react";
import { Toast } from "@/components/Toast";
import type { Choice } from "@/lib/sugestoes";
import styles from "./SuggestionsScreen.module.css";

/** Quanto tempo o aviso fica na tela, em ms (#107 sugere uns 5 s). */
export const UNDO_TIMEOUT_MS = 5000;

export type UndoNotice = {
  /** Muda a cada escolha, para o tempo recomeçar mesmo quando o título se repete. */
  key: number;
  id: string;
  title: string;
  choice: Choice;
  /** "undoing" enquanto o back desfaz; "error" se não deu certo. */
  status: "ready" | "undoing" | "error";
};

// Textos da #107: o mesmo aviso para as três escolhas, só a frase muda.
const MESSAGES: Record<Choice, string> = {
  "quero-fazer": "entrou no seu filé",
  "talvez-depois": "foi pro Ver depois",
  "nao-e-pra-mim": "foi dispensada",
};

type UndoToastProps = {
  notice: UndoNotice;
  onUndo: () => void;
  /** Chamado quando o tempo acaba; aí o "Desfazer" deixa de ser oferecido. */
  onTimeout: () => void;
};

/**
 * Aviso "<título> entrou no seu filé · Desfazer" da A06·2 (Figma: Aviso / Sugestão salva).
 * Some sozinho depois de UNDO_TIMEOUT_MS. O tempo para enquanto o mouse ou o foco estão
 * nele (assim dá tempo de usar pelo teclado) e enquanto o "Desfazer" está sendo enviado.
 */
export function UndoToast({ notice, onUndo, onTimeout }: UndoToastProps) {
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused || notice.status === "undoing") return;
    // Depois de um erro o tempo recomeça, para dar chance de tentar de novo.
    const timer = setTimeout(onTimeout, UNDO_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [notice.key, notice.status, paused, onTimeout]);

  const failed = notice.status === "error";

  return (
    <div
      className={styles.toastArea}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <Toast
        icon={failed ? "info-lg" : "check"}
        action={{
          label: failed ? "Tentar de novo" : "Desfazer",
          onClick: onUndo,
          busy: notice.status === "undoing",
        }}
      >
        {failed ? (
          <strong>Não deu pra desfazer.</strong>
        ) : (
          <>
            <strong>{notice.title}</strong> {MESSAGES[notice.choice]}
          </>
        )}
      </Toast>
    </div>
  );
}
