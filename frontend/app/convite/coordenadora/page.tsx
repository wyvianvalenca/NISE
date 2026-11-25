"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState, type FormEvent } from "react";
import { Brand } from "@/components/Brand";
import { Button } from "@/components/Button";
import { Checkbox } from "@/components/Checkbox";
import { Field } from "@/components/Field";
import { GoogleButton } from "@/components/GoogleButton";
import {
  coordinatorGoogleUrl,
  createCoordinatorAccount,
  formatValidUntil,
  getCoordinatorInvite,
  GOOGLE_ERRORS,
  PASSWORD_TOO_SHORT,
  type CoordinatorInvite,
} from "@/lib/coordinator-invite";
import { MINIMUM_PASSWORD_LENGTH, TERMS_VERSION } from "@/lib/signup-api";
import styles from "./page.module.css";

type Errors = {
  name?: string;
  password?: string;
  repeat?: string;
  terms?: string;
  general?: string;
};

const NETWORK_ERROR = "Não deu pra criar sua conta agora. Tente de novo.";
const TERMS_ERROR =
  "Marque que leu e aceita os termos de uso e a política de privacidade.";

const BENEFITS = [
  "Cadastrar as ações do seu grupo",
  "Acompanhar quem se inscreveu e quem foi",
  "Ver os resultados das ações do grupo",
];

/**
 * CV02 "Crie sua conta" on the computer (Figma 2549-938), story #455.
 *
 * The coordinator arrives from the invite e-mail (`?token=...`). The e-mail is
 * the invite's and cannot be changed; the name comes filled in and can be.
 * The Google callback sends her back here with `&erro=<code>` when it refuses.
 * Screens for an invite that expired, was used or whose e-mail already has an
 * account belong to #458: here a link that does not work only says so.
 */
