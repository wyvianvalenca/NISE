/**
 * NISE's age rule (RN-03, RF-F7.01): only girls who are already 13 can sign up.
 *
 * It lives in one place because the email sign-up (H1, #51) and the Google
 * sign-up (H2, #52) share it. Age is taken from today's date in the Maceió
 * time zone, and a girl turning 13 today passes.
 *
 * The server runs this check again; here we only avoid sending what would be
 * refused, so none of her data leaves the screen for nothing.
 */

export const MINIMUM_AGE = 13;

/** Today in Maceió, as "YYYY-MM-DD" (the format `en-CA` produces). */
export function todayInMaceio(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Maceio",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** Splits "YYYY-MM-DD" into numbers, refusing a date that cannot exist (like 30/02). */
function parts(date: string): [number, number, number] | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const probe = new Date(Date.UTC(year, month - 1, day));

  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  ) {
    return null;
  }

  return [year, month, day];
}

/**
 * Age in whole years on the reference date, or `null` when the birth date is
 * no good: wrong format, a day that does not exist, or in the future.
 */
export function ageOn(
  birthDate: string,
  reference: string = todayInMaceio(),
): number | null {
  const born = parts(birthDate);
  const today = parts(reference);

  if (!born || !today || birthDate > reference) {
    return null;
  }

  const [bornYear, bornMonth, bornDay] = born;
  const [year, month, day] = today;
  const birthdayStillToCome =
    month < bornMonth || (month === bornMonth && day < bornDay);

  return year - bornYear - (birthdayStillToCome ? 1 : 0);
}

/**
 * What to do with the date she typed.
 *
 * Three answers and not two, on purpose: a boolean would lump "wrong date"
 * together with "under 13", and someone typing 2090 instead of 2009 would be
 * sent to A02c as if she were a child — losing her session on the way.
 */
export type AgeCheck = "ok" | "under_13" | "invalid_date";

/** Decides between going on, refusing by age (RN-03), or asking for the date again. */
export function checkAge(
  birthDate: string,
  reference: string = todayInMaceio(),
): AgeCheck {
  const age = ageOn(birthDate, reference);

  if (age === null) {
    return "invalid_date";
  }
  return age >= MINIMUM_AGE ? "ok" : "under_13";
}
