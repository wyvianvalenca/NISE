import type { ActionStatus, CoordAction } from "./coord-actions";

const STATUS_LABELS: Record<ActionStatus, string> = {
  awaiting_registrations: "Aguardando inscrições",
  awaiting_event: "Aguardando evento",
  awaiting_attendance: "Aguardando presença",
  concluded: "Concluída",
};

const TYPE_LABELS: Record<string, string> = {
  oficina: "Oficina",
  palestra: "Palestra",
  minicurso: "Minicurso",
  hackathon: "Hackathon",
  visita: "Visita",
  acolhimento: "Acolhimento",
  outro: "Outro",
};

/** Text of the status chip. The status itself comes ready from the back-end. */
export function statusLabel(status: ActionStatus): string {
  return STATUS_LABELS[status];
}

/** "Oficina", from the stored type; an unknown type shows as it came. */
export function typeLabel(type: string): string {
  return TYPE_LABELS[type] ?? type;
}

function shortDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** "24/10", for the step texts. */
export function dayMonthLabel(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}

/**
 * "sáb, 24/10/2026", or "sáb, 24/10/2026 a dom, 25/10/2026" for a range. Dates
 * are read in UTC so they do not slip a day in Maceió's zone.
 */
export function dateRangeLabel(startsOn: string, endsOn: string): string {
  const weekday = (iso: string) =>
    new Date(`${iso}T00:00:00Z`)
      .toLocaleDateString("pt-BR", { weekday: "short", timeZone: "UTC" })
      .replace(".", "");
  const day = (iso: string) => `${weekday(iso)}, ${shortDate(iso)}`;
  return startsOn === endsOn ? day(startsOn) : `${day(startsOn)} a ${day(endsOn)}`;
}

function hour(time: string): string {
  const [h, m] = time.split(":");
  return m === "00" ? `${Number(h)}h` : `${Number(h)}h${m}`;
}

/** "14h às 17h30". */
export function timeRangeLabel(startsAtTime: string, endsAtTime: string): string {
  return `${hour(startsAtTime)} às ${hour(endsAtTime)}`;
}

/** "Presencial · Maceió", or "Online". */
export function formatLabel(action: Pick<CoordAction, "format" | "cityName">): string {
  return action.format === "online" ? "Online" : `Presencial · ${action.cityName}`;
}

/** Text of the visibility line. */
export function visibilityLabel(visibility: CoordAction["visibility"]): string {
  return visibility === "open" ? "Aberta ao público" : "Fechada ao público";
}

/** "1 inscrita" / "23 inscritas". */
export function countLabel(count: number): string {
  return count === 1 ? "1 inscrita" : `${count} inscritas`;
}

const STATUS_GROUP_LABELS: Record<ActionStatus, string> = {
  awaiting_registrations: "Aguardando inscrições",
  awaiting_event: "Aguardando evento",
  awaiting_attendance: "Aguardando presença",
  concluded: "Concluídas",
};

/** Heading of a status group on the list, and the text of its filter chip. */
export function statusGroupLabel(status: ActionStatus): string {
  return STATUS_GROUP_LABELS[status];
}

/**
 * The date tile of a list row: "24", "out", "sáb". Read in UTC, like the other
 * date labels, so it does not slip a day in Maceió's zone.
 */
export function dateTileParts(iso: string): { day: string; month: string; weekday: string } {
  const date = new Date(`${iso}T00:00:00Z`);
  const part = (options: Intl.DateTimeFormatOptions) =>
    date.toLocaleDateString("pt-BR", { ...options, timeZone: "UTC" }).replace(".", "");
  return {
    day: part({ day: "2-digit" }),
    month: part({ month: "short" }),
    weekday: part({ weekday: "short" }),
  };
}

/** "Aberta" or "Fechada", the short visibility of the list rows. */
export function shortVisibilityLabel(visibility: CoordAction["visibility"]): string {
  return visibility === "open" ? "Aberta" : "Fechada";
}

/**
 * The line about the girls in a list row: "Sem inscritas ainda", "26 inscritas"
 * or "22 de 30 presentes". The presence count only shows when it exists.
 */
export function girlsLabel(
  action: Pick<CoordAction, "status" | "registeredCount" | "presentCount">,
): string {
  if (action.status === "awaiting_registrations") return "Sem inscritas ainda";
  if (action.status === "concluded" && action.presentCount !== null) {
    return `${action.presentCount} de ${action.registeredCount} presentes`;
  }
  return countLabel(action.registeredCount);
}

/** Lower case and no accents, so a search finds "robótica" typing "ROBOTICA". */
export function comparableText(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}
