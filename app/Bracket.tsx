import type { BracketColumn, BracketSlot } from "@/lib/spoiler";

function Side({ slot, i }: { slot: BracketSlot; i: 0 | 1 }) {
  const team = slot.teams[i];
  const won = slot.result?.winner === i;
  const lost = slot.result && !won;
  return (
    <div className={`slot-team${lost ? " slot-lost" : ""}`}>
      {team ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="logo" src={team.image} alt="" width={18} height={18} loading="lazy" />
      ) : (
        <span className="logo logo-tbd" style={{ width: 18, height: 18 }} aria-hidden="true" />
      )}
      <span className="slot-name">{team ? team.code : "TBD"}</span>
      <span className="slot-score">{slot.result ? slot.result.wins[i] : ""}</span>
    </div>
  );
}

function Slot({ s, formatDay }: { s: BracketSlot; formatDay: (day: string) => string }) {
  return (
    <li className={`slot${s.isToday ? " slot-today" : ""}`}>
      <div className="slot-meta">
        <span>{s.day ? formatDay(s.day) : "Later"}</span>
        <span>Bo{s.bestOf}</span>
      </div>
      <Side slot={s} i={0} />
      <Side slot={s} i={1} />
    </li>
  );
}

export function Bracket({ columns, formatDay }: { columns: BracketColumn[]; formatDay: (day: string) => string }) {
  if (!columns.length) return <p className="side-empty">No playoff bracket.</p>;
  return (
    <div className="bracket">
      {columns.map((col) => (
        <section key={col.block} className="bracket-col" aria-label={col.block}>
          <h2 className="bracket-title">{col.block}</h2>
          <ol className="bracket-slots">
            {col.slots.map((s) => (
              <Slot key={s.id} s={s} formatDay={formatDay} />
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}
