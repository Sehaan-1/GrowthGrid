# Rehearsal — GrowthGrid sync demo

The marketing-side demo on the auth pages (`/login`, `/register`): a GrowthGrid
dashboard mid-loop. The kit is vendored in `client/src/kit/`.

## The scene

`client/src/demos/SyncDemo.tsx` + `sync-demo.css`, one state machine:

1. Cursor wakes on **Sync now** and clicks. The button rolls to a spinner
   ("Syncing…"), the stat counters roll up, the spend chart slides a day
   forward — the values accumulate across loops and never rewind (progress
   lives outside the looped state; the looped `tick` returns to 0, so the
   seam check passes and the data still moves forward each cycle).
2. The automation fires: the **Retargeting** row's badge crossfades to
   **CPL high** (`States`), its CPL rolls 402 → ₹568 in danger ink, a Clear
   action fades in, and a toast lands top-right ("CPL alert", marked
   `act.mark('alert')`).
3. A person clears the flag — the loop's reset has a visible cause — and the
   scene settles back to "Sync now".

The poster (reduced motion / first paint) is the payoff: flag raised, toast
on screen. The story answers "why does this dashboard earn its keep": sync,
automation, alert, resolution.

## Composition

- **Wide (680×600):** pinned bottom-bleed. The window (584×620) sits 48px
  from the top and left and runs 68px off the bottom; the stage is
  transparent so the auth page's graph-paper grid is the ground ("the page
  is the ground", framing.md). Sidebar content (brand, seven nav items,
  workspace card, user chip) ends 82px above the window's bottom so no real
  content falls in the crop; only wordless filler rows bleed.
- **Compact (358×340, below 600px):** a second design, not a squeeze. The
  window is 330×500, centered with equal 14px gutters, bottom-bleed only —
  visible region 330×326, so it keeps a desktop window's shape (rule 12).
  No rail; the page title moves into the body; stats go 2+1 (CPL card spans
  and is never dropped); campaigns become one-line rows (name, status,
  value, action — the meta label drops out); the chart is the filler that
  runs off the bottom. Every action (Sync, the flag, Clear) stays inside
  the crop.

## How it was verified

Toolchain: `CHROME_PATH=/tmp/filming/chrome.sh` (sandbox Chromium wrapper;
rebuild recipe in session notes) with the skill's `scripts/film.mjs`.

```
# wide gate (loop + layout + framing checks) — rehearsal passed
node scripts/film.mjs "http://127.0.0.1:5173/login" --select '.gg-sync' --gate --width 1280
# states sheets, both layouts
node scripts/film.mjs "http://127.0.0.1:5173/login" --select '.gg-sync' --states --width 1280
node scripts/film.mjs "http://127.0.0.1:5173/login" --select '.gg-sync' --states --width 390
```

Result: **rehearsal passed** (zero never-intentional lines), loop-seam clean,
states sheets reviewed by eye at both widths. The inner product pages were
screenshot-reviewed against a mocked API (route interception; the real API
ships in the next slice) — dashboard charts, campaign table with meters,
leads pipeline, client cards all render as designed.

### Advisory lines judged intentional (candidates, not gate failures)

- `appears with no entrance: span.ss-count` / `vanishes with no exit: span.ss-check`
  — kit `Count` mounts its digit strips offscreen by design and the button's
  check closes its slot the kit's own way; both appear identically in the
  skill's gold examples.
- `handoff shift: span.ss-roll__item` — sub-pixel (≤0.7px) swap inside the
  kit's Roll during the label crossfade; present in gold examples.
- `lopsided: "Syncing…" 6px/12px` — measured mid-tween while the kit Button's
  icon slot opens; the label is flex-centered in a fixed 92px width.
- `manual: same-box content change: ss-chart / gg-stat-value` — the point of
  the scene: the chart redraws and the numbers roll on sync. Reviewed in
  motion.
- `jump: span "0"… y ±170px` — kit Count's decade homing after a roll (its
  `data-snap` mechanism); gold examples show the same.
- Compact: `uneven: ss-bar / gg-row-name runs into the bottom padding` and
  `layout: gg-campaigns leaves -Npx` — the deliberate bottom bleed cropping
  filler mid-card, as composed.
- React Router future-flag console warnings — host app's router version;
  harmless, noted for a later upgrade.

## Host integration

- `Login.jsx` / `Register.jsx`: split auth — form panel left, the demo on a
  `.gg-grid-ground` stage right. The stage renders 1:1 (`.auth__stage-inner`
  max-width 704 = the 680 design + its left inset), centered.
- Tokens: `sync-demo.css` remaps the kit's `--ss-*` tokens to the product
  look (accent #16a34a etc.) under `.gg-sync` only; `client/src/styles.css`
  carries the product's own `--gg-*` tokens for the real pages.
- `vite.config.js` has `resolve.dedupe: ['react', 'react-dom']` — required,
  or the TSX kit gets a second React copy from the optimizer and the page
  dies with `Cannot read properties of null (reading '_context')`.

## API contract the pages code against (for the server slice)

- `GET /api/auth/me` → `{ user: { id, name, email, role } }`
- `GET /api/dashboard/overview` → `{ stats: { spend14d, leads14d, impressions14d, clicks14d, avgCpl, cplDelta, activeCampaigns, flaggedCount }, series: [{ date, spend, leads }×14], platformSplit: [{ platform, spend, leads }], flagged: [campaign], recentLeads: [lead×5], notifications: [{ _id, type: cpl_alert|budget_alert|sync|info, message, createdAt }] }`
- `GET /api/campaigns` → `{ campaigns: [{ _id, name, platform: google|meta, status: active|paused, flagged, flagReason?, client: { name }, stats: { cpl14, utilization: 0..1|null, utilizationLabel } }] }`
- `PATCH /api/campaigns/:id` `{ status }` / `{ flagged: false }` → `{ campaign }`; `POST /api/sync` → `{ synced, alerts }`
- `GET /api/leads` → `{ leads: [{ _id, name, email, phone, status: new|contacted|qualified|won|lost, value, createdAt, campaign: { name, platform } }] }`; `PATCH /api/leads/:id` `{ status }`; `POST /api/leads`
- `GET /api/clients` → `{ clients: [{ _id, name, industry, stats: { spend14d, leads14d, activeCampaigns, campaigns } }] }`

Formatting: INR everywhere (`inr`, `inrCompactFmt` = K/L/Cr, `num`,
`dateShort`, `timeAgo` in `client/src/api.js`).
