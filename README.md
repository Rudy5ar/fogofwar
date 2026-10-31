# lol-spoilerfree

Small app I made for myself. I watch LoL esports a day or two late and just wanted the schedule,
standings and brackets without getting spoiled. Nothing more to it.

lolesports.com hides scores, but the standings still show today's table, which kind of gives it away.
This one only uses matches up to the day you pick.

- pick the day you're on, results stay hidden
- reveal them as you watch, standings and bracket follow along
- if a team plays twice that day, the second match stays hidden until you reveal the first
- nothing from later days shows up anywhere
- Swiss gets its own board, grouped by record

Worlds, MSI, First Stand, LEC, LCK, LPL, LCS. No accounts, it just saves stuff in localStorage.

## Running it

```sh
npm install
npm run dev
```

Then open http://localhost:3000.

```sh
npm run typecheck   # tsc --noEmit
npm run build
node scripts/screenshot.mjs http://localhost:3000 out.png [mobile]
```

The screenshot script needs the Playwright browsers once: `npx playwright install chromium`.

## How it's put together

Next.js app router, no database.

- `lib/lolesports.ts` - client for the LoL Esports API, server only
- `app/api/` - routes the page calls, so there's no CORS issue and the API key stays out of the client
- `lib/spoiler.ts` - all the hiding logic: day boundaries, which results count, standings, bracket
- `lib/storage.ts` - localStorage, wrapped so private mode doesn't break anything
- `app/SpoilerApp.tsx` - the page

A "day" starts at 06:00 in the selected time zone, not midnight. NA-hosted events end around 04:00
in Europe, and those late matches belong to the previous day's broadcast.

## Data

Uses the unofficial API behind lolesports.com (`esports-api.lolesports.com/persisted/gw`). The key in
`lib/lolesports.ts` is the public one their site ships with. It's undocumented and could change at any
time. Responses are cached for 5 minutes.

Not affiliated with Riot Games.
