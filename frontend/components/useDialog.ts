import { useEffect, useRef } from "react";

/**
 * Liga o <dialog> nativo ao estado `open` do React.
 * O navegador cuida do foco preso dentro da janela e da tecla Esc;
 * quando ela fecha (Esc ou clique no véu), chamamos onClose.
 */
export function useDialog(open: boolean, onClose: () => void) {
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

    const handleClose = () => onClose();
    // Clique fora da caixa (no véu) também fecha.
    const handleClick = (event: MouseEvent) => {
      if (event.target === dialog) dialog.close();
    };

    dialog.addEventListener("close", handleClose);
    dialog.addEventListener("click", handleClick);
    return () => {
      dialog.removeEventListener("close", handleClose);
      dialog.removeEventListener("click", handleClick);
    };
  }, [onClose]);

  return ref;
}
