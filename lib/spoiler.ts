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

const addDays = (day: string, n: number) =>
  new Date(Date.parse(`${day}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** Every calendar day from the first match day to the last, including days without matches. */
export function tournamentDays(all: Match[], tz: string) {
  if (!all.length) return [];
  const last = dayKey(all.at(-1)!.start, tz);
  const days: string[] = [];
  for (let d = dayKey(all[0].start, tz); d <= last; d = addDays(d, 1)) days.push(d);
  return days;
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
  /** The user asked to see it: the final score, the live score, or that it hasn't started. */
  shown: boolean;
  /** Shown and finished, so its result counts. */
  revealed: boolean;
};

export type DayView = {
  matches: DayMatch[];
  /** Calendar days, with or without matches. */
  prevDay: string | null;
  nextDay: string | null;
  nextMatchDay: string | null;
  /** Matches whose results count: everything before the day, plus what has been revealed on it. */
  counted: Match[];
  /**
   * Later matches whose teams can be shown: the draw. Only once the whole day is revealed, and only lineups
   * that follow from results already seen (no earlier stage still to play, no earlier match of either team).
   */
  draw: Set<string>;
};

export function buildDay(all: Match[], day: string, shown: Set<string>, tz: string): DayView {
  const matchDays = [...new Set(all.map((m) => dayKey(m.start, tz)))].sort();
  const todays = all.filter((m) => dayKey(m.start, tz) === day);

  const matches: DayMatch[] = [];
  for (const m of todays) {
    const codes = m.teams.filter((t) => !isTbd(t)).map((t) => t.code);
    const teamsConcealed = matches.some(
      (earlier) => !earlier.revealed && earlier.teams.some((t) => codes.includes(t.code)),
    );
    const isShown = shown.has(m.id) && !teamsConcealed;
    matches.push({ ...m, teamsConcealed, shown: isShown, revealed: isShown && m.state === "completed" });
  }

  const counted = [
    ...all.filter((m) => dayKey(m.start, tz) < day && m.result),
    ...matches.filter((m) => m.revealed),
  ];

  const draw = new Set<string>();
  if (matches.every((m) => m.revealed)) {
    const stageKey = (m: Match) => stageOf(m.block) ?? m.block;
    const stageStart = new Map<string, string>();
    for (const m of all) if (!stageStart.has(stageKey(m))) stageStart.set(stageKey(m), m.start);
    const pending = all.filter((m) => dayKey(m.start, tz) > day);
    for (const m of pending) {
      if (m.teams.some(isTbd)) continue;
      const stage = stageKey(m);
      const codes = m.teams.map((t) => t.code);
      const blocked = pending.some((p) =>
        stageKey(p) === stage
          ? p.start < m.start && p.teams.some((t) => codes.includes(t.code))
          : stageStart.get(stageKey(p))! < stageStart.get(stage)!,
      );
      if (!blocked) draw.add(m.id);
    }
  }

  return {
    matches,
    prevDay: matchDays.length && day > matchDays[0] ? addDays(day, -1) : null,
    nextDay: matchDays.length && day < matchDays.at(-1)! ? addDays(day, 1) : null,
    nextMatchDay: matchDays.find((d) => d > day) ?? null,
    counted,
    draw,
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

export type Stage = "playin" | "swiss" | "playoffs";

export const STAGES: { id: Stage; name: string }[] = [
  { id: "playin", name: "Play-In" },
  { id: "swiss", name: "Swiss" },
  { id: "playoffs", name: "Playoffs" },
];

/** The board a block is drawn on. Other table blocks (weeks, groups) only feed the standings. */
export function stageOf(block: string): Stage | null {
  if (/play.?in/i.test(block)) return "playin";
  if (isSwissBlock(block)) return "swiss";
  return isTableBlock(block) ? null : "playoffs";
}

export type BracketSlot = {
  id: string;
  day: string;
  teams: [Team | null, Team | null];
  result: Match["result"];
  bestOf: number;
  isToday: boolean;
};

export type BoardBox =
  | {
      kind: "pool";
      row: number;
      title: string | null;
      /** Swiss pools only: the record every team in the pool shares. */
      record: [number, number] | null;
      slots: BracketSlot[];
      open: number;
    }
  | { kind: "qualified" | "eliminated"; row: number; record: [number, number]; teams: Team[]; open: number };

export type BoardColumn = { col: number; title: string; boxes: BoardBox[] };

export type Board = {
  columns: BoardColumn[];
  /** Swiss boxes centre on their record (a diamond); bracket boxes keep fixed upper and lower rows. */
  layout: "diamond" | "rows";
};

/** Wins that qualify a team out of Swiss, and losses that eliminate it. */
export const SWISS_TARGET = 3;

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
 * so a match is placed only once its teams' earlier results are known (on the day, or as part of the draw).
 */
export function buildSwiss(all: Match[], view: DayView, day: string, tz: string): Board {
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

  for (const m of swissMatches) {
    const d = dayKey(m.start, tz);
    if ((d > day && !view.draw.has(m.id)) || m.teams.some(isTbd) || todayById.get(m.id)?.teamsConcealed) continue;
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
  const columns: BoardColumn[] = [];
  for (let games = 0; games < SWISS_TARGET * 2; games++) {
    const boxes: BoardBox[] = [];
    for (let wins = Math.min(games, SWISS_TARGET); wins >= 0 && games - wins <= SWISS_TARGET; wins--) {
      const losses = games - wins;
      const expected = sizes?.get(`${wins}-${losses}`) ?? 0;
      const row = boxes.length;
      if (wins === SWISS_TARGET || losses === SWISS_TARGET) {
        const teams = finished.filter((r) => r.wins === wins && r.losses === losses).map((r) => r.team);
        const kind = wins === SWISS_TARGET ? "qualified" : "eliminated";
        if (teams.length || expected) {
          boxes.push({ kind, row, record: [wins, losses], teams, open: Math.max(0, expected - teams.length) });
        }
      } else {
        const slots = pools.get(`${wins}-${losses}`) ?? [];
        if (slots.length || expected) {
          const open = Math.max(0, expected / 2 - slots.length);
          boxes.push({ kind: "pool", row, title: `${wins}–${losses}`, record: [wins, losses], slots, open });
        }
      }
    }
    const title = games < SWISS_TARGET * 2 - 1 ? `Round ${games + 1}` : "Final records";
    if (boxes.length) columns.push({ col: games, title, boxes });
  }
  return { columns, layout: "diamond" };
}

type Seat = { games: number; losses: number };
type Place = { col: number; row: number };

const isPow2 = (n: number) => n >= 2 && (n & (n - 1)) === 0;

/**
 * Where every match of a standard single- or double-elimination bracket sits: the column is the most games
 * either team has played in the stage, the row the fewest losses (upper or lower bracket). Both are fixed by
 * the format, whoever wins, and the format follows from the match count alone. Null for anything else.
 */
function bracketPlaces(matches: number): { double: boolean; places: Place[] } | null {
  const double = !isPow2(matches + 1);
  const teams = double ? (matches + 2) / 2 : matches + 1;
  if (!isPow2(teams) || (double && teams < 4)) return null;

  const places: Place[] = [];
  const round = (seats: Seat[]) => {
    const winners: Seat[] = [];
    const losers: Seat[] = [];
    for (let i = 0; i < seats.length; i += 2) {
      const [w, l] = [seats[i], seats[i + 1]];
      places.push({ col: Math.max(w.games, l.games), row: Math.min(w.losses, l.losses) });
      w.games++;
      l.games++;
      l.losses++;
      winners.push(w);
      losers.push(l);
    }
    return { winners, losers };
  };

  let upper: Seat[] = Array.from({ length: teams }, () => ({ games: 0, losses: 0 }));
  let lower: Seat[] = [];
  while (upper.length > 1) {
    const { winners, losers } = round(upper);
    upper = winners;
    if (!double) continue;
    // The first upper losers pair off; later ones drop in against the lower bracket's survivors.
    lower = round(lower.length ? lower.flatMap((s, i) => [s, losers[i]]) : losers).winners;
    while (lower.length > 1 && lower.length > upper.length / 2) lower = round(lower).winners;
  }
  if (double) round([upper[0], lower[0]]);
  return { double, places };
}

const ROUND_NAMES: Record<number, string> = { 1: "Final", 2: "Semifinals", 4: "Quarterfinals" };

/**
 * A play-in or playoff bracket laid out like the Swiss board. Like Swiss, a match is placed once its
 * teams are known and their earlier results counted; the rest stay as open slots the format predicts.
 * Brackets the format can't be worked out for get one column per block instead.
 */
export function buildBracket(stage: Match[], view: DayView, day: string, tz: string): Board {
  const todayById = new Map(view.matches.map((m) => [m.id, m]));
  const countedIds = new Set(view.counted.map((m) => m.id));
  const template = bracketPlaces(stage.length);
  const blocks = [...new Set(stage.map((m) => m.block))];
  const key = (p: Place) => `${p.col}-${p.row}`;

  const expected = new Map<string, number>();
  for (const p of template?.places ?? stage.map((m) => ({ col: blocks.indexOf(m.block), row: 0 }))) {
    expected.set(key(p), (expected.get(key(p)) ?? 0) + 1);
  }

  const seats = new Map<string, Seat>();
  const seat = (t: Team) => {
    let s = seats.get(t.code);
    if (!s) seats.set(t.code, (s = { games: 0, losses: 0 }));
    return s;
  };
  const placed = new Map<string, BracketSlot[]>();
  let hidden = 0;

  for (const m of stage) {
    const d = dayKey(m.start, tz);
    if ((d > day && !view.draw.has(m.id)) || m.teams.some(isTbd) || todayById.get(m.id)?.teamsConcealed) {
      hidden++;
      continue;
    }
    const [a, b] = [seat(m.teams[0]), seat(m.teams[1])];
    // The last match is the final even when a league's bracket strays from the standard one.
    const place = !template
      ? { col: blocks.indexOf(m.block), row: 0 }
      : m === stage.at(-1)
        ? template.places.at(-1)!
        : { col: Math.max(a.games, b.games), row: template.double ? Math.min(a.losses, b.losses) : 0 };
    const result = countedIds.has(m.id) ? m.result : null;
    placed.set(key(place), [
      ...(placed.get(key(place)) ?? []),
      { id: m.id, day: d, teams: m.teams, result, bestOf: m.bestOf, isToday: d === day },
    ]);
    if (result) {
      const [w, l] = result.winner === 0 ? [a, b] : [b, a];
      w.games++;
      l.games++;
      l.losses++;
    }
  }

  const places = [...new Set([...expected.keys(), ...placed.keys()])]
    .map((k) => {
      const [col, row] = k.split("-").map(Number);
      return { col, row };
    })
    .sort((p, q) => p.col - q.col || p.row - q.row);
  const lastCol = places.at(-1)?.col ?? 0;

  const columns: BoardColumn[] = [];
  for (const p of places) {
    const slots = placed.get(key(p)) ?? [];
    // Hidden matches fill the earliest gaps first, so a bracket that strays from the template has no phantom slots.
    const open = Math.min(Math.max(0, (expected.get(key(p)) ?? 0) - slots.length), hidden);
    hidden -= open;
    if (!slots.length && !open) continue;
    let column = columns.find((c) => c.col === p.col);
    if (!column) {
      const title = !template
        ? blocks[p.col]
        : template.double
          ? p.col === lastCol
            ? "Final"
            : `Round ${p.col + 1}`
          : ROUND_NAMES[expected.get(key(p)) ?? 0] ?? `Round ${p.col + 1}`;
      columns.push((column = { col: p.col, title, boxes: [] }));
    }
    const title = !template?.double
      ? null
      : p.col === lastCol
        ? "Grand final"
        : p.row === 0
          ? "Upper bracket"
          : "Lower bracket";
    column.boxes.push({ kind: "pool", row: p.row, title, record: null, slots, open });
  }
  return { columns, layout: "rows" };
}
