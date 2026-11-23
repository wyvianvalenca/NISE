import { useEffect, useRef } from "react";

/**
 * Liga o <dialog> nativo ao estado `open` do React.
 * O navegador cuida do foco preso dentro da janela e da tecla Esc;
 * quando ela fecha (Esc ou clique no véu), chamamos onClose.
 *
 * Com `locked`, a janela não fecha: nem Esc nem o clique no véu. Serve para
 * quando algo já está em andamento e fechar daria a impressão de desistir.
 */
export function useDialog(open: boolean, onClose: () => void, locked = false) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;

    const handleClose = () => {
      // O Chrome deixa um segundo Esc fechar a janela mesmo depois de o primeiro
      // ter sido cancelado: se ela fechou travada, abre de novo.
      if (locked) {
        dialog.showModal();
        return;
      }
      onClose();
    };
    const handleCancel = (event: Event) => {
      if (locked) event.preventDefault();
    };
    // Clique fora da caixa (no véu) também fecha.
    const handleClick = (event: MouseEvent) => {
      if (event.target === dialog && !locked) dialog.close();
    };

    dialog.addEventListener("close", handleClose);
    dialog.addEventListener("cancel", handleCancel);
    dialog.addEventListener("click", handleClick);
    return () => {
      dialog.removeEventListener("close", handleClose);
      dialog.removeEventListener("cancel", handleCancel);
      dialog.removeEventListener("click", handleClick);
    };
  }, [onClose, locked]);

  return ref;
}
