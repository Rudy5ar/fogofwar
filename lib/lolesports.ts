import "server-only";
import { LEAGUES } from "./leagues";
import type { Match, Team, Tournament } from "./types";

// Public key used by lolesports.com itself; the API is unofficial and undocumented.
const API_KEY = "0TvQnueqKa5mxJntVWt0w4LpLfEkrV1Ta8rQBb9Z";
const BASE = "https://esports-api.lolesports.com/persisted/gw";
const REVALIDATE_SECONDS = 300;
const MAX_PAGES = 20;

export function findLeague(slug: string) {
  return LEAGUES.find((l) => l.slug === slug);
}

async function gw<T>(path: string, params: Record<string, string>): Promise<T> {
  const query = new URLSearchParams({ hl: "en-US", ...params });
  const res = await fetch(`${BASE}/${path}?${query}`, {
    headers: { "x-api-key": API_KEY },
    next: { revalidate: REVALIDATE_SECONDS },
  });
  if (!res.ok) throw new Error(`LoL Esports API ${path} returned ${res.status}`);
  return res.json() as Promise<T>;
}

const UPPER_WORDS = new Set(["LEC", "LCK", "LPL", "LCS", "MSI"]);

function tournamentName(slug: string) {
  return slug
    .split("_")
    .map((w) => (UPPER_WORDS.has(w.toUpperCase()) ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1)))
    .join(" ");
}

// A few teams come back in all caps ("BILIBILI GAMING"); short acronyms like "LYON" or "CTBC" stay as they are.
const NAME_OVERRIDES: Record<string, string> = { GIANTX: "GiantX" };

function teamName(name: string) {
  if (NAME_OVERRIDES[name]) return NAME_OVERRIDES[name];
  if (name !== name.toUpperCase()) return name;
  return name
    .split(" ")
    .map((w) => (w.length > 4 ? w[0] + w.slice(1).toLowerCase() : w))
    .join(" ");
}

type RawTournament = { id: string; slug: string; startDate: string; endDate: string };

export async function getTournaments(leagueId: string): Promise<Tournament[]> {
  const data = await gw<{ data: { leagues: { tournaments: RawTournament[] }[] } }>(
    "getTournamentsForLeague",
    { leagueId },
  );
  return data.data.leagues[0].tournaments.map((t) => ({ ...t, name: tournamentName(t.slug) }));
}

type RawTeam = { name: string; code: string; image: string; result: { outcome: string | null; gameWins: number } | null };
type RawEvent = {
  startTime: string;
  state: Match["state"];
  type: string;
  blockName: string;
  match?: { id: string; teams: RawTeam[]; strategy: { count: number } };
};
type RawSchedule = { data: { schedule: { pages: { older: string | null }; events: RawEvent[] } } };

function toMatch(e: RawEvent): Match | null {
  if (e.type !== "match" || !e.match || e.match.teams.length !== 2) return null;
  const raw = e.match.teams;
  // Deliberately drop `record`: it is the team's W-L today, which would spoil any earlier day.
  const teams = raw.map(
    (t): Team => ({ code: t.code, name: teamName(t.name), image: t.image.replace(/^http:/, "https:") }),
  ) as [Team, Team];
  let result: Match["result"] = null;
  if (e.state === "completed" && raw[0].result && raw[1].result) {
    result = {
      wins: [raw[0].result.gameWins, raw[1].result.gameWins],
      winner: raw[0].result.outcome === "win" ? 0 : 1,
    };
  }
  return { id: e.match.id, start: e.startTime, state: e.state, block: e.blockName, bestOf: e.match.strategy.count, teams, result };
}

/** All matches of one tournament. The schedule is paged newest-first, so walk older pages until we pass its start. */
export async function getTournamentMatches(leagueId: string, t: Tournament): Promise<Match[]> {
  const from = new Date(`${t.startDate}T00:00:00Z`).getTime() - 86_400_000;
  const to = new Date(`${t.endDate}T00:00:00Z`).getTime() + 2 * 86_400_000;
  const byId = new Map<string, Match>();
  let pageToken: string | null = null;

  for (let page = 0; page < MAX_PAGES; page++) {
    const params: Record<string, string> = { leagueId };
    if (pageToken) params.pageToken = pageToken;
    const data = await gw<RawSchedule>("getSchedule", params);
    const { events, pages } = data.data.schedule;
    for (const e of events) {
      const time = new Date(e.startTime).getTime();
      if (time < from || time > to) continue;
      const m = toMatch(e);
      if (m) byId.set(m.id, m);
    }
    const oldest = events.length ? new Date(events[0].startTime).getTime() : 0;
    if (!pages.older || oldest < from) break;
    pageToken = pages.older;
  }
  return [...byId.values()].sort((a, b) => a.start.localeCompare(b.start));
}
