"use client";

import { Button } from "./Button";
import { Modal } from "./Modal";

type DeleteActionModalProps = {
  open: boolean;
  /** Closes the window without deleting ("Cancelar", Esc or a click on the veil). */
  onClose: () => void;
  /** Name of the action, as it appears in the text. */
  actionName: string;
  /** Called when she confirms. The caller does the deleting and decides what follows. */
  onConfirm: () => void;
  /** True while the deletion runs: the confirm button waits and cannot be pressed twice. */
  busy?: boolean;
};

/**
 * Confirmation before deleting an action (Figma: Modal / Excluir ação, RF-F30.12).
 * It knows nothing about where it was opened from: the list of actions and the
 * action page (#233) both use it by passing the name and what to do on confirm.
 */
export function DeleteActionModal({
  open,
  onClose,
  actionName,
  onConfirm,
  busy = false,
}: DeleteActionModalProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Excluir ação?"
      actions={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="danger" loading={busy} loadingLabel="Excluindo…" onClick={onConfirm}>
            Excluir ação
          </Button>
        </>
      }
    >
      <p>{actionName} sai da sua lista e das sugestões das meninas. Isso não dá pra desfazer.</p>
    </Modal>
  );
}
