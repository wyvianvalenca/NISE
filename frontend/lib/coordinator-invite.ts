import { MINIMUM_PASSWORD_LENGTH } from "@/lib/signup-api";

/**
 * Data of a coordinator invite for CV02 (#455). The format is the one the
 * back-end returns from POST /api/auth/coordinator-invite/check.
 */
export type CoordinatorInvite = {
  name: string;
  email: string;
  group_name: string;
  /** ISO date and time; the invite is valid for 7 days (RN-35). */
  expires_at: string;
};

export type CreateCoordinatorResult =
  | { ok: true; nextPath: string }
  | { ok: false; reason: "password_too_short" | "failed" };

/** Messages for the `erro` code the Google callback puts in the URL. */
export const GOOGLE_ERRORS: Record<string, string> = {
  google_email_mismatch:
    "Essa conta Google não é a do convite. Use a conta com o e-mail do convite.",
  google: "Não deu pra entrar com o Google agora. Tente de novo.",
  terms_not_accepted:
    "Marque que leu e aceita os termos de uso e a política de privacidade.",
  terms_outdated: "Os termos mudaram. Recarregue a página e tente de novo.",
};

export const PASSWORD_TOO_SHORT = `A senha precisa de pelo menos ${MINIMUM_PASSWORD_LENGTH} caracteres.`;

/** "12 de dezembro", the way "Vale até" shows it. */
export function formatValidUntil(isoDate: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "numeric",
    month: "long",
    timeZone: "America/Maceio",
  }).format(new Date(isoDate));
}

// TODO(#455 integracao): the functions below return sample data. The
// integration layer swaps them for the real routes.

/** Sample invite, fictional. `null` means the link does not work. */
export async function getCoordinatorInvite(
  token: string,
): Promise<CoordinatorInvite | null> {
  if (!token) {
    return null;
  }
  return {
    name: "Ana Exemplo",
    email: "ana.exemplo@example.com",
    group_name: "Grupo Exemplo",
    expires_at: "2026-12-12T12:00:00-03:00",
  };
}

export async function createCoordinatorAccount(data: {
  token: string;
  name: string;
  password: string;
  acceptedTerms: boolean;
  termsVersion: string;
}): Promise<CreateCoordinatorResult> {
  if (data.password.length < MINIMUM_PASSWORD_LENGTH) {
    return { ok: false, reason: "password_too_short" };
  }
  return { ok: true, nextPath: "/coordenacao/acoes" };
}

/** Where "Continuar com o Google" leads (the back-end redirects to Google). */
export function coordinatorGoogleUrl(
  token: string,
  termsVersion: string,
): string {
  const query = new URLSearchParams({
    coordinator_invite: token,
    terms_version: termsVersion,
  });
  return `/api/auth/google/login?${query.toString()}`;
}
