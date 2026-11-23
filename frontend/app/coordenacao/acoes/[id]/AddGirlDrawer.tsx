"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/Button";
import { Drawer } from "@/components/Drawer";
import { Field } from "@/components/Field";
import { Notice } from "@/components/Notice";
import { Select } from "@/components/Select";
import { Toast } from "@/components/Toast";
import { AUDIENCES } from "@/lib/action-form";
import { dayMonthLabel } from "@/lib/coord-action-labels";
import {
  addRegistration,
  checkEmail,
  type EmailCheck,
  type RegistrationField,
} from "@/lib/coord-action-page";
import styles from "./AddGirlDrawer.module.css";

type Errors = Partial<Record<RegistrationField, string>>;

/** Same idea as the server's: something@something.tld, nothing fancy. */
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** Typing waits a moment before asking whether the e-mail is in the NISE. */
const CHECK_DELAY_MS = 400;
const NAME_FIELD_ID = "add-girl-name";
const FORM_ID = "add-girl-form";

type DrawerProps = {
  actionId: number;
  actionName: string;
  /** She was added, so the page can fetch the action and the list again. */
  onAdded: () => void;
  /** The drawer closed (button, Esc or the veil). */
  onClose: () => void;
};

/** "Arduino na escola (26/09), Robótica (10/08) e Python (01/07)". */
function actionsSentence(actions: EmailCheck["groupActions"]) {
  return actions.map((item, index) => (
    <span key={`${item.name}-${item.startsOn}`}>
      {index === 0 ? "" : index === actions.length - 1 ? " e " : ", "}
      <b>{item.name}</b> ({dayMonthLabel(item.startsOn)})
    </span>
  ));
}

/**
 * "Adicionar inscrita" (K11, #235, RF-F1.09, RF-F1.17). Mounted only while it is
 * open, so every opening starts clean. It works with the registrations closed
 * (RF-F1.10) and never creates an account or sends a message (RN-27).
 */
