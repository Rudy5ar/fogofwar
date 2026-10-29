import type { Tournament } from "@/lib/types";

export type MatchDay = { day: string; blocks: string[] };

const label = (day: string) =>
  new Date(`${day}T12:00:00`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });

export function WatchedPicker({
  tournament,
  tournamentSelect,
  days,
  lastViewed,
  onPick,
  onCancel,
}: {
  tournament: Tournament;
  tournamentSelect: React.ReactNode;
  /** Match days up to today, newest first. Dates and stage names only: nothing here can spoil. */
  days: MatchDay[];
  lastViewed: string | null;
  onPick: (watched: string | null) => void;
  onCancel: (() => void) | null;
}) {
  return (
    <section className="picker" aria-labelledby="picker-title">
      <div className="picker-head">
        <h1 id="picker-title">What&rsquo;s the last day you watched?</h1>
        <p>
          The app opens on the match day after it, with standings up to that point. Results stay hidden until you
          reveal them.
        </p>
        <div className="picker-tournament">{tournamentSelect}</div>
      </div>

      {days.length === 0 ? (
        <p className="side-empty">{tournament.name} hasn&rsquo;t played any matches yet.</p>
      ) : (
        <ol className="picker-days">
          {days.map(({ day, blocks }) => (
            <li key={day}>
              <button type="button" className="picker-day" onClick={() => onPick(day)}>
                <span className="picker-date">{label(day)}</span>
                <span className="picker-stage">{blocks.join(" · ")}</span>
                {day === lastViewed && <span className="picker-last">Last opened</span>}
              </button>
            </li>
          ))}
        </ol>
      )}

      <div className="picker-foot">
        <button type="button" className="btn" onClick={() => onPick(null)}>
          Nothing yet, start from the first day
        </button>
        {onCancel && (
          <button type="button" className="btn ghost" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
    </section>
  );
}
