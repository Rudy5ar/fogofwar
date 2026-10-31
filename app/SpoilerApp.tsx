"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { LEAGUES } from "@/lib/leagues";
import {
  buildBracket,
  buildDay,
  buildStandings,
  buildSwiss,
  dayKey,
  isAfterMidnight,
  isSwissBlock,
  isTableBlock,
  todayKey,
  type DayMatch,
  type DayView,
} from "@/lib/spoiler";
import { store } from "@/lib/storage";
import type { LeagueSlug, Match, Team, Tournament } from "@/lib/types";
import { Bracket } from "./Bracket";
import { Icon } from "./Icon";
import { SwissBoard } from "./SwissBoard";
import { DEFAULT_TIME_ZONE, TimeZoneSelect } from "./TimeZoneSelect";
import { WatchedPicker, type MatchDay } from "./WatchedPicker";

type Load<T> = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; data: T };

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? "Couldn’t load the schedule");
  return body as T;
}

const longDate = (day: string) =>
  new Date(`${day}T12:00:00`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
const shortDate = (day: string) =>
  new Date(`${day}T12:00:00`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
const time = (iso: string, tz: string) =>
  new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: tz });

type Panel = "standings" | "bracket";

/** Open on the bracket on a playoff day, the standings otherwise. */
function defaultPanel(view: DayView): Panel {
  return view.matches.length > 0 && view.matches.every((m) => !isTableBlock(m.block)) ? "bracket" : "standings";
}

function pickDay(t: Tournament, matches: Match[], tz: string) {
  const today = todayKey(tz);
  const saved = store.day(t.id);
  if (saved && saved <= today) return saved;
  // Ongoing: start from today. Finished: start at the beginning so nothing is given away.
  if (t.startDate <= today && today <= t.endDate) return today;
  return matches.length ? dayKey(matches[0].start, tz) : t.startDate;
}

