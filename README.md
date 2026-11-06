# GYM

Single-file PWA for the Winter 2026 strength program (V and T profiles). Saves sessions to Notion through the `notion-proxy` Cloudflare Worker and reads Cycling Rides for Zwift readiness.

## Source of truth

`index.html` is the whole app **and** its source. The program data lives near the top of the script:

- `EX` — exercise library (one id = one implement + grip + variation = its own history)
- `TEMPLATES` — V's sessions (MON A / WED B / THU C / SAT D; FRI kept only as `retired`); `TEMPLATES_T` — T's (TOMO_A / TOMO_B)
- Families (v5.4): an `EX` entry with `fam` lists variant ids (camber handles, cable attachments). Each set carries `v`; history, suggestions and PRs live under the variant id
- `WEEK_LAYOUTS` — week A and week B for both profiles (Settings → Week layout)

The original generator (`gen_program.py`) and its 152-check suite were lost with the build session that made them. From v4.4, edit `index.html` directly and run the checks below before uploading.

## Checks

```
npm i -D playwright
npx playwright install chromium
node tests/v54.js
node tests/v55.js
node tests/v56.js
node tests/v57.js
```

`CHROME=/path/to/chrome` uses an installed browser instead of Playwright's download. Each file serves `index.html` locally, fakes the clock (Asia/Tokyo) and the Notion proxy, and checks behaviour, not pixels. All checks must pass.

- `tests/v54.js` (150 checks): program integrity, the winter schedule, calibration, dead hangs, bar weights and totals, snapping and plate-stripping back-offs, week layouts, ride cards, the effort nudge, light-squat stop, rest by tier, the Notion table, the bench-e1RM fix, v5.3 warm-ups, the → S1 timer and the any-day bench test, the v5.4 week and blocks, the checkpoint, warehouse closure, Gym Nano off/preview/installed, per-set variants, the DB ceiling, milestones, the weekly review, the check-in, and T's profile.
- `tests/v55.js` (25 checks): history baseline that skips reduced weeks, the missing-set fallback, the PR hold-off, template smoke test.
- `tests/v57.js` (39 checks): the B2 bridge targets (weeks 7–9), Thursday / Saturday layout, the 32 kg adjustable DB, the auto-adjust rules, bench e1RM from Monday only, the target-RPE display, T's badge.
- `tests/v56.js` (54 checks): Monday row default, e1RM rules and the one-time repair, A3 RPE 8–9 and the effort nudge, the Thursday rebalance, rest defaults, the Notion outbox, milestone visibility.

## Changelog

### v5.7 (6 Nov 2026)
- **B2 bridge, weeks 7–9 (Mon 9 – Sat 28 Nov)** — the three weeks before the Gym Nano, from the plan agreed 6 Nov (Notion: Workout Plan — V (Winter 2026)). `BRIDGE_P1` (Monday bench, Saturday SSB: TOP set at a planned total, back-offs at a % of the top you actually log, no opener single, no calibration set) and `BRIDGE` (per template and exercise: sets, reps, RPE and the first-set target `in`; no `in` = normal progression). Bench 91×3 → 94×2 → 97×1 @ ≤ 8; SSB 124×3 → 128×3 → 132×2 @ ≤ 8. Bridge back-offs land on the plan weight (no plate-strip rounding). Week 10 onward is unchanged for now.
- Auto-adjust rules: Monday top bench set over RPE 8.5 → back-offs −2 kg (`BENCH_BACK_DROP`); Smith seated OHP set at RPE 9 → next set one step lighter (`RPE_DROP`); bench / SSB / trap bar RDL over the hold RPE (8.5 / 8 / 8) → next bridge week repeats that weight instead of the plan step (`HOLD_RPE`). Bench e1RM still only moves from Monday competition-grip sets.
- Thursday: Smith seated OHP first; side delts, face pull and the leg machines optional (off). Saturday: new neutral-grip camber-bar incline slot (`camber_incline`, AB-4100 in the rack); calves and DB laterals optional (off). Wednesday biceps defaults to the EZ curl in the bridge weeks.
- One-arm DB row and lean-away lateral use `hexdb1`: the hex DBs plus the 32 kg adjustable (one DB, 1 kg steps). Monday's row stays chest-supported by default; the one-arm row carries a wrist cue.
- Target RPE made obvious: a large badge with reps-left on the set window and on the rest screen's next-up card, a target chip on every open set, logged over-target RPEs in red. The RPE grid is 2 rows; the target is outlined in gold, values above it are red, and a line under the grid says what happens if you log it (no confirm step). Sets keep their target in `rpeT` after logging. T's simple mode gets a Japanese reps-left badge.

