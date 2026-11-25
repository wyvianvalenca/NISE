"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { logout } from "@/lib/access-api";
import { deleteAccount } from "@/lib/profile-api";
import { SIGNUP_PATHS } from "@/lib/signup";
import { DeleteAccountModal } from "./DeleteAccountModal";
import styles from "./ProfileCard.module.css";
import leaveStyles from "./ProfileLeaveCard.module.css";

/** O aviso da A01 depois de excluir (DeletedAccountNotice lê este parâmetro). */
const DELETED_ACCOUNT_URL = "/?conta=excluida";

/**
 * "Sair da conta" e "Excluir minha conta e meus dados" no fim da A10 (RF-F7.12).
 * O segundo abre o modal de confirmação e exclui a conta (RF-F7.09, #394).
 */
export function ProfileLeaveCard() {
  const router = useRouter();
  const [leaving, setLeaving] = useState(false);
  const [error, setError] = useState<string>();
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string>();

  // Os dados de teste desta aba são da conta que saiu.
  function clearTabData() {
    try {
      sessionStorage.clear();
    } catch {
      // Sem sessionStorage (janela privada bloqueada): não há o que limpar.
    }
  }

  async function leave() {
    setLeaving(true);
    setError(undefined);

    if (await logout()) {
      clearTabData();
      // replace: "voltar" não reabre o perfil; a página lê a rota, recebe 401 e sai.
      router.replace("/");
      return;
    }

    setLeaving(false);
    setError("Não deu pra sair agora. Tente de novo.");
  }

  async function confirmDelete() {
    setDeleting(true);
    setDeleteError(undefined);

    const result = await deleteAccount();

    if (result.ok) {
      clearTabData();
      // replace: "voltar" não reabre o perfil.
      router.replace(DELETED_ACCOUNT_URL);
      return;
    }

    setDeleting(false);

    if (result.reason === "terms_not_accepted") {
      router.replace(SIGNUP_PATHS.terms);
      return;
    }

    // Sem sessão a conta não foi excluída: vai para o início, como o resto do perfil, sem o aviso.
    if (result.reason === "no_session") {
      router.replace("/");
      return;
    }

    setDeleteError("Não deu pra excluir agora. Tente de novo.");
  }

  function closeModal() {
    setConfirming(false);
    setDeleteError(undefined);
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
      <button type="button" className={leaveStyles.delete} onClick={() => setConfirming(true)}>
        Excluir minha conta e meus dados
      </button>
      <DeleteAccountModal
        open={confirming}
        onClose={closeModal}
        onConfirm={confirmDelete}
        busy={deleting}
        error={deleteError}
      />
    </section>
  );
}
