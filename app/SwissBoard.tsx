"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { SWISS_TARGET, type BracketSlot, type SwissBox, type SwissView } from "@/lib/spoiler";
import type { Team } from "@/lib/types";

type Focus = { focus: string | null; onHover: (code: string | null) => void; onPin: (code: string) => void };

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

function TeamRow({
  team,
  col,
  score,
  state,
  f,
}: {
  team: Team | null;
  col: number;
  score?: number;
  state?: "won" | "lost";
  f: Focus;
}) {
  if (!team) {
    return (
      <div className="sw-team sw-team-tbd">
        <span className="logo logo-tbd" style={{ width: 20, height: 20 }} aria-hidden="true" />
        <span className="sw-code">TBD</span>
      </div>
    );
  }
  const on = f.focus === team.code;
  return (
    <button
      type="button"
      className={`sw-team${state ? ` sw-${state}` : ""}${on ? " is-on" : ""}`}
      data-team={team.code}
      data-col={col}
      aria-pressed={on}
      title={team.name}
      onPointerEnter={(e) => e.pointerType === "mouse" && f.onHover(team.code)}
      onPointerLeave={(e) => e.pointerType === "mouse" && f.onHover(null)}
      onFocus={() => f.onHover(team.code)}
      onBlur={() => f.onHover(null)}
      onClick={() => f.onPin(team.code)}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="logo" src={team.image} alt="" width={20} height={20} loading="lazy" />
      <span className="sw-code">{team.code}</span>
      {score !== undefined && <span className="sw-score">{score}</span>}
    </button>
  );
}

function Card({ s, col, f }: { s: BracketSlot | null; col: number; f: Focus }) {
  const side = (i: 0 | 1) => (
    <TeamRow
      team={s?.teams[i] ?? null}
      col={col}
      score={s?.result?.wins[i]}
      state={s?.result ? (s.result.winner === i ? "won" : "lost") : undefined}
      f={f}
    />
  );
  return (
    <li className={`sw-card${s?.isToday ? " is-today" : ""}${s ? "" : " is-open"}`}>
      {side(0)}
      {side(1)}
    </li>
  );
}

function Box({ box, col, f }: { box: SwissBox; col: number; f: Focus }) {
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
            <Card key={s.id} s={s} col={col} f={f} />
          ))}
          {Array.from({ length: box.open }, (_, i) => (
            <Card key={`open${i}`} s={null} col={col} f={f} />
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
            <TeamRow team={t} col={col} f={f} />
          </li>
        ))}
        {Array.from({ length: box.open }, (_, i) => (
          <li key={`open${i}`}>
            <TeamRow team={null} col={col} f={f} />
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Curves joining one team's appearances, column to column, in board coordinates. */
function tracePath(board: HTMLElement, code: string) {
  const origin = board.getBoundingClientRect();
  const rows = [...board.querySelectorAll<HTMLElement>(`[data-team="${CSS.escape(code)}"]`)]
    .map((el) => ({ col: Number(el.dataset.col), r: el.getBoundingClientRect() }))
    .sort((a, b) => a.col - b.col);
  const parts: string[] = [];
  for (let i = 1; i < rows.length; i++) {
    const a = rows[i - 1].r;
    const b = rows[i].r;
    const x1 = a.right - origin.left;
    const y1 = a.top + a.height / 2 - origin.top;
    const x2 = b.left - origin.left;
    const y2 = b.top + b.height / 2 - origin.top;
    const mid = (x2 - x1) / 2;
    parts.push(`M${x1} ${y1}C${x1 + mid} ${y1} ${x2 - mid} ${y2} ${x2} ${y2}`);
  }
  return parts.join("");
}

export function SwissBoard({ swiss, scrollKey }: { swiss: SwissView; scrollKey: string }) {
  const [hover, setHover] = useState<string | null>(null);
  const [pinned, setPinned] = useState<string | null>(null);
  const [path, setPath] = useState("");
  const scroller = useRef<HTMLDivElement>(null);
  const board = useRef<HTMLDivElement>(null);
  const focus = hover ?? pinned;

  useLayoutEffect(() => {
    const el = board.current;
    if (!el || !focus) return setPath("");
    const draw = () => setPath(tracePath(el, focus));
    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(el);
    return () => ro.disconnect();
  }, [focus, swiss]);

  // On a phone the board scrolls sideways: open it on the round being played on the chosen day.
  useEffect(() => {
    const sc = scroller.current;
    const col = sc?.querySelector(".is-today")?.closest<HTMLElement>(".sw-col");
    if (sc && col) sc.scrollLeft = col.offsetLeft - sc.offsetLeft - 4;
  }, [scrollKey]);

  useEffect(() => {
    if (!pinned) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setPinned(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pinned]);

  const f: Focus = { focus, onHover: setHover, onPin: (code) => setPinned((p) => (p === code ? null : code)) };

  return (
    <div
      className="sw-scroll"
      ref={scroller}
      onClick={(e) => !(e.target as HTMLElement).closest(".sw-team") && setPinned(null)}
    >
      <div className={`sw-board${focus ? " has-focus" : ""}`} ref={board}>
        {swiss.columns.map((c) => (
          <div key={c.games} className="sw-col">
            <h3 className="sw-round">{c.games < SWISS_TARGET * 2 - 1 ? `Round ${c.games + 1}` : "Final records"}</h3>
            <div className="sw-stack">
              {c.boxes.map((b) => (
                <Box key={`${b.wins}-${b.losses}`} box={b} col={c.games} f={f} />
              ))}
            </div>
          </div>
        ))}
        <svg className="sw-lines" aria-hidden="true">
          {/* Keyed by team so the trace draws in afresh for each one. */}
          <path key={focus} d={path} pathLength={1} />
        </svg>
      </div>
    </div>
  );
}
