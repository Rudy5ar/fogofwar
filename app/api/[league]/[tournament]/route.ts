import { NextResponse } from "next/server";
import { findLeague, getTournamentMatches, getTournaments } from "@/lib/lolesports";

// Vercel's CDN answers repeat visits. Kept short: the schedule carries live game scores.
const CACHE = "public, s-maxage=60, stale-while-revalidate=60";

export async function GET(_req: Request, ctx: { params: Promise<{ league: string; tournament: string }> }) {
  const params = await ctx.params;
  const league = findLeague(params.league);
  if (!league) return NextResponse.json({ error: "Unknown event" }, { status: 404 });
  try {
    const tournament = (await getTournaments(league.id)).find((t) => t.id === params.tournament);
    if (!tournament) return NextResponse.json({ error: "Unknown tournament" }, { status: 404 });
    const matches = await getTournamentMatches(league.id, tournament);
    return NextResponse.json({ matches }, { headers: { "Cache-Control": CACHE } });
  } catch {
    return NextResponse.json({ error: "Couldn’t load the schedule" }, { status: 502 });
  }
}
