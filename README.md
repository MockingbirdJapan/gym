# GYM

Single-file PWA for the Winter 2026 strength program (V and Tomoko profiles). Saves sessions to Notion through the `notion-proxy` Cloudflare Worker and reads Cycling Rides for Zwift readiness.

## Source of truth

`index.html` is the whole app **and** its source. The program data lives near the top of the script:

- `EX` — exercise library (one id = one implement + grip + variation = its own history)
- `TEMPLATES` — V's sessions (MON / THU / FRI / SAT); `TEMPLATES_T` — Tomoko's (TOMO_A / TOMO_B)
- `WEEK_LAYOUTS` — week A and week B for both profiles (Settings → Week layout)

The original generator (`gen_program.py`) and its 152-check suite were lost with the build session that made them. From v4.4, edit `index.html` directly and run the checks below before uploading.

## Checks

```
npm i -D playwright
npx playwright install chromium
node tests/run.js
```

`tests/run.js` serves `index.html` locally, fakes the clock (Asia/Tokyo) and the Notion proxy, and checks program integrity, bar weights and totals, snapping and plate-stripping back-offs, week layouts, ride cards, the effort nudge, light-squat stop, rest by tier, the Notion table, the bench-e1RM fix and Tomoko's profile. All checks must pass.

## Changelog

- **v4.5 (28 Sep 2026)** — Weighed bar weights (SSB 30, BD 20, EZ 15.9, camber 20.2, trap 34.5, Gymway 15.6 kg; exact, never rounded); stored sleeve totals, PRs and e1RMs recalculated once from per-sleeve × 2 + bar (bench untouched); P1 back-offs only remove plates from the top set's stack (closest candidate, tie → lighter, > 1 kg/sleeve away → normal rounding); e1RM shown and sent to Notion to one decimal.
- **v4.4 (27 Sep 2026)** — Week layouts A/B (default B: hard Zwift Tue, easy Thu evening; Tomoko Z2 Mon, quality Fri); ride cards and bike icons; Saturday laterals + core off by default; effort nudge (+3 reps when last time averaged ≥2 RPE under target); per-set Time + Rest in the Notion table and median rest in the notes; last duration on day cards; light squat ends after a set over RPE 7 when the hard ride is tomorrow; rest timer by tier (P1 180 · S2 120 · A3 75 · core 45 s, editable); one-off fix for the 21 Sep bench top set (60 → 70 kg, e1RM 87.5).
- **v4.3 (27 Sep 2026)** — Friday: KAZ single-arm curl default, rear-delt fly default, cuff lateral + KAZ D-mode hammer options, woodchop on the neoprene strap. Thursday: KAZ D-mode fly options.
- **v4.2 (24 Sep 2026)** — Tomoko's profile (simple mode, Japanese).
