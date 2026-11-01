export type LeagueSlug = "worlds" | "msi" | "first_stand" | "lec" | "lck" | "lpl" | "lcs";
/** The real leagues, plus the made-up one behind ?demo. */
export type BoardLeague = LeagueSlug | "demo";

export type Team = {
  code: string;
  name: string;
  image: string;
};

export type MatchResult = {
  /** Game wins per side, same order as `teams`. */
  wins: [number, number];
  winner: 0 | 1;
};

export type Match = {
  id: string;
  start: string;
  state: "completed" | "inProgress" | "unstarted";
  block: string;
  bestOf: number;
  teams: [Team, Team];
  /** Only set when the match is completed. Never contains the API's live W-L records. */
  result: MatchResult | null;
  /** Game wins so far, only while the match is in progress. */
  liveWins: [number, number] | null;
};

export type Tournament = {
  id: string;
  slug: string;
  name: string;
  startDate: string;
  endDate: string;
};
