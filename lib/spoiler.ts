import type { Match, Team } from "./types";

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

// Round-robin and Swiss blocks produce a table; everything else (Playoffs, Knockouts, Finals...) is a bracket.
const TABLE_BLOCK = /^(week|swiss|groups?|round \d|regional qualifier)/i;

export function isTableBlock(block: string) {
  return TABLE_BLOCK.test(block);
}

export const isTbd = (t: Team) => t.code === "TBD";

export type DayMatch = Match & {
  /** Teams stay hidden: showing them would reveal the winner of an earlier, unrevealed match today. */
  teamsConcealed: boolean;
  revealed: boolean;
};

export type DayView = {
  matches: DayMatch[];
  prevDay: string | null;
  nextDay: string | null;
  firstDay: string | null;
  /** Matches whose results count: everything before the day, plus what has been revealed on it. */
  counted: Match[];
};

export function buildDay(all: Match[], day: string, revealed: Set<string>, tz: string): DayView {
  const days = [...new Set(all.map((m) => dayKey(m.start, tz)))].sort();
  const todays = all.filter((m) => dayKey(m.start, tz) === day);

  const matches: DayMatch[] = [];
  for (const m of todays) {
    const codes = m.teams.filter((t) => !isTbd(t)).map((t) => t.code);
    const teamsConcealed = matches.some(
      (earlier) => !earlier.revealed && earlier.teams.some((t) => codes.includes(t.code)),
    );
    matches.push({ ...m, teamsConcealed, revealed: m.state === "completed" && revealed.has(m.id) && !teamsConcealed });
  }

  const counted = [
    ...all.filter((m) => dayKey(m.start, tz) < day && m.result),
    ...matches.filter((m) => m.revealed),
  ];

  return {
    matches,
    prevDay: days.filter((d) => d < day).at(-1) ?? null,
    nextDay: days.find((d) => d > day) ?? null,
    firstDay: days[0] ?? null,
    counted,
  };
}

export type StandingRow = {
  team: Team;
  wins: number;
  losses: number;
  rank: number;
  status: "qualified" | "eliminated" | null;
};

/** W-L table built only from counted matches. Teams appear once they've been seen on or before the day. */
export function buildStandings(all: Match[], view: DayView, day: string, tz: string): StandingRow[] {
  const rows = new Map<string, StandingRow>();
  const add = (t: Team) => {
    if (!isTbd(t) && !rows.has(t.code)) rows.set(t.code, { team: t, wins: 0, losses: 0, rank: 0, status: null });
  };

  for (const m of all) {
    if (isTableBlock(m.block) && dayKey(m.start, tz) < day) m.teams.forEach(add);
  }
  for (const m of view.matches) {
    if (isTableBlock(m.block) && !m.teamsConcealed) m.teams.forEach(add);
  }

  const swiss = all.some((m) => /swiss/i.test(m.block));
  for (const m of view.counted) {
    if (!isTableBlock(m.block) || !m.result) continue;
    const w = rows.get(m.teams[m.result.winner].code);
    const l = rows.get(m.teams[1 - m.result.winner].code);
    if (w) w.wins++;
    if (l) l.losses++;
  }

  const sorted = [...rows.values()].sort(
    (a, b) => b.wins - a.wins || a.losses - b.losses || a.team.name.localeCompare(b.team.name),
  );
  sorted.forEach((r, i) => {
    const prev = sorted[i - 1];
    r.rank = prev && prev.wins === r.wins && prev.losses === r.losses ? prev.rank : i + 1;
    if (swiss) r.status = r.wins >= 3 ? "qualified" : r.losses >= 3 ? "eliminated" : null;
  });
  return sorted;
}
