"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState, type FormEvent } from "react";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/Button";
import { Field } from "@/components/Field";
import { GoogleButton } from "@/components/GoogleButton";
import { TextLink } from "@/components/TextLink";
import { login } from "@/lib/access-api";
import { isValidEmail, MISSING_DOMAIN_ERROR } from "@/lib/email";
import styles from "./entrar.module.css";

type Errors = {
  email?: string;
  password?: string;
  general?: string;
};

const WRONG_CREDENTIALS_ERROR = "E-mail ou senha incorretos.";
const NETWORK_ERROR = "Não deu pra entrar agora. Tente de novo.";
// The Google callback sends her back here with ?erro=google when the trip to
// Google failed or she cancelled it.
const GOOGLE_ERROR = "Não deu pra entrar com o Google. Tente de novo.";

/**
 * A15 "Entre na NISE" (Figma 511:3457), issue #330. The same screen for the
 * girl and the coordinator: the server says where each one goes next.
 *
 * The Figma only draws the default state; errors follow A02 (message under
 * the field, general ones above the button).
 */
function SignIn() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Errors>(() =>
    searchParams.get("erro") === "google" ? { general: GOOGLE_ERROR } : {},
  );
  const [sending, setSending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const found: Errors = {};
    if (!isValidEmail(email)) {
      found.email = MISSING_DOMAIN_ERROR;
    }
    if (!password) {
      found.password = "Preencha sua senha.";
    }

    setErrors(found);
    if (Object.keys(found).length > 0) {
      return;
    }

    setSending(true);
    try {
      const result = await login(email.trim(), password);

      if (result.ok) {
        // replace: "voltar" from the next screen should not land on the login.
        router.replace(result.nextPath);
        return;
      }

      setSending(false);
      setErrors({
        general:
          result.reason === "wrong_credentials"
            ? WRONG_CREDENTIALS_ERROR
            : NETWORK_ERROR,
      });
    } catch {
      // The connection dropped midway: free the button and explain.
      setSending(false);
      setErrors({ general: NETWORK_ERROR });
    }
  }

  return (
    <div className={styles.page}>
      <AppHeader>
        <TextLink href="/criar-conta">Criar conta</TextLink>
      </AppHeader>

      <main className={styles.main}>
        <h1 className={styles.title}>Entre na NISE</h1>
        <p className={styles.lead}>
          Que bom te ver de novo! Continue de onde parou.
        </p>

        <div className={styles.google}>
          <GoogleButton label="Entrar com o Google" />
          <p className={styles.divider}>
            <span>ou entre com seu e-mail</span>
          </p>
        </div>

        <form className={styles.form} onSubmit={submit} noValidate>
          <Field
            label="E-mail"
            type="email"
            autoComplete="email"
            onValueChange={setEmail}
            error={errors.email}
            required
          />
          <Field
            label="Senha"
            type="password"
            autoComplete="current-password"
            onValueChange={setPassword}
            error={errors.password}
            required
          />
          <TextLink href="/entrar/recuperar" className={styles.forgot}>
            Esqueci minha senha
          </TextLink>

          {errors.general && (
            <p className={styles.error} role="alert">
              {errors.general}
            </p>
          )}

          <Button type="submit" loading={sending} className={styles.fullWidth}>
            Entrar
          </Button>
        </form>
      </main>
    </div>
  );
}

/**
 * A15's wrapper. The `useSearchParams` inside only runs under a Suspense
 * boundary; without one, the whole page stops being statically generated.
 */
export default function SignInPage() {
  return (
    <Suspense>
      <SignIn />
    </Suspense>
  );
}