export function SpoilerApp() {
  const [league, setLeague] = useState<LeagueSlug | null>(null);
  const [tournaments, setTournaments] = useState<Load<Tournament[]>>({ status: "loading" });
  const [tournamentId, setTournamentId] = useState<string | null>(null);
  const [matches, setMatches] = useState<Load<Match[]>>({ status: "loading" });
  const [day, setDay] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const [panel, setPanel] = useState<Panel>("standings");
  // "open": asked automatically when the site opens; "manual": the user pressed the calendar button.
  const [asking, setAsking] = useState<"open" | "manual" | null>(null);
  const [tz, setTz] = useState(DEFAULT_TIME_ZONE);

  useEffect(() => {
    const savedTz = store.timeZone();
    if (savedTz) setTz(savedTz);
    const saved = store.league();
    setLeague(LEAGUES.some((l) => l.slug === saved) ? (saved as LeagueSlug) : "worlds");
    setRevealed(store.revealed());
  }, []);

  useEffect(() => {
    if (!league) return;
    let cancelled = false;
    setTournaments({ status: "loading" });
    setMatches({ status: "loading" });
    setDay(null);
    getJson<{ tournaments: Tournament[] }>(`/api/${league}/tournaments`)
      .then(({ tournaments: list }) => {
        if (cancelled) return;
        if (!list.length) throw new Error("Nothing’s been played yet");
        const today = todayKey(tz);
        const saved = list.find((t) => t.id === store.tournament(league));
        const current = list.find((t) => t.startDate <= today && today <= t.endDate);
        setTournaments({ status: "ready", data: list });
        setTournamentId((saved ?? current ?? list[0]).id);
      })
      .catch((e: Error) => !cancelled && setTournaments({ status: "error", message: e.message }));
    return () => {
      cancelled = true;
    };
  }, [league]);

  const tournament = tournaments.status === "ready" ? tournaments.data.find((t) => t.id === tournamentId) : undefined;

  useEffect(() => {
    if (!league || !tournament) return;
    let cancelled = false;
    setMatches({ status: "loading" });
    setDay(null);
    getJson<{ matches: Match[] }>(`/api/${league}/${tournament.id}`)
      .then(({ matches: list }) => {
        if (cancelled) return;
        setMatches({ status: "ready", data: list });
        const d = pickDay(tournament, list, tz);
        setDay(d);
        setPanel(defaultPanel(buildDay(list, d, new Set(), tz)));
        setAsking(store.askedRecently(tournament.id) ? null : "open");
      })
      .catch((e: Error) => !cancelled && setMatches({ status: "error", message: e.message }));
    return () => {
      cancelled = true;
    };
  }, [league, tournament]);

  const chooseLeague = (slug: LeagueSlug) => {
    if (slug === league) return;
    store.setLeague(slug);
    setLeague(slug);
  };

  const chooseTournament = (id: string) => {
    if (!league) return;
    store.setTournament(league, id);
    setTournamentId(id);
  };

  const all = matches.status === "ready" ? matches.data : null;

  const goTo = useCallback(
    (d: string) => {
      if (!tournament || d > todayKey(tz)) return;
      store.setDay(tournament.id, d);
      setDay(d);
    },
    [tournament, tz],
  );

  const pickWatched = (watched: string | null) => {
    if (!tournament || !all) return;
    const days = [...new Set(all.map((m) => dayKey(m.start, tz)))].sort();
    const today = todayKey(tz);
    const next = watched ? days.find((d) => d > watched && d <= today) ?? watched : days[0] ?? tournament.startDate;
    store.setAsked(tournament.id);
    goTo(next);
    setPanel(defaultPanel(buildDay(all, next, revealed, tz)));
    setAsking(null);
  };

  const chooseTimeZone = (next: string) => {
    store.setTimeZone(next);
    setTz(next);
  };

  const toggleReveal = (id: string) => {
    setRevealed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      store.setRevealed(next);
      return next;
    });
  };

  const view = useMemo(() => (all && day ? buildDay(all, day, revealed, tz) : null), [all, day, revealed, tz]);
  const standings = useMemo(
    () => (all && view && day ? buildStandings(all, view, day, tz) : []),
    [all, view, day, tz],
  );
  const bracket = useMemo(() => (all && view && day ? buildBracket(all, view, day, tz) : []), [all, view, day, tz]);
  const swiss = useMemo(() => (all && view && day ? buildSwiss(all, view, day, tz) : null), [all, view, day, tz]);
  const swissDay = view?.matches.some((m) => isSwissBlock(m.block)) ?? false;

  const error = tournaments.status === "error" ? tournaments.message : matches.status === "error" ? matches.message : null;
  const today = todayKey(tz);
  const nextDay = view?.nextDay && view.nextDay <= today ? view.nextDay : null;
  const revealedCount = view?.matches.filter((m) => m.revealed).length ?? 0;
  const asOf = day
    ? `As of ${shortDate(day)}${revealedCount > 0 ? ` · ${revealedCount} revealed` : ""}`
    : "";
  const blocks = view ? [...new Set(view.matches.map((m) => m.block))] : [];

  const matchDays = useMemo<MatchDay[]>(() => {
    if (!all) return [];
    const byDay = new Map<string, Set<string>>();
    for (const m of all) {
      const d = dayKey(m.start, tz);
      if (d <= today) byDay.set(d, (byDay.get(d) ?? new Set()).add(m.block));
    }
    return [...byDay].sort(([a], [b]) => b.localeCompare(a)).map(([day, b]) => ({ day, blocks: [...b] }));
  }, [all, today, tz]);

  const tournamentSelect = tournament && (
    <label className="select">
      <span className="sr-only">Tournament</span>
      <select value={tournament.id} onChange={(e) => chooseTournament(e.target.value)}>
        {tournaments.status === "ready" &&
          tournaments.data.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
      </select>
      <Icon name="chevron-down" size={14} />
    </label>
  );

  return (
    <>
      <header className="top">
        <div className="top-inner">
          <span className="mark">
            <Icon name="eye-off" size={22} />
            <span className="mark-text">
              Fog of War
              <span className="mark-sub">Spoiler-free LoL esports</span>
            </span>
          </span>
          <nav className="tabs" aria-label="Events">
            {LEAGUES.map((l) => (
              <button
                key={l.slug}
                type="button"
                className="tab"
                aria-current={l.slug === league ? "page" : undefined}
                onClick={() => chooseLeague(l.slug)}
              >
                {l.name}
              </button>
            ))}
          </nav>
          <TimeZoneSelect value={tz} onChange={chooseTimeZone} />
        </div>
      </header>

      <main className="main">
        {error ? (
          <div className="notice" role="alert">
            <p className="notice-title">{error}</p>
            <button type="button" className="btn" onClick={() => location.reload()}>
              Try again
            </button>
          </div>
        ) : !view || !day || !tournament ? (
          <Loading />
        ) : asking ? (
          <WatchedPicker
            tournament={tournament}
            tournamentSelect={tournamentSelect}
            days={matchDays}
            lastViewed={store.day(tournament.id)}
            onPick={pickWatched}
            onCancel={asking === "manual" ? () => setAsking(null) : null}
          />
        ) : (
          <>
            <section className="day-col" aria-labelledby="day-title">
              <div className="day-head">
                <div>
                  <h1 id="day-title">{longDate(day)}</h1>
                  <div className="day-sub">
                    {tournamentSelect}
                    {blocks.length > 0 && <span>{blocks.join(" · ")}</span>}
                  </div>
                </div>
                <div className="step">
                  <button
                    type="button"
                    className="btn icon"
                    aria-label="Change day"
                    title="Change day"
                    onClick={() => setAsking("manual")}
                  >
                    <Icon name="calendar" size={16} />
                  </button>
                  <button
                    type="button"
                    className="btn icon"
                    aria-label={view.prevDay ? `Previous day: ${shortDate(view.prevDay)}` : "No earlier match days"}
                    disabled={!view.prevDay}
                    onClick={() => view.prevDay && goTo(view.prevDay)}
                  >
                    <Icon name="chevron-left" size={16} />
                  </button>
                  <button type="button" className="btn" disabled={!nextDay} onClick={() => nextDay && goTo(nextDay)}>
                    {nextDay ? `Next day: ${shortDate(nextDay)}` : "Next day"}
                    <Icon name="chevron-right" size={16} />
                  </button>
                </div>
              </div>

              {view.matches.length === 0 ? (
                <div className="empty">
                  <p className="empty-title">No matches</p>
                  {nextDay && <p>Next match day: {longDate(nextDay)}</p>}
                </div>
              ) : (
                <>
                  <div className="progress">
                    <span>
                      <b>
                        {revealedCount} of {view.matches.length}
                      </b>{" "}
                      revealed
                    </span>
                    <span className="bar" aria-hidden="true">
                      <i style={{ width: `${(revealedCount / view.matches.length) * 100}%` }} />
                    </span>
                  </div>
                  <ol className="matches">
                    {view.matches.map((m) => (
                      <MatchRow key={m.id} m={m} tz={tz} onToggle={() => toggleReveal(m.id)} />
                    ))}
                  </ol>
                </>
              )}
            </section>

            {swiss?.started && (
              <details key={`${tournament.id}-${swissDay}`} className="swiss" open={swissDay}>
                <summary>
                  <h2>Swiss stage</h2>
                  <span className="swiss-asof">{asOf}</span>
                  <Icon name="chevron-down" size={18} />
                </summary>
                <SwissBoard swiss={swiss} scrollKey={day} />
              </details>
            )}

            <div className="side-wrap">
              <aside className="side" aria-label="Standings and bracket">
                <div className="side-tabs" role="tablist">
                  <button type="button" role="tab" aria-selected={panel === "standings"} onClick={() => setPanel("standings")}>
                    Standings
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={panel === "bracket"}
                    onClick={() => setPanel("bracket")}
                  >
                    Bracket
                  </button>
                </div>
                <p className="note">{asOf}</p>
                {panel === "standings" ? (
                  <Standings rows={standings} />
                ) : (
                  <Bracket columns={bracket} formatDay={shortDate} />
                )}
              </aside>
            </div>
          </>
        )}
      </main>
    </>
  );
}

