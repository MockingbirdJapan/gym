// v5.5 checks — run from the repo root:  node tests/v55.js
// Needs Playwright (npm i -D playwright && npx playwright install chromium).
// Optional: CHROME=/path/to/chrome to use an installed browser instead of Playwright's download.
// Covers: reduced-week (deload / light / peak) sessions skipped as "last time", last-set fallback for every
// exercise, the "(before deload)" hint, the PR hold-off (PRs count from an exercise's 3rd normal session),
// and a smoke test that every V template starts without JS errors.
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  fs.createReadStream(path.join(ROOT, 'index.html')).pipe(res);
});
let pass = 0, fail = 0; const fails = [];
function ok(cond, name, info) { if (cond) pass++; else { fail++; fails.push(name); } console.log((cond ? '  ✓ ' : '  ✗ ') + name + (cond || info === undefined ? '' : '  → ' + JSON.stringify(info))); }

const MON02N = '2026-11-02T10:00:00+09:00'; // week 6, B2 — first Monday after the week-5 deload

// EZ curl (ezHome, 15.9 kg bar): 21 Oct normal 8/12/12, 26 Oct deload 8/12 (2 sets)
const set = (inn, reps, rpe) => ({ kind: 'work', in: inn, total: Math.round((15.9 + 2 * inn) * 10) / 10, reps, rpe });
const EZ_NORMAL = { date: '2026-10-21T01:00:00.000Z', day: '2026-10-21', session: 'WED', week: 4, block: 'B1', tier: 'A3', eq: 'ezHome',
  sets: [set(10.5, 8, 7.5), set(10.5, 12, 7.5), set(10.5, 12, 7)] };
const EZ_DELOAD = { date: '2026-10-26T04:00:00.000Z', day: '2026-10-26', session: 'MON', week: 5, block: 'B1', tier: 'A3', eq: 'ezHome',
  sets: [set(10.5, 8, 7), set(10.5, 12, 7.5)] };
const EZ_SHORT = { date: '2026-10-19T04:00:00.000Z', day: '2026-10-19', session: 'MON', week: 4, block: 'B1', tier: 'A3', eq: 'ezHome',
  sets: [set(10.5, 9, 7), set(10.5, 11, 7.5)] }; // a normal week cut short at 2 sets

function seed(history, prs) {
  return new Function(`
    localStorage.clear();
    ['gym_v4_migrated','gym_bars_0928','gym_dur_seeded','gym_fix_b0921','gym_fix_v52off','gym_fix_v53test','gym_fix_v54','gym_satfix']
      .forEach(k => localStorage.setItem(k, '1'));
    localStorage.setItem('gym_profile','V');
    localStorage.setItem('gym_key','dummy'); localStorage.setItem('gym_db','dummy');
    localStorage.setItem('gym_history', ${JSON.stringify(JSON.stringify(history))});
    localStorage.setItem('gym_prs', ${JSON.stringify(JSON.stringify(prs || {}))});
  `);
}

async function page(browser, when, history, prs) {
  const ctx = await browser.newContext({ timezoneId: 'Asia/Tokyo', viewport: { width: 390, height: 844 } });
  const pg = await ctx.newPage();
  await pg.clock.setFixedTime(new Date(when));
  pg._errs = [];
  pg.on('pageerror', e => pg._errs.push(e.message));
  pg.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) pg._errs.push(m.text()); });
  await pg.route('**/notion-proxy**', r => r.fulfill({ status: 503, body: '{}' }));
  await pg.goto(URL);
  await pg.evaluate(seed(history, prs)); await pg.reload(); await pg.waitForTimeout(300);
  return pg;
}

// EZ curl on Monday: suggested reps + weight per working set, plus the "last time" hint text for each set
const EZ_PROBE = () => {
  beginSession('MON');
  const ei = S.exercises.findIndex(e => e.exId === 'ez_curl');
  if (ei < 0) return { missing: true };
  const ex = S.exercises[ei];
  const out = [];
  ex.sets.forEach((s, si) => {
    if (s.kind === 'wu') return;
    const sg = suggestFor(ex, si);
    let ghost = null;
    try { openModal(ei, si); ghost = document.getElementById('kg-ghost').textContent; closeModal && closeModal(); } catch (e) { ghost = 'ERR ' + e.message; }
    out.push({ reps: suggestedReps(ex, si), v: sg && sg.v, why: sg && sg.why, ghost });
  });
  return out;
};

