"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { AccountCard } from "@/components/AccountCard";
import { Button } from "@/components/Button";
import { CityField } from "@/components/CityField";
import { Field } from "@/components/Field";
import { GoogleButton } from "@/components/GoogleButton";
import {
  completeSignup,
  discardSignup,
  getPendingSignup,
  googleStartUrl,
  type City,
  type PendingSignup,
} from "@/lib/signup-api";
import { checkAge } from "@/lib/age";
import styles from "./page.module.css";

type Account = PendingSignup | "loading" | "none";

const NETWORK_ERROR = "Não deu pra concluir agora. Tente de novo.";

/**
 * A02b "Só mais um passo" (#52): after authorising Google, she confirms her
 * birth date and city. Name and email already come from Google and are not
 * editable here.
 */
export default function GoogleAccount() {
  const router = useRouter();
  const [account, setAccount] = useState<Account>("loading");
  const [birthDate, setBirthDate] = useState("");
  const [cityText, setCityText] = useState("");
  const [city, setCity] = useState<City | null>(null);
  const [dateError, setDateError] = useState<string>();
  const [cityError, setCityError] = useState<string>();
  const [generalError, setGeneralError] = useState<string>();
  const [sending, setSending] = useState(false);

  useEffect(() => {
    const controller = new AbortController();

    getPendingSignup(controller.signal)
      .then((pending) => setAccount(pending ?? "none"))
      .catch(() => {
        if (!controller.signal.aborted) {
          setAccount("none");
        }
      });

    return () => controller.abort();
  }, []);

  /** Discards the incomplete session and sends her to A02c (RN-03). */
  const refuseByAge = useCallback(async () => {
    try {
      await discardSignup();
    } catch {
      // Even without reaching the server, she cannot go on.
    }
    router.replace("/cadastro/idade-minima");
  }, [router]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setDateError(undefined);
    setCityError(undefined);
    setGeneralError(undefined);

    if (!birthDate) {
      setDateError("Preencha sua data de nascimento.");
      return;
    }

    const age = checkAge(birthDate);

    // An impossible date (wrong year, 30/02) is not the same as being too
    // young: here she fixes the field without losing her Google session.
    if (age === "invalid_date") {
      setDateError("Confira sua data de nascimento.");
      return;
    }

    // Under 13: nothing she filled in leaves the screen (RN-03).
    if (age === "under_13") {
      setSending(true);
      await refuseByAge();
      return;
    }

    if (!city) {
      setCityError("Escolha uma cidade da lista.");
      return;
    }

    setSending(true);
    try {
      const result = await completeSignup({ birthDate, cityId: city.id });

      if (result.ok) {
        router.push("/cadastro/termos");
        return;
      }

      if (result.reason === "under_13") {
        await refuseByAge();
        return;
      }

      setSending(false);
      if (result.reason === "invalid_city") {
        setCityError("Escolha uma cidade da lista.");
      } else {
        setGeneralError(NETWORK_ERROR);
      }
    } catch {
      // The connection dropped midway: free the button and explain, rather
      // than leaving it stuck.
      setSending(false);
      setGeneralError(NETWORK_ERROR);
    }
  }

  async function useAnotherAccount() {
    setGeneralError(undefined);
    setSending(true);
    try {
      await discardSignup();
    } catch {
      setSending(false);
      setGeneralError(NETWORK_ERROR);
      return;
    }
    window.location.href = googleStartUrl({ switchAccount: true });
  }

  if (account === "loading") {
    return (
      <div className={styles.screen}>
        <p className={styles.status}>Carregando...</p>
      </div>
    );
  }

  // With no Google session there is nothing to complete: she starts over here.
  if (account === "none") {
    return (
      <div className={styles.screen}>
        <h1 className={styles.title}>Vamos de novo?</h1>
        <p className={styles.lead}>
          Sua conta do Google não ficou conectada. Entre de novo para continuar
          o cadastro.
        </p>
        <div className={styles.spacer} />
        <div className={styles.actions}>
          <GoogleButton label="Entrar com o Google" />
        </div>
      </div>
    );
  }

  return (
    <form className={styles.screen} onSubmit={submit} noValidate>
      <h1 className={styles.title}>Só mais um passo</h1>
      <p className={styles.lead}>
        Com sua data de nascimento e cidade, mostramos oportunidades certas para
        você.
      </p>

      <div className={styles.card}>
        <AccountCard
          name={account.name}
          email={account.email}
          provider="google"
        />
      </div>

      <div className={styles.fields}>
        <Field
          label="Data de nascimento"
          type="date"
          onValueChange={setBirthDate}
          error={dateError}
          required
        />
        <CityField
          value={cityText}
          onChange={setCityText}
          onSelect={setCity}
          error={cityError}
        />
      </div>

      {generalError && (
        <p className={styles.error} role="alert">
          {generalError}
        </p>
      )}

      <div className={styles.spacer} />

      <div className={styles.actions}>
        <Button type="submit" loading={sending} className={styles.fullWidth}>
          Concluir cadastro
        </Button>
        <button
          type="button"
          className={styles.otherAccount}
          disabled={sending}
          onClick={useAnotherAccount}
        >
          Usar outra conta
        </button>
      </div>
    </form>
  );
}
