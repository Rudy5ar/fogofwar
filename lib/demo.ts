import { addDays, todayKey } from "./spoiler";
import type { Match, MatchResult, Team, Tournament } from "./types";

// Made-up tournaments with fictional teams, for trying the app and taking screenshots without spoiling
// anything real. Opened with ?demo. Same format as Worlds: a double-elimination play-in, a 16-team Swiss
// stage and an 8-team knockout. "Live" runs up to today's last Swiss round; "Finished" ended weeks ago.

const TEAMS: [code: string, name: string, color: string][] = [
  ["AUR", "Aurora Vanguard", "#4cc9f0"],
  ["BSK", "Basalt Kings", "#e76f51"],
  ["CBH", "Cobalt Herons", "#4361ee"],
  ["DSK", "Duskfall", "#9d4edd"],
  ["EMB", "Ember Lotus", "#f4a261"],
  ["FRL", "Frostline", "#90e0ef"],
  ["GLO", "Gilded Owls", "#e9c46a"],
  ["HAL", "Halcyon Esports", "#2a9d8f"],
  ["IRV", "Ironvale", "#adb5bd"],
  ["JCM", "Jade Comets", "#52b788"],
  ["KES", "Kestrel Gaming", "#d62828"],
  ["LMR", "Lumen Rift", "#ffd166"],
  ["MON", "Monsoon", "#118ab2"],
  ["NJR", "Nightjar", "#6c757d"],
  ["ONX", "Onyx Tide", "#3a86ff"],
  // The last four start in the play-in.
  ["PLR", "Polaris Five", "#c77dff"],
  ["QZR", "Quartz Ravens", "#ff70a6"],
  ["SLT", "Saltmarsh Sirens", "#06d6a0"],
  ["TDB", "Tidebreak", "#ef476f"],
];

const SHAPES = [
  '<circle cx="32" cy="32" r="28"/>',
  '<rect x="6" y="6" width="52" height="52" rx="14"/>',
  '<path d="M32 4 56 13v19c0 14-10 23-24 28C18 55 8 46 8 32V13Z"/>',
  '<path d="M32 4 58 19v26L32 60 6 45V19Z"/>',
];