function Logo({ team, size }: { team: Team | null; size: number }) {
  if (!team) return <span className="logo logo-tbd" style={{ width: size, height: size }} aria-hidden="true" />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img className="logo" src={team.image} alt="" width={size} height={size} loading="lazy" />;
}

function MatchRow({ m, tz, onToggle }: { m: DayMatch; tz: string; onToggle: () => void }) {
  const concealed = m.teamsConcealed;
  const side = (i: 0 | 1) => {
    const t = concealed ? null : m.teams[i];
    const lost = m.revealed && m.result?.winner !== i;
    return (
      <div className={`team${i === 1 ? " team-r" : ""}${lost ? " team-lost" : ""}`}>
        <Logo team={t} size={40} />
        <div className="team-text">
          <span className="team-name">{t ? t.name : "TBD"}</span>
          <span className="team-code">{t?.code}</span>
        </div>
      </div>
    );
  };

  return (
    <li className={`match${m.revealed ? " match-revealed" : ""}`}>
      <div className="meta">
        <span className="meta-time">
          {time(m.start, tz)}
          {isAfterMidnight(m.start, tz) && (
            <span className="meta-next">
              {new Date(m.start).toLocaleDateString("en-GB", { weekday: "short", timeZone: tz })}
            </span>
          )}
        </span>
        <span className="meta-format">Bo{m.bestOf}</span>
      </div>
      {side(0)}
      <div className="score">
        {m.revealed && m.result ? (
          <span className="score-value" aria-label={`${m.result.wins[0]} to ${m.result.wins[1]}`}>
            <span className={m.result.winner === 0 ? "" : "score-lost"}>{m.result.wins[0]}</span>
            <span className="score-dash">–</span>
            <span className={m.result.winner === 1 ? "" : "score-lost"}>{m.result.wins[1]}</span>
          </span>
        ) : (
          <span className="score-locked">
            <Icon name="lock" size={14} />
            vs
          </span>
        )}
      </div>
      {side(1)}
      <div className="act">
        {concealed ? (
          <span className="hint">Reveal the earlier match</span>
        ) : m.state !== "completed" ? (
          // Live and upcoming look the same: a live badge, with the VOD length, hints at the game count.
          <span className="hint">No result yet</span>
        ) : m.revealed ? (
          <button type="button" className="btn ghost" onClick={onToggle}>
            Hide result
          </button>
        ) : (
          <button type="button" className="btn gold" onClick={onToggle}>
            Show result
          </button>
        )}
      </div>
    </li>
  );
}