function CoordinatorSignup() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const googleError = GOOGLE_ERRORS[searchParams.get("erro") ?? ""];

  const [invite, setInvite] = useState<CoordinatorInvite | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);

  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [sending, setSending] = useState(false);

  useEffect(() => {
    let current = true;
    getCoordinatorInvite(token)
      .then((found) => {
        if (current) {
          setInvite(found);
          setName(found?.name ?? "");
          setLoaded(true);
        }
      })
      .catch(() => {
        if (current) {
          setLoadFailed(true);
          setLoaded(true);
        }
      });
    return () => {
      current = false;
    };
  }, [token]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const found: Errors = {};
    if (!name.trim()) {
      found.name = "Preencha seu nome completo.";
    }
    if (password.length < MINIMUM_PASSWORD_LENGTH) {
      found.password = PASSWORD_TOO_SHORT;
    }
    if (repeat !== password) {
      found.repeat = "As senhas não são iguais.";
    }
    if (!accepted) {
      found.terms = TERMS_ERROR;
    }

    setErrors(found);
    if (Object.keys(found).length > 0) {
      return;
    }

    setSending(true);
    try {
      const result = await createCoordinatorAccount({
        token,
        name: name.trim(),
        password,
        acceptedTerms: true,
        termsVersion: TERMS_VERSION,
      });

      if (result.ok) {
        router.push(result.nextPath);
        return;
      }

      setSending(false);
      if (result.reason === "password_too_short") {
        setErrors({ password: PASSWORD_TOO_SHORT });
      } else if (result.reason === "terms_not_accepted") {
        setErrors({ terms: TERMS_ERROR });
      } else if (result.reason === "terms_outdated") {
        setErrors({ general: GOOGLE_ERRORS.terms_outdated });
      } else if (result.reason === "invite_invalid") {
        // The link stopped working meanwhile (used or expired).
        setInvite(null);
      } else {
        setErrors({ general: NETWORK_ERROR });
      }
    } catch {
      setSending(false);
      setErrors({ general: NETWORK_ERROR });
    }
  }

  // The Google account is picked outside, so the terms must be checked first.
  function startGoogle(event: React.MouseEvent<HTMLAnchorElement>) {
    if (!accepted) {
      event.preventDefault();
      setErrors({ terms: TERMS_ERROR });
    }
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Brand />
      </header>

      {!loaded ? (
        <p className={styles.status}>Abrindo o convite…</p>
      ) : !invite ? (
        <main className={styles.status}>
          {loadFailed ? (
            <>
              <h1 className={styles.title}>Não deu pra abrir o convite</h1>
              <p className={styles.lead}>Recarregue a página e tente de novo.</p>
            </>
          ) : (
            <>
              <h1 className={styles.title}>Esse link não vale</h1>
              <p className={styles.lead}>
                Peça um novo convite para a equipe NISE.
              </p>
            </>
          )}
        </main>
      ) : (
        <main className={styles.main}>
          <section className={styles.welcome} aria-labelledby="boas-vindas">
            <h1 id="boas-vindas" className={styles.title}>
              Você foi convidada pra coordenar na NISE
            </h1>

            <div className={styles.inviteCard}>
              <p className={styles.group}>{invite.group_name}</p>
              <p className={styles.small}>Convite da equipe NISE</p>
              <p className={styles.small}>
                Vale até {formatValidUntil(invite.expires_at)}
              </p>
            </div>

            <h2 className={styles.subtitle}>Com a conta você vai poder</h2>
            <ul className={styles.benefits}>
              {BENEFITS.map((benefit) => (
                <li key={benefit}>{benefit}</li>
              ))}
            </ul>
          </section>

          <section className={styles.formArea} aria-labelledby="crie-conta">
            <h2 id="crie-conta" className={styles.title}>
              Crie sua conta
            </h2>
            <p className={styles.lead}>
              Você vai entrar como coordenadora das{" "}
              <strong>{invite.group_name}</strong>
            </p>

            <form className={styles.form} onSubmit={submit} noValidate>
              <Field
                label="E-mail"
                type="email"
                defaultValue={invite.email}
                readOnly
                hint="É o e-mail do convite. Não dá pra trocar."
              />
              <Field
                label="Seu nome"
                autoComplete="name"
                defaultValue={invite.name}
                onValueChange={setName}
                error={errors.name}
                required
              />
              <Field
                label="Senha"
                type="password"
                autoComplete="new-password"
                hint="Pelo menos 8 caracteres"
                onValueChange={setPassword}
                error={errors.password}
                required
              />
              <Field
                label="Repita a senha"
                type="password"
                autoComplete="new-password"
                onValueChange={setRepeat}
                error={errors.repeat}
                required
              />

              <div>
                <Checkbox onCheckedChange={setAccepted}>
                  Li e aceito os{" "}
                  <a href="/termos#uso" target="_blank" rel="noopener noreferrer">
                    termos de uso
                  </a>{" "}
                  e a{" "}
                  <a
                    href="/termos#privacidade"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    política de privacidade
                  </a>
                </Checkbox>
                {errors.terms && (
                  <p className={styles.error} role="alert">
                    {errors.terms}
                  </p>
                )}
              </div>

              {errors.general && (
                <p className={styles.error} role="alert">
                  {errors.general}
                </p>
              )}

              <Button type="submit" loading={sending} className={styles.fullWidth}>
                Criar conta
              </Button>
            </form>

            <p className={styles.divider}>
              <span>ou</span>
            </p>

            {googleError && (
              <p className={styles.error} role="alert">
                {googleError}
              </p>
            )}
            <GoogleButton
              label="Continuar com o Google"
              hint={`Use a conta Google de ${invite.email}`}
              href={coordinatorGoogleUrl(token, TERMS_VERSION)}
              onClick={startGoogle}
            />
          </section>
        </main>
      )}
    </div>
  );
}

/** The `useSearchParams` inside only runs under a Suspense boundary. */
export default function CoordinatorSignupPage() {
  return (
    <Suspense>
      <CoordinatorSignup />
    </Suspense>
  );
}
