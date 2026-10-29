// Everything is per device. Storage can throw (private mode, blocked site data), so every access is guarded.

const ASK_AGAIN_AFTER_MS = 12 * 60 * 60 * 1000;

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Not fatal: the app still works, it just won't remember.
  }
}

export const store = {
  league: () => read("sf:league"),
  setLeague: (slug: string) => write("sf:league", slug),

  tournament: (league: string) => read(`sf:tournament:${league}`),
  setTournament: (league: string, id: string) => write(`sf:tournament:${league}`, id),

  day: (tournament: string) => read(`sf:day:${tournament}`),
  setDay: (tournament: string, day: string) => write(`sf:day:${tournament}`, day),

  // The "last day watched" answer holds for a while, so reopening the site soon after skips the question.
  askedRecently(tournament: string) {
    const at = Number(read(`sf:asked:${tournament}`));
    return Number.isFinite(at) && Date.now() - at < ASK_AGAIN_AFTER_MS;
  },
  setAsked: (tournament: string) => write(`sf:asked:${tournament}`, String(Date.now())),

  timeZone: () => read("sf:timezone"),
  setTimeZone: (tz: string) => write("sf:timezone", tz),

  revealed(): Set<string> {
    try {
      return new Set(JSON.parse(read("sf:revealed") ?? "[]") as string[]);
    } catch {
      return new Set();
    }
  },
  setRevealed: (ids: Set<string>) => write("sf:revealed", JSON.stringify([...ids])),
};
