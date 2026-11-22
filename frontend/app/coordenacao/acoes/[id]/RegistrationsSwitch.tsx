"use client";

import { useState } from "react";
import { Button } from "@/components/Button";
import { Icon } from "@/components/Icon";
import { Modal } from "@/components/Modal";
import { Notice } from "@/components/Notice";
import { closeRegistrations, type ActionPage } from "@/lib/coord-action-page";
import styles from "./RegistrationsSwitch.module.css";

/**
 * Right column of K11: the card that closes the registrations (#236, RF-F1.10)
 * and, once closed, the note that says so. Closing never changes the status
 * (RN-37); it only takes the action out of the girls' suggestions (RN-16).
 * `onChanged` reloads the page after the server answered.
 */
export function RegistrationsSwitch({
  action,
  onChanged,
}: {
  action: ActionPage;
  onChanged: () => void;
}) {
  const [closing, setClosing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const canClose =
    action.registeredCount > 0 && action.registrationsOpen && action.status === "awaiting_event";
  const audience = action.cityName ? `meninas de ${action.cityName}` : "meninas";

  function dismiss() {
    setClosing(false);
    setFailed(false);
  }

  async function confirmClose() {
    setBusy(true);
    setFailed(false);
    try {
      await closeRegistrations(action.id);
    } catch {
      // Nothing changed on the server: the card stays as it was.
      setFailed(true);
      setBusy(false);
      return;
    }
    setBusy(false);
    setClosing(false);
    onChanged();
  }

  return (
    <>
      {canClose && (
        <>
          <section className={styles.card} aria-labelledby="close-title">
            <span className={styles.icon}>
              <Icon name="clipboard" size={28} />
            </span>
            <h2 id="close-title" className={styles.title}>
              Terminou de adicionar?
            </h2>
            <p className={styles.text}>
              Se as vagas acabarem, feche as inscrições. A ação sai das sugestões das meninas e o
              status não muda.
            </p>
            <Button onClick={() => setClosing(true)}>Fechar inscrições</Button>
          </section>
          <div className={styles.note}>
            <Notice icon="eye">
              Enquanto estiver aberta, a ação continua nas sugestões das {audience}.
            </Notice>
          </div>
        </>
      )}
      {!action.registrationsOpen && action.registeredCount > 0 && (
        <div className={styles.note}>
          <Notice icon="eye">
            Inscrições fechadas. A ação não aparece mais nas sugestões das meninas.
          </Notice>
        </div>
      )}

      {/* Mounted only while open: a closed <dialog> would keep the aside from being empty. */}
      {closing && (
        <Modal
          open
          onClose={dismiss}
          title="Fechar inscrições?"
          actions={
            <>
              <Button variant="secondary" onClick={dismiss}>
                Agora não
              </Button>
              <Button loading={busy} loadingLabel="Fechando…" onClick={confirmClose}>
                Fechar inscrições
              </Button>
            </>
          }
        >
          <p>
            {action.name} sai das sugestões das meninas. Você ainda pode adicionar inscritas
            manualmente.
          </p>
          {failed && (
            <p role="alert" className={styles.error}>
              Não deu pra fechar as inscrições. Nada mudou. Tente de novo.
            </p>
          )}
        </Modal>
      )}
    </>
  );
}
