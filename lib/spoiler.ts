import type { Match } from "./types";

const formatters = new Map<string, Intl.DateTimeFormat>();

function calendarDay(d: Date, tz: string) {
  let f = formatters.get(tz);
  if (!f) {
    // en-CA formats as YYYY-MM-DD.
    f = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" });
    formatters.set(tz, f);
  }
  return f.format(d);
}

/** The day a timestamp falls on in the given time zone, as YYYY-MM-DD. */
export function dayKey(iso: string | Date, tz: string) {
  return calendarDay(typeof iso === "string" ? new Date(iso) : iso, tz);
}

export function todayKey(tz: string) {
  return dayKey(new Date(), tz);
}

export type DayView = {
  matches: Match[];
  prevDay: string | null;
  nextDay: string | null;
  firstDay: string | null;
};

export function buildDay(all: Match[], day: string, tz: string): DayView {
  const days = [...new Set(all.map((m) => dayKey(m.start, tz)))].sort();
  const todays = all.filter((m) => dayKey(m.start, tz) === day);

  return {
    matches: todays,
    prevDay: days.filter((d) => d < day).at(-1) ?? null,
    nextDay: days.find((d) => d > day) ?? null,
    firstDay: days[0] ?? null,
  };
}