let URL;
(async () => {
  await new Promise(r => server.listen(0, r));
  URL = `http://127.0.0.1:${server.address().port}/`;
  const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});

  console.log('Reduced-week detection');
  {
    const pg = await page(browser, MON02N, {});
    const r = await pg.evaluate(() => ({
      v: APP_VERSION,
      w4: isReducedEntry({ day: '2026-10-21' }), w5: isReducedEntry({ day: '2026-10-26' }), w6: isReducedEntry({ day: '2026-11-02' }),
      w10: isReducedEntry({ day: '2026-11-30' }), w11: isReducedEntry({ day: '2026-12-07' }), w13: isReducedEntry({ day: '2026-12-21' }),
      w19: isReducedEntry({ day: '2027-02-01' }), w20: isReducedEntry({ day: '2027-02-08' }),
      dateOnly: isReducedEntry({ date: '2026-10-26T04:00:00.000Z' }), none: isReducedEntry({}),
    }));
    ok(r.v === '5.5', 'version 5.5', r.v);
    ok(!r.w4 && r.w5 && !r.w6, 'wk4 normal · wk5 deload reduced · wk6 normal', r);
    ok(!r.w10 && r.w11, 'wk10 opener practice normal · wk11 peak reduced', r);
    ok(r.w13 && r.w19 && !r.w20, 'wk13 light · wk19 deload reduced · wk20 normal', r);
    ok(r.dateOnly && !r.none, 'entry with only a timestamp is classified · empty entry is not', r);
    ok(!pg._errs.length, 'no JS errors on load', pg._errs);
    await pg.close();
  }

  console.log('Post-deload suggestions (EZ curl, Mon 2 Nov)');
  {
    const pg = await page(browser, MON02N, { ez_curl: [EZ_NORMAL, EZ_DELOAD] });
    const r = await pg.evaluate(EZ_PROBE);
    ok(Array.isArray(r) && r.length === 3, '3 working sets', r);
    if (Array.isArray(r) && r.length === 3) {
      ok(r.map(x => x.reps).join('/') === '9/12/12', 'reps 9/12/12 from the 21 Oct session, not 10/12/8', r.map(x => x.reps));
      ok(r.every(x => x.v === 10.5), 'weight 10.5/sleeve on every set', r.map(x => x.v));
      ok(/before deload/.test(r[0].why || ''), 'suggestion says "before deload"', r[0].why);
      ok(r.every(x => /^last time \(before deload\)/.test(x.ghost || '')), 'hint labelled "(before deload)" on every set', r.map(x => x.ghost));
      ok(/×12/.test(r[2].ghost || ''), 'set 3 hint shows the 21 Oct set 3 (×12)', r[2].ghost);
    }
    ok(!pg._errs.length, 'no JS errors', pg._errs);
    await pg.close();
  }

  console.log('Only reduced-week history → use it');
  {
    const pg = await page(browser, MON02N, { ez_curl: [EZ_DELOAD] });
    const r = await pg.evaluate(EZ_PROBE);
    ok(Array.isArray(r) && r.length === 3 && r.map(x => x.reps).join('/') === '9/12/12', 'deload-only: 9/12/12 (set 3 falls back to the last logged set)', r && r.map && r.map(x => x.reps));
    ok(Array.isArray(r) && !/before deload/.test(r[0].ghost || ''), 'no "(before deload)" label when nothing was skipped', r && r[0] && r[0].ghost);
    await pg.close();
  }

  console.log('Short normal session → last-set fallback');
  {
    const pg = await page(browser, MON02N, { ez_curl: [EZ_SHORT] });
    const r = await pg.evaluate(EZ_PROBE);
    ok(Array.isArray(r) && r.length === 3 && r.map(x => x.reps).join('/') === '10/12/12', 'cut-short 9/11 → 10/12/12 (set 3 = last set + 1)', r && r.map && r.map(x => x.reps));
    await pg.close();
  }

  console.log('Effort nudge and progression ignore the deload');
  {
    // deload logged very easy (RPE 5) would trigger the +3 nudge; the 21 Oct baseline (RPE 7–7.5) must not
    const easyDl = JSON.parse(JSON.stringify(EZ_DELOAD)); easyDl.sets.forEach(s => s.rpe = 5);
    const pg = await page(browser, MON02N, { ez_curl: [EZ_NORMAL, easyDl] });
    const r = await pg.evaluate(() => { beginSession('MON'); const ex = S.exercises.find(e => e.exId === 'ez_curl'); return { nudge: easyNudge(ex), ol: accessoryOverload(ex) }; });
    ok(r.nudge == null, 'no +3 nudge from an easy deload', r.nudge);
    await pg.close();
  }

  console.log('PR hold-off');
  {
    // log a heavier EZ curl set (12/sleeve = 39.9 kg) against a 36.9 kg best
    const probe = () => {
      beginSession('MON'); S.sessionStart = Date.now();
      const ex = S.exercises.find(e => e.exId === 'ez_curl'); const eq = exEq(ex);
      const s = ex.sets.find(x => x.kind !== 'wu'); s.in = 12; s.total = toTotal(eq, 12); s.reps = 8; s.rpe = 8;
      return { pr: isNewPR(ex, s), ready: prReady(histKey(ex)), prior: priorNormalCount(histKey(ex)) };
    };
    const prs = { ez_curl: 36.9 };
    let pg = await page(browser, MON02N, { ez_curl: [EZ_NORMAL] }, prs);
    let r = await pg.evaluate(probe);
    ok(r.prior === 1 && r.pr === false, '1 normal session behind it → no PR flag', r);
    await pg.close();

    pg = await page(browser, MON02N, { ez_curl: [EZ_NORMAL, EZ_DELOAD] }, prs);
    r = await pg.evaluate(probe);
    ok(r.prior === 1 && r.pr === false, '1 normal + 1 deload → still no PR flag (deloads don\'t count)', r);
    await pg.close();

    pg = await page(browser, MON02N, { ez_curl: [EZ_SHORT, EZ_NORMAL, EZ_DELOAD] }, prs);
    r = await pg.evaluate(probe);
    ok(r.prior === 2 && r.pr === true, '2 normal sessions behind it → PR flag', r);
    await pg.close();

    // end-of-session count and record: held-off PR is not counted but the best is still recorded
    pg = await page(browser, MON02N, { ez_curl: [EZ_NORMAL] }, prs);
    r = await pg.evaluate(() => {
      beginSession('MON'); S.sessionStart = Date.now() - 30 * 60000;
      S.exercises.forEach(e => { if (e.exId !== 'ez_curl') e.skipped = true; });
      const ex = S.exercises.find(e => e.exId === 'ez_curl'); const eq = exEq(ex);
      ex.sets.filter(x => x.kind !== 'wu').forEach(s => { s.in = 12; s.total = toTotal(eq, 12); s.reps = 8; s.rpe = 8; });
      endSession();
      return { count: S.lastSummary.prCount, best: S.prs.ez_curl };
    });
    ok(r.count === 0, 'held-off PR not counted in the session summary', r);
    ok(Math.abs(r.best - 39.9) < 0.01, 'best still recorded (39.9 kg)', r);
    ok(!pg._errs.length, 'no JS errors ending a session', pg._errs);
    await pg.close();
  }

  console.log('Smoke: every V template starts');
  {
    const pg = await page(browser, MON02N, { ez_curl: [EZ_NORMAL, EZ_DELOAD] });
    const r = await pg.evaluate(() => ['MON', 'WED', 'THU', 'SAT'].map(k => {
      try { beginSession(k); S.exercises.forEach((ex, ei) => ex.sets.forEach((s, si) => { if (exEq(ex).type !== 'none') suggestFor(ex, si); if (s.lo != null) suggestedReps(ex, si); }));
        return k + ':' + S.exercises.length; } catch (e) { return k + ':ERR ' + e.message; }
    }));
    ok(r.every(x => !/ERR/.test(x)), 'MON / WED / THU / SAT build and suggest', r);
    ok(!pg._errs.length, 'no JS errors', pg._errs);
    await pg.close();
  }

  await browser.close(); server.close();
  console.log(`\n${pass} passed, ${fail} failed`); if (fail) { console.log('FAILED: ' + fails.join('\n        ')); process.exit(1); }
})().catch(e => { console.error(e); process.exit(1); });
