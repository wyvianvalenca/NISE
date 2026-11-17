"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState, type FormEvent } from "react";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/Button";
import { CityField } from "@/components/CityField";
import { Field } from "@/components/Field";
import { GoogleButton } from "@/components/GoogleButton";
import { TextLink } from "@/components/TextLink";
import {
  createEmailAccount,
  MINIMUM_PASSWORD_LENGTH,
  type City,
} from "@/lib/signup-api";
import { isValidEmail, MISSING_DOMAIN_ERROR } from "@/lib/email";
import { checkAge } from "@/lib/age";
import styles from "./page.module.css";

type Errors = {
  name?: string;
  email?: string;
  password?: string;
  birthDate?: string;
  city?: string;
  general?: string;
};

const NETWORK_ERROR = "Não deu pra criar sua conta agora. Tente de novo.";

/**
 * A02 "Crie sua conta" (Figma 511:505), issue #51.
 *
 * It serves both flows: with an invite (M1, `?convite=<code>`) and without
 * one (M2). The invite code travels to the server because it decides the
 * account's origin and, later on, the wording of the terms (RN-29, H3).
 *
 * The email does not arrive prefilled from the invite: that route is public,
 * and returning the imported record's email there would let any guessed code
 * harvest the email of an underage girl. Linking the account to the imported
 * record is the server's job, through the email she types (RF-F2.02).
 */
function CreateAccount() {
  const router = useRouter();
  const invite = useSearchParams().get("convite") ?? undefined;

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [cityText, setCityText] = useState("");
  const [city, setCity] = useState<City | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [sending, setSending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const found: Errors = {};
    if (!name.trim()) {
      found.name = "Preencha seu nome completo.";
    }
    if (!isValidEmail(email)) {
      found.email = MISSING_DOMAIN_ERROR;
    }
    if (password.length < MINIMUM_PASSWORD_LENGTH) {
      found.password = `A senha precisa de pelo menos ${MINIMUM_PASSWORD_LENGTH} caracteres.`;
    }
    if (!birthDate) {
      found.birthDate = "Preencha sua data de nascimento.";
    }
    if (!city) {
      found.city = "Escolha uma cidade da lista.";
    }

    // An impossible date (wrong year, 30/02) is not the same as being too
    // young: here she fixes the field instead of being sent to A02c.
    const age = birthDate ? checkAge(birthDate) : null;
    if (age === "invalid_date") {
      found.birthDate = "Confira sua data de nascimento.";
    }

    setErrors(found);
    if (Object.keys(found).length > 0 || !city) {
      return;
    }

    // Under 13: nothing she filled in leaves the screen (RN-03, RF-F7.01).
    if (age === "under_13") {
      setSending(true);
      router.replace("/cadastro/idade-minima");
      return;
    }

    setSending(true);
    try {
      const result = await createEmailAccount({
        name: name.trim(),
        email: email.trim(),
        password,
        birthDate,
        cityId: city.id,
        invite,
      });

      if (result.ok) {
        router.push("/cadastro/termos");
        return;
      }

      if (result.reason === "under_13") {
        router.replace("/cadastro/idade-minima");
        return;
      }

      setSending(false);
      switch (result.reason) {
        case "account_exists":
          setErrors({ email: "Já existe uma conta com esse e-mail." });
          break;
        case "invalid_email":
          setErrors({ email: MISSING_DOMAIN_ERROR });
          break;
        case "password_too_short":
          setErrors({
            password: `A senha precisa de pelo menos ${MINIMUM_PASSWORD_LENGTH} caracteres.`,
          });
          break;
        case "invalid_city":
          setErrors({ city: "Escolha uma cidade da lista." });
          break;
        default:
          setErrors({ general: NETWORK_ERROR });
      }
    } catch {
      // The connection dropped midway: free the button and explain, rather
      // than leaving it stuck.
      setSending(false);
      setErrors({ general: NETWORK_ERROR });
    }
  }

  return (
    <div className={styles.page}>
      <AppHeader>
        <TextLink href="/entrar">Já tenho conta</TextLink>
      </AppHeader>

      <main className={styles.main}>
        <h1 className={styles.title}>Crie sua conta</h1>
        <p className={styles.lead}>
          Um cadastro para acompanhar todo o seu percurso.
        </p>

        <div className={styles.google}>
          <GoogleButton invite={invite} />
          <p className={styles.divider}>
            <span>ou preencha seus dados</span>
          </p>
        </div>

        <form className={styles.form} onSubmit={submit} noValidate>
          <Field
            label="Nome completo"
            autoComplete="name"
            onValueChange={setName}
            error={errors.name}
            required
          />
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
            autoComplete="new-password"
            onValueChange={setPassword}
            error={errors.password}
            required
          />
          <Field
            label="Data de nascimento"
            type="date"
            onValueChange={setBirthDate}
            error={errors.birthDate}
            required
          />
          <CityField
            value={cityText}
            onChange={setCityText}
            onSelect={setCity}
            error={errors.city}
          />

          {errors.general && (
            <p className={styles.error} role="alert">
              {errors.general}
            </p>
          )}

          <Button type="submit" loading={sending} className={styles.fullWidth}>
            Criar conta
          </Button>
        </form>
      </main>
    </div>
  );
}

/**
 * A02's wrapper. The `useSearchParams` inside only runs under a Suspense
 * boundary; without one, the whole page stops being statically generated.
 */
export default function CreateAccountPage() {
  return (
    <Suspense>
      <CreateAccount />
    </Suspense>
  );
}