### v5.6 (3 Nov 2026)
- Monday row slot defaults to the chest-supported DB row (AB-4100): no hand braced flat on the bench. One-arm DB row stays in the dropdown. With no chest-supported history yet, the first suggestion is ~75% of the last one-arm row (`FIRST_FROM`).
- e1RM in reduced weeks: deload, light and peak weeks (`isReducedWeek`) no longer change e1RM; the session is still logged and Adjustments says what was skipped. Exceptions (`e1CountsSet`): tested sets (the SSB test) and the bench checkpoint top triple. A first estimate (no e1RM yet) still counts.
- e1RM drop cap: one normal-week session can lower e1RM by at most 2.5% (`E1_DROP_CAP`); the uncapped estimate is kept on the history entry (`est`), shown on the done screen and in Adjustments. Tested sets are never capped.
- One-off `gym_fix_v56`: e1RM estimates logged in a deload week are taken out of the e1RM history; if the latest entry was one, e1RM goes back to the latest normal value (31 Oct SSB 134.3 → 137.5; bench stays 102.8). Removed entries are kept in `gym_fix_v56`. A saved accessory rest of 75 s (the old default) moves to 90 s.
- Notion outbox (`gym_outbox`, per profile): every ended session's payload is kept from END until Notion confirms it. SAVE and HOME refresh it with notes and check-in. Sent when the app opens, when the phone comes back online, or from the home card (SEND / DISCARD). The session still open on the done screen is never sent by the outbox.
- A3 accessories target RPE 8–9 (`rpeLo` 8, `rpe` 9; dead hangs stay timed). The set window shows "@ RPE 8–9"; the effort nudge fires when last time averaged ≤ 7; double progression steps up when every set reaches the top of the range at ≤ 9. Deload weeks cap at 7. The nudge and the progression cap now read the set's target (`rpeT`), not a value logged into it.
- Rebalance: Thursday chest fly and pushdown are Programme B (Nano) only. Wednesday gains 3 × 10–12 DB incline curls (not in Programme B). Saturday DB laterals are on by default. Weekly targets: triceps 6, side delts 7, biceps 6, chest fly row removed. At home (warehouse closed), Thursday's overhead triceps falls back to the DB overhead extension instead of dips.
- Rest: Monday light pause squat has its own 2:00 (`SQL`, Settings → Light pause squat); accessories (A3) default 75 → 90 s.
- Bench milestones: rows read "✓ MET · date" or "not yet"; the header counts met milestones; the done screen announces a milestone the day it is met.
- Tests: the v5.4 suite moved to `tests/v54.js` (the stale v5.1 `tests/run.js` is removed); version checks in v54/v55 accept later versions, and checks that described v5.4/v5.5 behaviour changed here were updated. New `tests/v56.js`.

### v5.5 (2 Nov 2026)
- "Last time" skips reduced weeks: suggestions (reps and weight), double progression, the effort nudge, S2R caps and the lighter-than-last flag look back to the most recent normal session, skipping deload, light and peak weeks (`isReducedWeek`: `wk.deload`, or B3 week 2+). If an exercise only has reduced-week history, that is used.
- Missing-set fallback for every exercise: when last time had fewer sets (deload, or a session cut short), later sets use the last logged set instead of dropping to the bottom of the rep range (was family exercises only).
- The "last time" hint in the set popup shows the same session the suggestion uses, labelled "(before deload)" / （ディロード前） when a reduced week was skipped; the suggestion reason says "before deload" too.
- PR hold-off: a PR is flagged and counted only once the exercise has 2 normal sessions behind it (counts from the 3rd; `PR_MIN_PRIOR`). Reduced-week sessions don't count. Bests are still recorded every session.
- New check file `tests/v55.js` (25 checks; `CHROME=/path/to/chrome` to use an installed browser).

