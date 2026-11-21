"use client";

import { useRouter, useSearchParams } from "next/navigation";
import {
  Suspense,
  useCallback,
  useEffect,
  useState,
  type FormEvent,
} from "react";
import { AppHeader } from "@/components/AppHeader";
import { Button, LinkButton } from "@/components/Button";
import { Field } from "@/components/Field";
import { LoadFailed } from "@/components/LoadFailed";
import { Loading } from "@/components/Loading";
import { checkResetLink, resetPassword } from "@/lib/access-api";
import { MINIMUM_PASSWORD_LENGTH } from "@/lib/signup-api";
import styles from "../entrar.module.css";

/** What the link turned out to be: still loading, its account, or a dead end. */
type LinkState = "loading" | "invalid" | "failed" | { email: string };

type Errors = {
  password?: string;
  repeat?: string;
  general?: string;
};

const TOO_SHORT_ERROR = `A senha precisa de pelo menos ${MINIMUM_PASSWORD_LENGTH} caracteres.`;
const NETWORK_ERROR = "Não deu pra salvar agora. Tente de novo.";

/**
 * A16b "Crie uma nova senha" (Figma 660:610), issue #331. She arrives from the
 * email link, `/entrar/nova-senha?token=…`.
 *
 * The Figma only draws the valid link. An expired, used or unknown link shows
 * a message in the same layout, with the way out: asking for a new one (A16).
 */
function NewPassword() {
  const router = useRouter();
  const token = useSearchParams().get("token") ?? "";

  const [link, setLink] = useState<LinkState>(token ? "loading" : "invalid");
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [sending, setSending] = useState(false);

  const load = useCallback(
    (signal?: AbortSignal) => {
      checkResetLink(token, signal)
        .then((result) => {
          if (result.ok) {
            setLink({ email: result.email });
          } else {
            setLink(result.reason === "invalid_link" ? "invalid" : "failed");
          }
        })
        .catch(() => {
          if (!signal?.aborted) {
            setLink("failed");
          }
        });
    },
    [token],
  );

  useEffect(() => {
    if (!token) {
      return;
    }
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [token, load]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const found: Errors = {};
    if (password.length < MINIMUM_PASSWORD_LENGTH) {
      found.password = TOO_SHORT_ERROR;
    } else if (repeat !== password) {
      found.repeat = "As senhas não são iguais.";
    }

    setErrors(found);
    if (Object.keys(found).length > 0) {
      return;
    }

    setSending(true);
    try {
      const result = await resetPassword(token, password);

      if (result.ok) {
        // replace: the link is spent, "voltar" should not come back here.
        router.replace(result.nextPath);
        return;
      }

      setSending(false);
      switch (result.reason) {
        case "invalid_link":
          // It expired while she typed, or was used in another tab.
          setLink("invalid");
          break;
        case "password_too_short":
          setErrors({ password: TOO_SHORT_ERROR });
          break;
        default:
          setErrors({ general: NETWORK_ERROR });
      }
    } catch {
      setSending(false);
      setErrors({ general: NETWORK_ERROR });
    }
  }

  if (link === "loading") {
    return (
      <div className={styles.page}>
        <AppHeader />
        <Loading />
      </div>
    );
  }

  if (link === "failed") {
    return (
      <LoadFailed
        onRetry={() => {
          setLink("loading");
          load();
        }}
      />
    );
  }

  return (
    <div className={styles.page}>
      <AppHeader />

      <main className={styles.main}>
        {link === "invalid" ? (
          <>
            <h1 className={styles.title}>Esse link não vale mais</h1>
            <p className={styles.lead}>
              Ele venceu ou já foi usado. Peça um link novo pra criar sua
              senha.
            </p>
            <LinkButton href="/entrar/recuperar" className={styles.messageAction}>
              Pedir um link novo
            </LinkButton>
          </>
        ) : (
          <>
            <h1 className={styles.title}>Crie uma nova senha</h1>
            <p className={styles.lead}>
              Pra conta {link.email}. Use pelo menos {MINIMUM_PASSWORD_LENGTH}{" "}
              caracteres.
            </p>

            <form className={styles.form} onSubmit={submit} noValidate>
              <Field
                label="Nova senha"
                type="password"
                autoComplete="new-password"
                onValueChange={setPassword}
                error={errors.password}
                required
              />
              <Field
                label="Repita a nova senha"
                type="password"
                autoComplete="new-password"
                onValueChange={setRepeat}
                error={errors.repeat}
                required
              />

              {errors.general && (
                <p className={styles.error} role="alert">
                  {errors.general}
                </p>
              )}

              <Button
                type="submit"
                loading={sending}
                className={styles.fullWidth}
              >
                Salvar e entrar
              </Button>
            </form>
          </>
        )}
      </main>
    </div>
  );
}

/**
 * A16b's wrapper. The `useSearchParams` inside only runs under a Suspense
 * boundary; without one, the whole page stops being statically generated.
 */
export default function NewPasswordPage() {
  return (
    <Suspense>
      <NewPassword />
    </Suspense>
  );
}
