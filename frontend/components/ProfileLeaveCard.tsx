"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { logout } from "@/lib/access-api";
import styles from "./ProfileCard.module.css";
import leaveStyles from "./ProfileLeaveCard.module.css";

type ProfileLeaveCardProps = {
  /** "Excluir minha conta e meus dados". A #394 liga o modal de confirmação. */
  onDelete?: () => void;
};

/** "Sair da conta" e "Excluir minha conta e meus dados" no fim da A10 (RF-F7.12). */
export function ProfileLeaveCard({ onDelete }: ProfileLeaveCardProps) {
  const router = useRouter();
  const [leaving, setLeaving] = useState(false);
  const [error, setError] = useState<string>();

  async function leave() {
    setLeaving(true);
    setError(undefined);

    if (await logout()) {
      // Os dados de teste desta aba são da conta que saiu.
      try {
        sessionStorage.clear();
      } catch {
        // Sem sessionStorage (janela privada bloqueada): não há o que limpar.
      }
      // replace: "voltar" não reabre o perfil; a página lê a rota, recebe 401 e sai.
      router.replace("/");
      return;
    }

    setLeaving(false);
    setError("Não deu pra sair agora. Tente de novo.");
  }

  return (
    <section className={leaveStyles.leave} aria-label="Sair ou excluir a conta">
      <button
        type="button"
        className={styles.action}
        disabled={leaving}
        aria-busy={leaving || undefined}
        onClick={leave}
      >
        {leaving ? "Saindo…" : "Sair da conta"}
      </button>
      {error && (
        <p className={leaveStyles.error} role="alert">
          {error}
        </p>
      )}
      <button type="button" className={leaveStyles.delete} onClick={() => onDelete?.()}>
        Excluir minha conta e meus dados
      </button>
    </section>
  );
}
