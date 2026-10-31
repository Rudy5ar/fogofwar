"use client";

import { useEffect, useRef } from "react";
import { SWISS_TARGET, type BracketSlot, type SwissBox, type SwissView } from "@/lib/spoiler";
import type { Team } from "@/lib/types";

function Squares({ wins, losses }: { wins: number; losses: number }) {
  if (!wins && !losses) return null;
  return (
    <span className="sw-squares" aria-hidden="true">
      {Array.from({ length: wins }, (_, i) => (
        <i key={`w${i}`} className="sw-sq-win" />
      ))}
      {Array.from({ length: losses }, (_, i) => (
        <i key={`l${i}`} className="sw-sq-loss" />
      ))}
    </span>
  );
}

function TeamRow({ team, score, state }: { team: Team | null; score?: number; state?: "won" | "lost" }) {
  if (!team) {
    return (
      <div className="sw-team sw-team-tbd">
        <span className="logo logo-tbd" style={{ width: 20, height: 20 }} aria-hidden="true" />
        <span className="sw-code">TBD</span>
      </div>
    );
  }
  return (
    <div className={`sw-team${state ? ` sw-${state}` : ""}`} title={team.name}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="logo" src={team.image} alt="" width={20} height={20} loading="lazy" />
      <span className="sw-code">{team.code}</span>
      {score !== undefined && <span className="sw-score">{score}</span>}
    </div>
  );
}

function Card({ s }: { s: BracketSlot | null }) {
  const side = (i: 0 | 1) => (
    <TeamRow
      team={s?.teams[i] ?? null}
      score={s?.result?.wins[i]}
      state={s?.result ? (s.result.winner === i ? "won" : "lost") : undefined}
    />
  );
  return (
    <li className={`sw-card${s?.isToday ? " is-today" : ""}${s ? "" : " is-open"}`}>
      {side(0)}
      {side(1)}
    </li>
  );
}

function Box({ box }: { box: SwissBox }) {
  const record = `${box.wins}–${box.losses}`;
  if (box.kind === "pool") {
    const bo = box.slots[0]?.bestOf;
    return (
      <section className="sw-box" aria-label={`${record} pool`}>
        <h4 className="sw-head">
          <span className="sw-record">{record}</span>
          {bo && bo > 1 && <span className="sw-bo">Bo{bo}</span>}
          <Squares wins={box.wins} losses={box.losses} />
        </h4>
        <ol className="sw-cards">
          {box.slots.map((s) => (
            <Card key={s.id} s={s} />
          ))}
          {Array.from({ length: box.open }, (_, i) => (
            <Card key={`open${i}`} s={null} />
          ))}
        </ol>
      </section>
    );
  }
  const out = box.kind === "eliminated";
  return (
    <section className={`sw-box sw-end${out ? " sw-out" : " sw-in"}`} aria-label={`${record} ${box.kind}`}>
      <h4 className="sw-head">
        <span className="sw-record">{record}</span>
        <span className="sw-verdict">{out ? "Eliminated" : "Qualified"}</span>
      </h4>
      <ul className="sw-cards sw-teams">
        {box.teams.map((t) => (
          <li key={t.code}>
            <TeamRow team={t} />
          </li>
        ))}
        {Array.from({ length: box.open }, (_, i) => (
          <li key={`open${i}`}>
            <TeamRow team={null} />
          </li>
        ))}
      </ul>
    </section>
  );
}

export function SwissBoard({ swiss, scrollKey }: { swiss: SwissView; scrollKey: string }) {
  const scroller = useRef<HTMLDivElement>(null);

  // On a phone the board scrolls sideways: open it on the round being played on the chosen day.
  useEffect(() => {
    const sc = scroller.current;
    const col = sc?.querySelector(".is-today")?.closest<HTMLElement>(".sw-col");
    if (sc && col) sc.scrollLeft = col.offsetLeft - sc.offsetLeft - 4;
  }, [scrollKey]);

  return (
    <div className="sw-scroll" ref={scroller}>
      <div className="sw-board">
        {swiss.columns.map((c) => (
          <div key={c.games} className="sw-col">
            <h3 className="sw-round">{c.games < SWISS_TARGET * 2 - 1 ? `Round ${c.games + 1}` : "Final records"}</h3>
            <div className="sw-stack">
              {c.boxes.map((b) => (
                <Box key={`${b.wins}-${b.losses}`} box={b} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
