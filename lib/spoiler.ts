import type { Match, Team } from "./types";

// A broadcast day runs past midnight (an NA-hosted Worlds ends around 04:00 in Europe), so a day starts at 06:00 local.
const DAY_START_HOUR = 6;

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

/** The broadcast day a timestamp belongs to in the chosen time zone, as YYYY-MM-DD. */
export function dayKey(iso: string | Date, tz: string) {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return calendarDay(new Date(d.getTime() - DAY_START_HOUR * 3_600_000), tz);
}

/** True for a match that is on the chosen day's broadcast but after midnight. */
export function isAfterMidnight(iso: string, tz: string) {
  return calendarDay(new Date(iso), tz) !== dayKey(iso, tz);
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

export type BracketSlot = {
  id: string;
  /** null for matches after the chosen day: they render as TBD with no date. */
  day: string | null;
  teams: [Team | null, Team | null];
  result: Match["result"];
  bestOf: number;
  isToday: boolean;
};

export type BracketColumn = { block: string; slots: BracketSlot[] };

export function buildBracket(all: Match[], view: DayView, day: string, tz: string): BracketColumn[] {
  const todayById = new Map(view.matches.map((m) => [m.id, m]));
  const columns: BracketColumn[] = [];

  for (const m of all) {
    if (isTableBlock(m.block)) continue;
    let col = columns.find((c) => c.block === m.block);
    if (!col) columns.push((col = { block: m.block, slots: [] }));

    const d = dayKey(m.start, tz);
    const today = todayById.get(m.id);
    const show = (t: Team) => (isTbd(t) ? null : t);
    let slot: BracketSlot;
    if (d < day) {
      slot = { id: m.id, day: d, teams: [show(m.teams[0]), show(m.teams[1])], result: m.result, bestOf: m.bestOf, isToday: false };
    } else if (today) {
      const teams: BracketSlot["teams"] = today.teamsConcealed ? [null, null] : [show(m.teams[0]), show(m.teams[1])];
      slot = { id: m.id, day: d, teams, result: today.revealed ? m.result : null, bestOf: m.bestOf, isToday: true };
    } else {
      slot = { id: m.id, day: null, teams: [null, null], result: null, bestOf: m.bestOf, isToday: false };
    }
    col.slots.push(slot);
  }
  return columns;
}
