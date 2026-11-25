/**
 * Email format in the sign-up (RF-S2.03).
 *
 * The rule exists because "alana@gmail" is a common, silent mistake: she
 * thinks she typed it right and never receives anything. The server runs this
 * check again; here it is only so she finds out before sending.
 */

/** The exact wording of screen E01, shown on the field when the domain is missing. */
export const MISSING_DOMAIN_ERROR = "Inclua o domínio, como nome@exemplo.com";

/** `true` only with a local part, an at sign, and a domain with a dot and a 2+ letter end. */
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/.test(email.trim());
}

/**
 * The e-mail as the coordinator's lists show it. The record of a girl who deleted
 * her account (RF-F7.09, #394) keeps a placeholder address in the reserved
 * `.invalid` domain, which belongs to nobody, so the lists show a dash instead.
 */
export function shownEmail(email: string): string {
  return email.trim().toLowerCase().endsWith(".invalid") ? "—" : email;
}