export function AddGirlDrawer({ actionId, actionName, onAdded, onClose }: DrawerProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const [known, setKnown] = useState<EmailCheck | null>(null);
  // Changing the key gives the fields back clean for the next girl.
  const [round, setRound] = useState(0);
  const checkTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const checkRequest = useRef<AbortController>(undefined);

  // The dialog opens in an effect of `Drawer` (it runs first), so `autoFocus`
  // would try before it is open; focus the name here instead.
  // It also runs for the next girl: new fields (`round`) mean focus back on the name.
  useEffect(() => document.getElementById(NAME_FIELD_ID)?.focus(), [round]);

  useEffect(
    () => () => {
      clearTimeout(checkTimer.current);
      checkRequest.current?.abort();
    },
    [],
  );

  function clearError(field: RegistrationField) {
    setErrors((current) => (current[field] ? { ...current, [field]: undefined } : current));
  }

  /** Asks whether the typed e-mail is already in the NISE (RF-F1.17, Should). */
  function scheduleCheck(value: string, delay: number) {
    clearTimeout(checkTimer.current);
    checkRequest.current?.abort();
    const email = value.trim();
    if (!EMAIL_SHAPE.test(email)) {
      setKnown(null);
      return;
    }
    checkTimer.current = setTimeout(() => {
      const controller = new AbortController();
      checkRequest.current = controller;
      checkEmail(actionId, email, controller.signal).then(
        (result) => {
          if (!controller.signal.aborted) setKnown(result?.exists ? result : null);
        },
        // The note is a courtesy: if it fails, adding still works.
        () => {},
      );
    }, delay);
  }

  function read() {
    const data = new FormData(formRef.current!);
    const text = (name: string) => String(data.get(name) ?? "").trim();
    return {
      name: text("name"),
      email: text("email"),
      whatsapp: text("whatsapp"),
      studyStage: text("studyStage"),
      schoolYear: text("schoolYear"),
    };
  }

  async function submit(another: boolean) {
    if (saving) return;
    const input = read();
    const found: Errors = {};
    if (!input.name) found.name = "Escreva o nome";
    if (!input.email) found.email = "Escreva o e-mail";
    else if (!EMAIL_SHAPE.test(input.email)) found.email = "Confira o e-mail";
    setErrors(found);
    setConfirmation(null);
    setFailed(false);
    if (Object.keys(found).length > 0) {
      const first = found.name ? NAME_FIELD_ID : "add-girl-email";
      document.getElementById(first)?.focus();
      return;
    }

    setSaving(true);
    try {
      const result = await addRegistration(actionId, input);
      if (result === null) {
        setFailed(true);
      } else if (result.kind === "invalid") {
        setErrors(result.errors);
        const first = result.errors.name ? NAME_FIELD_ID : "add-girl-email";
        document.getElementById(first)?.focus();
      } else if (result.alreadyRegistered) {
        // Nothing changed, so the fields stay for her to fix the e-mail.
        setErrors({ email: "Ela já está nesta ação." });
        document.getElementById("add-girl-email")?.focus();
      } else {
        onAdded();
        if (another) {
          setConfirmation(`${result.registration.name} foi adicionada.`);
          setKnown(null);
          setRound((value) => value + 1);
        } else {
          formRef.current?.closest("dialog")?.close();
        }
      }
    } catch {
      setFailed(true);
    } finally {
      setSaving(false);
    }
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    void submit(false);
  }

  return (
    <Drawer
      open
      onClose={onClose}
      title="Adicionar inscrita"
      subtitle={actionName}
      footer={
        <>
          <Button variant="secondary" disabled={saving} onClick={() => void submit(true)}>
            Adicionar e incluir outra
          </Button>
          <Button type="submit" form={FORM_ID} loading={saving} loadingLabel="Adicionando…">
            Adicionar
          </Button>
        </>
      }
    >
      <form id={FORM_ID} ref={formRef} noValidate className={styles.form} onSubmit={handleSubmit}>
        {confirmation && <Toast>{confirmation}</Toast>}
        {failed && (
          <Notice tone="pink" icon="info">
            Não deu para adicionar agora. Tente de novo.
          </Notice>
        )}
        <div key={round} className={styles.fields}>
          <Field
            id={NAME_FIELD_ID}
            name="name"
            label="Nome"
            autoComplete="off"
            error={errors.name}
            onValueChange={() => clearError("name")}
          />
          <div className={styles.emailGroup}>
            <Field
              id="add-girl-email"
              name="email"
              type="email"
              label="E-mail"
              autoComplete="off"
              error={errors.email}
              onValueChange={(value) => {
                clearError("email");
                scheduleCheck(value, CHECK_DELAY_MS);
              }}
              onBlur={(event) => scheduleCheck(event.target.value, 0)}
            />
            {known && (
              <Notice tone="teal" icon="check">
                <strong>Já está na NISE.</strong>
                {known.groupActions.length > 0 && (
                  <> Participou de {actionsSentence(known.groupActions)}.</>
                )}{" "}
                Ela vai ser ligada a esta ação, sem cadastro novo.
              </Notice>
            )}
          </div>
          <Field
            name="whatsapp"
            label="WhatsApp"
            optional
            type="tel"
            placeholder="(82) 9 0000-0000"
            autoComplete="off"
            error={errors.whatsapp}
            onValueChange={() => clearError("whatsapp")}
          />
          <Select name="studyStage" label="Nível de escolaridade (opcional)" defaultValue="">
            <option value="">Sem informação</option>
            {AUDIENCES.map((audience) => (
              <option key={audience.value} value={audience.value}>
                {audience.label}
              </option>
            ))}
          </Select>
          <Field
            name="schoolYear"
            label="Série"
            optional
            placeholder="Ex.: 8º ano"
            autoComplete="off"
            error={errors.schoolYear}
            onValueChange={() => clearError("schoolYear")}
          />
        </div>
      </form>
    </Drawer>
  );
}