function Standings({ rows }: { rows: ReturnType<typeof buildStandings> }) {
  if (!rows.length) return <p className="side-empty">No games played yet.</p>;
  return (
    <table className="table">
      <thead>
        <tr>
          <th scope="col" className="c-rank">
            #
          </th>
          <th scope="col">Team</th>
          <th scope="col" className="c-num">
            W–L
          </th>
          <th scope="col" className="c-status">
            <span className="sr-only">Status</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.team.code} className={r.status === "eliminated" ? "row-out" : ""}>
            <td className="c-rank">{r.rank}</td>
            <td>
              <span className="table-team">
                <Logo team={r.team} size={22} />
                {r.team.name}
              </span>
            </td>
            <td className="c-num">
              {r.wins}–{r.losses}
            </td>
            <td className="c-status">
              {r.status === "qualified" && <span className="tag tag-in">Qualified</span>}
              {r.status === "eliminated" && <span className="tag tag-out">Out</span>}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Loading() {
  return (
    <div className="loading" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading schedule</span>
      <div className="day-col">
        <div className="sk sk-title" />
        {[0, 1, 2].map((i) => (
          <div key={i} className="sk sk-row" />
        ))}
      </div>
      <div className="side">
        <div className="sk sk-table" />
      </div>
    </div>
  );
}
