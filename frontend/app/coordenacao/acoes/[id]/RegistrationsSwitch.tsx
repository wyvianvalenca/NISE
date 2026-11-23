"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/Button";
import { Icon } from "@/components/Icon";
import { Modal } from "@/components/Modal";
import { Notice } from "@/components/Notice";
import { closeRegistrations, reopenRegistrations, type ActionPage } from "@/lib/coord-action-page";
import styles from "./RegistrationsSwitch.module.css";

/**
 * Right column of K11: the card that closes the registrations (#236, RF-F1.10),
 * the one that reopens them until the day of the event (#237, RF-F1.13) and,
 * once closed, the note that says so. Closing never changes the status
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
  const [reopening, setReopening] = useState(false);
  /** The server refused: the event day came while the page was open. */
  const [tooLate, setTooLate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const canClose =
    action.registeredCount > 0 && action.registrationsOpen && action.status === "awaiting_event";
  // After closing or reopening, the button she pressed is gone: once the page
  // reloads, the focus goes to the card or note that replaced it (RNF-G.02).
  const moveFocus = useRef(false);
  useEffect(() => {
    if (!moveFocus.current) return;
    moveFocus.current = false;
    const target = action.canReopen ? "reopen-title" : canClose ? "close-title" : "closed-note";
    document.getElementById(target)?.focus();
  }, [action.registrationsOpen, action.canReopen, canClose]);

  const audience = action.cityName ? `meninas de ${action.cityName}` : "meninas";

  function dismiss() {
    setClosing(false);
    setReopening(false);
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
    moveFocus.current = true;
    onChanged();
  }

  async function confirmReopen() {
    setBusy(true);
    setFailed(false);
    try {
      const answer = await reopenRegistrations(action.id);
      setTooLate(answer?.result === "event_day_reached");
    } catch {
      setFailed(true);
      setBusy(false);
      return;
    }
    setBusy(false);
    setReopening(false);
    moveFocus.current = true;
    // After a refusal the reload shows the page as the server has it now.
    onChanged();
  }

  return (
    <>
      {tooLate && !action.canReopen && (
        <div className={styles.note} role="alert">
          <Notice icon="alert">
            As inscrições fecharam sozinhas no dia do evento e não podem ser reabertas.
          </Notice>
        </div>
      )}
      {action.canReopen && (
        <section className={styles.card} aria-labelledby="reopen-title">
          <span className={styles.icon}>
            <Icon name="clipboard" size={28} />
          </span>
          <h2 id="reopen-title" tabIndex={-1} className={styles.title}>
            Precisa de mais inscritas?
          </h2>
          <p className={styles.text}>
            Reabra as inscrições pra ação voltar às sugestões das meninas. O status não muda.
          </p>
          <Button onClick={() => setReopening(true)}>Reabrir inscrições</Button>
        </section>
      )}
      {canClose && (
        <>
          <section className={styles.card} aria-labelledby="close-title">
            <span className={styles.icon}>
              <Icon name="clipboard" size={28} />
            </span>
            <h2 id="close-title" tabIndex={-1} className={styles.title}>
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
        <div id="closed-note" tabIndex={-1} className={styles.note}>
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
      {reopening && (
        <Modal
          open
          onClose={dismiss}
          title="Reabrir inscrições?"
          actions={
            <>
              <Button variant="secondary" onClick={dismiss}>
                Agora não
              </Button>
              <Button loading={busy} loadingLabel="Reabrindo…" onClick={confirmReopen}>
                Reabrir inscrições
              </Button>
            </>
          }
        >
          <p>
            {action.name} volta para as sugestões das meninas. Você pode fechar de novo quando
            quiser.
          </p>
          {failed && (
            <p role="alert" className={styles.error}>
              Não deu pra reabrir as inscrições. Nada mudou. Tente de novo.
            </p>
          )}
        </Modal>
      )}
    </>
  );
}
