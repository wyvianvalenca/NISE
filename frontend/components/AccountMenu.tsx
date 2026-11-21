"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { logout } from "@/lib/access-api";
import { Avatar } from "./Avatar";
import styles from "./AccountMenu.module.css";

type AccountMenuProps = {
  /** Her name, shown at the top of the menu; the avatar shows its initial. */
  name: string;
};

/**
 * The girl's avatar in the header of her screens. Tapping it opens a small
 * menu with her name, "Ver perfil" and "Sair".
 *
 * There is no Figma for the menu yet: it uses the surface, border and radius
 * of the cards. It is a disclosure (a button that shows a panel), not an ARIA
 * menu, so Tab moves through the two options like any other link or button.
 * Esc or a tap outside closes it.
 */
export function AccountMenu({ name }: AccountMenuProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [error, setError] = useState<string>();
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) {
      return;
    }

    function closeOnOutsideTap(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    }

    document.addEventListener("pointerdown", closeOnOutsideTap);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideTap);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  async function leave() {
    setLeaving(true);
    setError(undefined);

    if (await logout()) {
      // The sign-up and filé test data in this tab belong to her account.
      try {
        sessionStorage.clear();
      } catch {
        // No sessionStorage (a blocked private window): nothing to clear.
      }
      // replace: "voltar" should not reopen her screens. A01 has "Entrar".
      router.replace("/");
      return;
    }

    setLeaving(false);
    setError("Não deu pra sair agora. Tente de novo.");
  }

  return (
    <div className={styles.root} ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        className={styles.trigger}
        aria-label="Sua conta"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((current) => !current)}
      >
        <Avatar name={name} size={36} />
      </button>

      {open && (
        <div id={panelId} className={styles.panel}>
          <p className={styles.name}>{name}</p>

          {/* O perfil ainda não existe; por enquanto o link dá 404. */}
          <Link href="/perfil" className={styles.item}>
            Ver perfil
          </Link>
          <button
            type="button"
            className={styles.item}
            onClick={leave}
            disabled={leaving}
            aria-busy={leaving || undefined}
          >
            {leaving ? "Saindo…" : "Sair"}
          </button>

          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
