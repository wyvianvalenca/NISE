"use client";

import { useState, type FormEvent } from "react";
import { AppHeader } from "@/components/AppHeader";
import { Button, LinkButton } from "@/components/Button";
import { Field } from "@/components/Field";
import { TextLink } from "@/components/TextLink";
import { requestPasswordReset } from "@/lib/access-api";
import { isValidEmail, MISSING_DOMAIN_ERROR } from "@/lib/email";
import styles from "../entrar.module.css";

const NETWORK_ERROR = "Não deu pra mandar o link agora. Tente de novo.";

/**
 * A16 "Recuperar acesso" (Figma 511:3466), issue #331.
 *
 * The Figma has no screen for after "Enviar link"; it follows the pattern of
 * the others: the same column with a title and a lead. The message never says
 * whether the email has an account, because the server does not say either.
 */
export default function RecoverAccess() {
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState<string>();
  const [generalError, setGeneralError] = useState<string>();
  const [sending, setSending] = useState(false);
  const [sentTo, setSentTo] = useState<string>();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setGeneralError(undefined);

    if (!isValidEmail(email)) {
      setEmailError(MISSING_DOMAIN_ERROR);
      return;
    }
    setEmailError(undefined);

    setSending(true);
    try {
      if (await requestPasswordReset(email.trim())) {
        setSentTo(email.trim());
        return;
      }
      setGeneralError(NETWORK_ERROR);
    } catch {
      setGeneralError(NETWORK_ERROR);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className={styles.page}>
      <AppHeader>
        <TextLink href="/entrar" back>
          Voltar
        </TextLink>
      </AppHeader>

      <main className={styles.main}>
        {sentTo ? (
          <>
            <h1 className={styles.title}>Confira seu e-mail</h1>
            <p className={styles.lead}>
              Se {sentTo} tem conta na NISE, a gente mandou um link pra você
              criar uma senha nova. Se não chegar em alguns minutos, olhe a
              caixa de spam.
            </p>
            <LinkButton href="/entrar" className={styles.messageAction}>
              Voltar para o login
            </LinkButton>
          </>
        ) : (
          <>
            <h1 className={styles.title}>Recupere seu acesso</h1>
            <p className={styles.lead}>
              Diga o e-mail da sua conta e a gente manda um link pra você criar
              uma senha nova.
            </p>

            <form className={styles.form} onSubmit={submit} noValidate>
              <Field
                label="E-mail"
                type="email"
                autoComplete="email"
                onValueChange={setEmail}
                error={emailError}
                required
              />

              {generalError && (
                <p className={styles.error} role="alert">
                  {generalError}
                </p>
              )}

              <Button
                type="submit"
                loading={sending}
                className={styles.fullWidth}
              >
                Enviar link
              </Button>
            </form>
          </>
        )}
      </main>
    </div>
  );
}
