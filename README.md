# GYM

Single-file PWA for the Winter 2026 strength program (V and Tomoko profiles). Saves sessions to Notion through the `notion-proxy` Cloudflare Worker and reads Cycling Rides for Zwift readiness.

## Source of truth

`index.html` is the whole app **and** its source. The program data lives near the top of the script:

- `EX` — exercise library (one id = one implement + grip + variation = its own history)
- `TEMPLATES` — V's sessions (MON A / WED B / THU C / FRI optional / SAT D); `TEMPLATES_T` — Tomoko's (TOMO_A / TOMO_B)
- `WEEK_LAYOUTS` — week A and week B for both profiles (Settings → Week layout)

The original generator (`gen_program.py`) and its 152-check suite were lost with the build session that made them. From v4.4, edit `index.html` directly and run the checks below before uploading.

## Checks

```
npm i -D playwright
npx playwright install chromium
node tests/run.js
```

`tests/run.js` serves `index.html` locally, fakes the clock (Asia/Tokyo) and the Notion proxy, and checks program integrity, the winter schedule, calibration, dead hangs, bar weights and totals, snapping and plate-stripping back-offs, week layouts, ride cards, the effort nudge, light-squat stop, rest by tier, the Notion table, the bench-e1RM fix and Tomoko's profile. All checks must pass.

## Changelog

- **v5.0 (Winter 2026 rewrite)** — Week: Mon A (home) · Tue Zwift, no gym · Wed B (home) · Thu C (warehouse) · Fri optional (warehouse, never missed) · Sat D (home) · Sun rest. New templates per the spec; new lifts with their own history (SSB pause squat wedge, BD bench volume, SSB volume wedge, camber bent row, dead hangs). SSB pause squat e1RM seeded at 124 until a calibration replaces it. Bench test moved to Wed 16 Dec (SSB test stays Sat 12 Dec). RPE calibration set on the last back-off of Mon (pause squat) and Wed (bench heavy), about every 4 weeks, never in a deload week; predicted/actual reps, implied e1RM = load × (1 + reps/30), proposed change applied only on confirm, RPE offset stored per lift, every result written to Adjustments. Dead hangs in seconds (start 2 × 10 s, +5 s when both sets are clean, wrist-pain toggle, pull-ups hidden until 2 × 30 s). Dips are an optional extra on Wed. Monday body-weight prompt (optional). "Hard Zwift tomorrow caps squats at RPE 7" is now off by default (Settings); TSB < −15 rule kept. Notion Type "W26 WED" is written for Wednesday sessions. Past sessions are untouched.
- **v4.5 (28 Sep 2026)** — Weighed bar weights (SSB 30, BD 20, EZ 15.9, camber 20.2, trap 34.5, Gymway 15.6 kg; exact, never rounded); stored sleeve totals, PRs and e1RMs recalculated once from per-sleeve × 2 + bar (bench untouched); P1 back-offs only remove plates from the top set's stack (closest candidate, tie → lighter, > 1 kg/sleeve away → normal rounding); e1RM shown and sent to Notion to one decimal.
- **v4.4 (27 Sep 2026)** — Week layouts A/B (default B: hard Zwift Tue, easy Thu evening; Tomoko Z2 Mon, quality Fri); ride cards and bike icons; Saturday laterals + core off by default; effort nudge (+3 reps when last time averaged ≥2 RPE under target); per-set Time + Rest in the Notion table and median rest in the notes; last duration on day cards; light squat ends after a set over RPE 7 when the hard ride is tomorrow; rest timer by tier (P1 180 · S2 120 · A3 75 · core 45 s, editable); one-off fix for the 21 Sep bench top set (60 → 70 kg, e1RM 87.5).
- **v4.3 (27 Sep 2026)** — Friday: KAZ single-arm curl default, rear-delt fly default, cuff lateral + KAZ D-mode hammer options, woodchop on the neoprene strap. Thursday: KAZ D-mode fly options.
- **v4.2 (24 Sep 2026)** — Tomoko's profile (simple mode, Japanese).
