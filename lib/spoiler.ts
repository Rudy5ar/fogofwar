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

export const isSwissBlock = (block: string) => /swiss/i.test(block);

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

  const swiss = all.some((m) => isSwissBlock(m.block));
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
    if (swiss) r.status = r.wins >= SWISS_TARGET ? "qualified" : r.losses >= SWISS_TARGET ? "eliminated" : null;
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

/** Wins that qualify a team out of Swiss, and losses that eliminate it. */
export const SWISS_TARGET = 3;

export type SwissBox =
  | { kind: "pool"; wins: number; losses: number; slots: BracketSlot[]; open: number }
  | { kind: "qualified" | "eliminated"; wins: number; losses: number; teams: Team[]; open: number };

/** One column per number of games played; boxes run from the best record to the worst. */
export type SwissColumn = { games: number; boxes: SwissBox[] };

export type SwissView = {
  columns: SwissColumn[];
  /** False until the first Swiss match is on or before the chosen day. */
  started: boolean;
};

const choose = (n: number, k: number) => {
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
  return r;
};

/**
 * How many teams pass through each record in a standard Swiss. The sizes are fixed by the format,
 * so empty slots give nothing away. Returns null for fields that don't split evenly (unusual formats).
 */
function swissSizes(teams: number) {
  const at = (w: number, l: number) => (teams * choose(w + l, w)) / 2 ** (w + l);
  const sizes = new Map<string, number>();
  for (let w = 0; w <= SWISS_TARGET; w++) {
    for (let l = 0; l <= SWISS_TARGET; l++) {
      if (w === SWISS_TARGET && l === SWISS_TARGET) continue;
      // Teams finishing on 3-l (or w-3) are the winners (or losers) of the pool one game before.
      const n = w === SWISS_TARGET ? at(w - 1, l) / 2 : l === SWISS_TARGET ? at(w, l - 1) / 2 : at(w, l);
      if (!Number.isInteger(n) || (w < SWISS_TARGET && l < SWISS_TARGET && n % 2)) return null;
      sizes.set(`${w}-${l}`, n);
    }
  }
  return sizes;
}

/**
 * The Swiss stage laid out by record. Records come only from counted matches,
 * so a match is placed only once its teams' earlier results are known.
 */
export function buildSwiss(all: Match[], view: DayView, day: string, tz: string): SwissView {
  const todayById = new Map(view.matches.map((m) => [m.id, m]));
  const countedIds = new Set(view.counted.map((m) => m.id));
  const swissMatches = all.filter((m) => isSwissBlock(m.block));
  // The field size is public before the stage starts, so counting every team (even from later days) is safe.
  const sizes = swissSizes(new Set(swissMatches.flatMap((m) => m.teams.filter((t) => !isTbd(t)).map((t) => t.code))).size);

  const records = new Map<string, { team: Team; wins: number; losses: number }>();
  const record = (t: Team) => {
    let r = records.get(t.code);
    if (!r) records.set(t.code, (r = { team: t, wins: 0, losses: 0 }));
    return r;
  };
  const pools = new Map<string, BracketSlot[]>();
  let started = false;

  for (const m of swissMatches) {
    const d = dayKey(m.start, tz);
    if (d > day) continue;
    const today = todayById.get(m.id);
    if (m.teams.some(isTbd) || today?.teamsConcealed) {
      if (today) started = true;
      continue;
    }
    const [a, b] = [record(m.teams[0]), record(m.teams[1])];
    const key = `${a.wins}-${a.losses}`;
    const result = countedIds.has(m.id) ? m.result : null;
    pools.set(key, [...(pools.get(key) ?? []), { id: m.id, day: d, teams: m.teams, result, bestOf: m.bestOf, isToday: d === day }]);
    if (result) {
      const [w, l] = result.winner === 0 ? [a, b] : [b, a];
      w.wins++;
      l.losses++;
    }
  }

  const finished = [...records.values()];
  const columns: SwissColumn[] = [];
  for (let games = 0; games < SWISS_TARGET * 2; games++) {
    const boxes: SwissBox[] = [];
    for (let wins = Math.min(games, SWISS_TARGET); wins >= 0 && games - wins <= SWISS_TARGET; wins--) {
      const losses = games - wins;
      const expected = sizes?.get(`${wins}-${losses}`) ?? 0;
      if (wins === SWISS_TARGET || losses === SWISS_TARGET) {
        const teams = finished.filter((r) => r.wins === wins && r.losses === losses).map((r) => r.team);
        const kind = wins === SWISS_TARGET ? "qualified" : "eliminated";
        if (teams.length || expected) boxes.push({ kind, wins, losses, teams, open: Math.max(0, expected - teams.length) });
      } else {
        const slots = pools.get(`${wins}-${losses}`) ?? [];
        if (slots.length || expected) boxes.push({ kind: "pool", wins, losses, slots, open: Math.max(0, expected / 2 - slots.length) });
      }
    }
    if (boxes.length) columns.push({ games, boxes });
  }
  return { columns, started: started || pools.size > 0 };
}
