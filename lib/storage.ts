// Everything is per device. Storage can throw (private mode, blocked site data), so every access is guarded.

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

  revealed(): Set<string> {
    try {
      return new Set(JSON.parse(read("sf:revealed") ?? "[]") as string[]);
    } catch {
      return new Set();
    }
  },
  setRevealed: (ids: Set<string>) => write("sf:revealed", JSON.stringify([...ids])),
};
