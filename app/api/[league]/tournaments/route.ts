import { NextResponse } from "next/server";
import { findLeague, getTournaments } from "@/lib/lolesports";

// Vercel's CDN answers repeat visits; the list only changes when a tournament starts.
const CACHE = "public, s-maxage=300, stale-while-revalidate=3600";

export async function GET(_req: Request, ctx: { params: Promise<{ league: string }> }) {
  const league = findLeague((await ctx.params).league);
  if (!league) return NextResponse.json({ error: "Unknown event" }, { status: 404 });
  try {
    const today = new Date().toISOString().slice(0, 10);
    // Tournaments that haven't started have nothing to show yet.
    const tournaments = (await getTournaments(league.id)).filter((t) => t.startDate <= today);
    return NextResponse.json({ tournaments }, { headers: { "Cache-Control": CACHE } });
  } catch {
    return NextResponse.json({ error: "Couldn’t load the schedule" }, { status: 502 });
  }
}