function logo(i: number) {
  const [code, , color] = TEAMS[i];
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><g fill="${color}">${SHAPES[i % SHAPES.length]}</g>` +
    `<text x="32" y="41" text-anchor="middle" font-family="Arial,sans-serif" font-weight="700" font-size="24" fill="#0a0e1a">${code[0]}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

const team = (i: number): Team => ({ code: TEAMS[i][0], name: TEAMS[i][1], image: logo(i) });
const TBD: Team = { code: "TBD", name: "TBD", image: "" };

/** Small seeded generator, so every visit sees the same results. */
function random(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Series = { day: number; block: string; bestOf: number; a: number; b: number; result: MatchResult };

// Day numbers from the tournament's first day. The gaps are rest days.
const PLAY_IN_DAYS = [0, 1, 2];
const SWISS_DAYS = [[4], [5], [6, 7], [8, 9], [10]];
const QF_DAYS = [13, 13, 14, 14];
const SF_DAYS = [16, 17];
const FINAL_DAY = 20;

function simulate(seed: number): Series[] {
  const rand = random(seed);
  const rating = TEAMS.map((_, i) => 1650 - i * 12 + rand() * 140);
  const out: Series[] = [];

  const play = (day: number, block: string, bestOf: number, a: number, b: number) => {
    const need = Math.ceil(bestOf / 2);
    const p = 1 / (1 + 10 ** ((rating[b] - rating[a]) / 400));
    const wins: [number, number] = [0, 0];
    while (wins[0] < need && wins[1] < need) wins[rand() < p ? 0 : 1]++;
    const result: MatchResult = { wins, winner: wins[0] > wins[1] ? 0 : 1 };
    out.push({ day, block, bestOf, a, b, result });
    return result.winner === 0 ? [a, b] : [b, a];
  };

  // Play-in: double elimination; the winner joins the Swiss stage.
  const [d0, d1, d2] = PLAY_IN_DAYS;
  const [w1, l1] = play(d0, "Play-Ins", 5, 15, 18);
  const [w2, l2] = play(d0, "Play-Ins", 5, 16, 17);
  const [upper, upperLoser] = play(d1, "Play-Ins", 5, w1, w2);
  const [lower] = play(d1, "Play-Ins", 5, l1, l2);
  const [lowerFinal] = play(d2, "Play-Ins", 5, upperLoser, lower);
  const [playInWinner] = play(d2, "Play-Ins", 5, upper, lowerFinal);

  // Swiss: teams on the same record meet, avoiding rematches; three wins qualify, three losses eliminate.
  const field = [...Array(15).keys(), playInWinner];
  const record = new Map(field.map((t) => [t, { wins: 0, losses: 0, met: new Set<number>() }]));
  SWISS_DAYS.forEach((days, round) => {
    const pools = new Map<string, number[]>();
    for (const t of field) {
      const r = record.get(t)!;
      if (r.wins < 3 && r.losses < 3) pools.set(`${r.wins}-${r.losses}`, [...(pools.get(`${r.wins}-${r.losses}`) ?? []), t]);
    }
    const pairs: [number, number][] = [];
    for (const pool of [...pools.values()]) {
      while (pool.length > 1) {
        const a = pool.shift()!;
        const fresh = pool.findIndex((b) => !record.get(a)!.met.has(b));
        pairs.push([a, pool.splice(Math.max(fresh, 0), 1)[0]]);
      }
    }
    const perDay = Math.ceil(pairs.length / days.length);
    pairs.forEach(([a, b], k) => {
      const [w, l] = play(days[Math.floor(k / perDay)], "Swiss", round < 2 ? 1 : 3, a, b);
      record.get(w)!.wins++;
      record.get(l)!.losses++;
      record.get(a)!.met.add(b);
      record.get(b)!.met.add(a);
    });
  });

  // Knockout: best Swiss records seeded against the worst.
  const seeds = field
    .filter((t) => record.get(t)!.wins === 3)
    .sort((a, b) => record.get(a)!.losses - record.get(b)!.losses || a - b);
  const qf = [
    [seeds[0], seeds[7]],
    [seeds[3], seeds[4]],
    [seeds[1], seeds[6]],
    [seeds[2], seeds[5]],
  ].map(([a, b], i) => play(QF_DAYS[i], "Quarterfinals", 5, a, b)[0]);
  const sf = [play(SF_DAYS[0], "Semifinals", 5, qf[0], qf[1])[0], play(SF_DAYS[1], "Semifinals", 5, qf[2], qf[3])[0]];
  play(FINAL_DAY, "Finals", 5, sf[0], sf[1]);
  return out;
}

/** Minutes east of UTC for a zone at a moment. */
function zoneOffset(at: number, tz: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(new Date(at));
  const get = (type: string) => Number(parts.find((p) => p.type === type)!.value);
  return (Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute")) - at) / 60_000;
}

/** A local wall-clock time in the zone, as an ISO instant. */
function localTime(day: string, minutes: number, tz: string) {
  const guess = Date.parse(`${day}T00:00:00Z`) + minutes * 60_000;
  return new Date(guess - zoneOffset(guess, tz) * 60_000).toISOString();
}

const TOURNAMENTS = [
  { id: "demo-live", name: "Demo Cup · in progress", seed: 7, today: SWISS_DAYS[4][0] },
  { id: "demo-done", name: "Demo Cup · finished", seed: 11, today: FINAL_DAY + 21 },
];

export function demoTournaments(tz: string): Tournament[] {
  const today = todayKey(tz);
  return TOURNAMENTS.map((t) => {
    const start = addDays(today, -t.today);
    return { id: t.id, slug: t.id, name: t.name, startDate: start, endDate: addDays(start, FINAL_DAY) };
  });
}

/**
 * Matches as the API would report them right now. In the live tournament, today's first match is over,
 * the second is being played and the third hasn't started; later matches have no teams yet.
 */
export function demoMatches(id: string, tz: string): Match[] {
  const t = TOURNAMENTS.find((x) => x.id === id);
  if (!t) return [];
  const start = addDays(todayKey(tz), -t.today);
  const byDay = new Map<number, number>();

  return simulate(t.seed).map((s, n): Match => {
    const slot = byDay.get(s.day) ?? 0;
    byDay.set(s.day, slot + 1);
    // Broadcasts start at 16:00 local; series are spaced by length.
    const gap = s.bestOf === 1 ? 60 : s.bestOf === 3 ? 150 : 240;
    const startIso = localTime(addDays(start, s.day), 16 * 60 + slot * gap, tz);

    const state: Match["state"] =
      s.day < t.today || (s.day === t.today && slot === 0)
        ? "completed"
        : s.day === t.today && slot === 1
          ? "inProgress"
          : "unstarted";
    const known = s.day <= t.today;
    return {
      id: `${id}-${n}`,
      start: startIso,
      state,
      block: s.block,
      bestOf: s.bestOf,
      teams: known ? [team(s.a), team(s.b)] : [TBD, TBD],
      result: state === "completed" ? s.result : null,
      // One game each way so far, capped below the series result.
      liveWins: state === "inProgress" ? [Math.min(s.result.wins[0], 1), Math.min(s.result.wins[1], 1)] : null,
    };
  }).sort((a, b) => a.start.localeCompare(b.start));
}
