"use client";

import { Button } from "./Button";
import styles from "./DeleteAccountModal.module.css";
import { Modal } from "./Modal";

type DeleteAccountModalProps = {
  open: boolean;
  /** Fecha a janela sem excluir ("Cancelar", Esc ou o clique no véu). */
  onClose: () => void;
  /** Chamado quando ela confirma. Quem usa exclui e decide o que vem depois. */
  onConfirm: () => void;
  /**
   * Verdadeiro enquanto a exclusão roda: o botão espera e não aperta de novo, e a
   * janela não fecha (Cancelar, Esc e o véu), porque a exclusão seguiria mesmo
   * assim e ela acharia que desistiu.
   */
  busy?: boolean;
  /** Mensagem de erro, quando a exclusão não deu. A janela continua aberta. */
  error?: string;
};

/**
 * Confirmação antes de excluir a conta (Figma 711:611: Modal / Excluir conta,
 * RF-F7.09, D-113). Não pede senha nem login do Google.
 */
export function DeleteAccountModal({
  open,
  onClose,
  onConfirm,
  busy = false,
  error,
}: DeleteAccountModalProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      locked={busy}
      title="Excluir sua conta?"
      actions={
        <>
          <Button variant="secondary" className={styles.button} disabled={busy} onClick={onClose}>
            Cancelar
          </Button>
          <Button
            variant="danger"
            className={styles.button}
            loading={busy}
            loadingLabel="Excluindo…"
            onClick={onConfirm}
          >
            Excluir conta
          </Button>
        </>
      }
    >
      <p>Seu filé, suas respostas e seus dados saem da NISE. Isso não dá pra desfazer.</p>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </Modal>
  );
}