### v5.4 (25 Oct 2026)
- Week: Mon heavy BD bench (priority lift + calibration; a ~90% single before the top set in Blocks 2 and 4) → light SSB pause squat 3×4 @ RPE ≤ 6 → one-arm DB row (on) → lean-away lateral → EZ curl 3×8–12 → dead hang. Wed: close-grip BD bench 4×5–6 @ ≤ 8 → dead-hang warm-up → chin-ups → camber row → EZ skull → DB rear fly (dips optional). Thu (warehouse, 11 slots): Smith incline, pulldown, Smith seated OHP, seated row, cable fly, overhead extension, pushdown, cable lateral, face pull, leg curl, leg extension. Sat: SSB wedge as a weekly priority lift (Block 2: top 3 + 3×4 @ 88%), paused bench 3×4 @ 7, trap bar RDL 3×6–8 @ ≤ 7.5, calves, optional laterals. Friday retired (rest / easy ride). The fixed-load Saturday rule and all `defB` block swaps are gone.
- Blocks (`weekInfo`): B1 wk1–5 · B2 wk6–9 · B3 = peak wk10–11 + checkpoint wk12 · LT light wk13–14 · VOL wk15–19 (19 deload) · STR wk20–23 · TW test window wk24 · POST. Notion Block names: PEAK, LIGHT, B3 (VOL), B4 (STR), TEST (`blockLabel`). Calibration also runs in VOL / STR.
- Bench checkpoint Mon 14 Dec (top 3 @ ≤ 9, no max) replaces the Wed 16 Dec test; the any-day test card always shows. SSB e1RM updates every Saturday; "Pause squat e1RM" is a record only. Bench e1RM comes from Monday's sets and the any-day test only. Bench goal 105.
- AB-4100 and all fixed DBs at home: DB incline / seated press / chest-supported row are home exercises; new DB incline curl, KB swing (`kb` equipment). Settings → Warehouse closed (default 1 Dec – 31 Jan) runs Thursday at home with each slot's first home pick.
- Per-set variants: camber bench / row / bent row handles and FT / lat-machine attachments are chosen inside the set window; later sets follow; each variant keeps its own history (old single-grip ids are the variants); Notion Sets table gains a Variant column.
- Gym Nano: Settings → off / preview / installed. Preview shows Programme B cards (WED · B, THU · B at home) with START and logging off. Installed applies `nanoDef` / `nanoHome` / `nanoOnly` / `nanoSkip`. New `nano` equipment (3.5–100 kg, 0.5 kg steps).
- DB ceiling: heaviest DB + top of range → 3 s lowering / 1 s pause suggestion, a flag and a counter (Settings). Setup tags (AB-4100 angle, rack height, Nano anchor) with a warning when the order repeats a change. Bench milestones M1–M5 and a weekly sets-per-muscle review on home. Post-session check-in (enjoyment 1–5, worst joint 0–10) → new Notion columns Enjoyment and Joint pain.
- Tuesday downgrade looks at Monday's legs only. One-off `gym_fix_v54`: pull-ups / chin-ups unlocked, closure dates and Nano setting seeded.

### v5.3 (24 Oct 2026)
- Warm-up ladder with reps on every lift that has a warm-up chip (`wuSteps`), not just P1 barbell lifts. First lift of the session: bar×8 → 50%×5 → 70%×3 → 85%×1 (P1) / 85%×2 (others); later lifts: 60%×5 → 80%×2. Percentages of the first working set. Shown on the card and in the log popup until set 1 is logged; text made readable.
- Logging the warm-up chip starts a "→ S1" countdown: 2:00, or 2:30 when the ladder ended on an 85% single. No timer between ladder steps. Settings → Rest: `WU`, `WU1`.
- Saturday SSB volume has its own rest (`SQV`, 3:30) instead of sharing S2.
- Saturday SSB volume reads "RPE 7–8" everywhere (rx cap 8, day note, rx line, set target), matching the existing progression gate (`FIX_RPE_MAX` = 8).
- Bench test can be started any day (home → BENCH TEST · ANY DAY). Its best logged single becomes the bench e1RM directly (`src:'test'`, no RPE estimate or offset) and is written to Adjustments; Notion Type "W26 BENCH TEST".
- One-off (`gym_fix_v53test`): the 100 kg single on Fri 23 Oct (done outside the app) recorded as a tested bench e1RM of 100.
- Notion: new "Pause squat e1RM" column (Monday SSB pause squat, moves weekly). "SSB e1RM" stays the Saturday wedge squat, which only moves on the 12 Dec test.

### v5.2 (21 Oct 2026)
- Mon: SSB pause squat → BD bench volume → one-arm DB row (optional, off by default, 3 × 10–12 @ RPE 8 per arm) → DB lateral raise → dead hang. Wed: side delts removed (~65 min); press alternative is now seated DB press on the flat bench.
- All fixed DB pairs are at home: default and one-time settings migration (`v52db`). Warehouse sessions (V Thu/Fri, T warehouse) offer no DB picks; adjustable-bench DB moves (incline, chest-supported row, seated press) removed from every template. Exercise definitions and history are kept.
- RPE offset now used, one way (`rpeAdj`): an offset that lowers e1RM applies at once; one that raises it applies only when the last two calibrations of that lift agree within 1 RPE. Capped at ±1. Raw e1RM kept in the e1RM history and written to Adjustments. One-off re-score of the latest e1RM since the last calibration (`gym_fix_v52off`): 21 Oct bench 101.25 → 99.23.
- Profile display name T.

### v5.1
- Week: Mon SSB+BD bench vol+hang; Tue ride (A sweet spot / B easy); Wed bench heavy → camber OHP → camber row → skulls → laterals → curl; Fri +FT rear-delt fly; Sat SSB fixed load; Sun optional easy ride.
- DB input is ONE dumbbell ("kg per DB"); per-exercise load modes (`exMode`/`DB_SINGLE`). Stored history and Notion volumes are NOT rewritten.
- Tuesday A/B, readiness downgrade (own record `gym_tue_down`, legs-heavy toggle `gym_legs_heavy`), Wednesday make-up chip.
- Removed the hard-Zwift → Monday squat cap rule.
- Saturday SSB fixed load 93 kg 4×8 @ RPE ≤8 (`gym_satfix`): +1 rep to 10, then +2 kg.
- Weekend slip: Sat logged on Sunday → Monday SSB light (RPE ≤7, no AMRAP).

- **v5.0 (Winter 2026 rewrite)** — Week: Mon A (home) · Tue Zwift, no gym · Wed B (home) · Thu C (warehouse) · Fri optional (warehouse, never missed) · Sat D (home) · Sun rest. New templates per the spec; new lifts with their own history (SSB pause squat wedge, BD bench volume, SSB volume wedge, camber bent row, dead hangs). SSB pause squat e1RM seeded at 124 until a calibration replaces it. Bench test moved to Wed 16 Dec (SSB test stays Sat 12 Dec). RPE calibration set on the last back-off of Mon (pause squat) and Wed (bench heavy), about every 4 weeks, never in a deload week; predicted/actual reps, implied e1RM = load × (1 + reps/30), proposed change applied only on confirm, RPE offset stored per lift, every result written to Adjustments. Dead hangs in seconds (start 2 × 10 s, +5 s when both sets are clean, wrist-pain toggle, pull-ups hidden until 2 × 30 s). Dips are an optional extra on Wed. Monday body-weight prompt (optional). "Hard Zwift tomorrow caps squats at RPE 7" is now off by default (Settings); TSB < −15 rule kept. Notion Type "W26 WED" is written for Wednesday sessions. Past sessions are untouched.
- **v4.5 (28 Sep 2026)** — Weighed bar weights (SSB 30, BD 20, EZ 15.9, camber 20.2, trap 34.5, Gymway 15.6 kg; exact, never rounded); stored sleeve totals, PRs and e1RMs recalculated once from per-sleeve × 2 + bar (bench untouched); P1 back-offs only remove plates from the top set's stack (closest candidate, tie → lighter, > 1 kg/sleeve away → normal rounding); e1RM shown and sent to Notion to one decimal.
- **v4.4 (27 Sep 2026)** — Week layouts A/B (default B: hard Zwift Tue, easy Thu evening; T Z2 Mon, quality Fri); ride cards and bike icons; Saturday laterals + core off by default; effort nudge (+3 reps when last time averaged ≥2 RPE under target); per-set Time + Rest in the Notion table and median rest in the notes; last duration on day cards; light squat ends after a set over RPE 7 when the hard ride is tomorrow; rest timer by tier (P1 180 · S2 120 · A3 75 · core 45 s, editable); one-off fix for the 21 Sep bench top set (60 → 70 kg, e1RM 87.5).
- **v4.3 (27 Sep 2026)** — Friday: KAZ single-arm curl default, rear-delt fly default, cuff lateral + KAZ D-mode hammer options, woodchop on the neoprene strap. Thursday: KAZ D-mode fly options.
- **v4.2 (24 Sep 2026)** — T's profile (simple mode, Japanese).
