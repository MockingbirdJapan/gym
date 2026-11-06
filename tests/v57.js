// v5.7 checks — run from the repo root:  node tests/v57.js
// Needs Playwright (npm i -D playwright && npx playwright install chromium).
// Optional: CHROME=/path/to/chrome to use an installed browser instead of Playwright's download.
// Covers: the B2 bridge (weeks 7–9) targets, Thursday / Saturday layout, the 32 kg adjustable DB,
// the auto-adjust rules (bench −2 kg, Smith OHP drop, next-week holds), bench e1RM from Monday only,
// and the target-RPE display (badge, 2-row grid, target / over-target buttons, warning line, rest card, set chips).
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  fs.createReadStream(path.join(ROOT, 'index.html')).pipe(res);
});
let pass = 0, fail = 0; const fails = [];
function ok(cond, name, info) { if (cond) pass++; else { fail++; fails.push(name); } console.log((cond ? '  ✓ ' : '  ✗ ') + name + (cond || info === undefined ? '' : '  → ' + JSON.stringify(info))); }

const MON09 = '2026-11-09T10:00:00+09:00', WED11 = '2026-11-11T10:00:00+09:00', THU12 = '2026-11-12T16:00:00+09:00', SAT14 = '2026-11-14T10:00:00+09:00';
const MON16 = '2026-11-16T10:00:00+09:00', THU19 = '2026-11-19T16:00:00+09:00', SAT21 = '2026-11-21T10:00:00+09:00';
const MON23 = '2026-11-23T10:00:00+09:00', SAT28 = '2026-11-28T10:00:00+09:00', MON30 = '2026-11-30T10:00:00+09:00';

const SKIP_FIXES = ['gym_v4_migrated', 'gym_bars_0928', 'gym_dur_seeded', 'gym_fix_b0921', 'gym_fix_v52off', 'gym_fix_v53test', 'gym_fix_v54', 'gym_satfix', 'gym_fix_v56'];
const E1 = {
  bench: { cur: 102.8, hist: [{ date: '2026-09-27', v: 87.5, src: 'seed' }, { date: '2026-11-02', v: 102.8 }] },
  ssb: { cur: 137.5, hist: [{ date: '2026-09-27', v: 137.5, src: 'seed' }] },
  ssb_w: { cur: 152.8, hist: [{ date: '2026-11-06', v: 152.8 }] }
};
function seed(o) {
  o = o || {};
  return new Function(`
    localStorage.clear();
    ${JSON.stringify(SKIP_FIXES)}.forEach(k => localStorage.setItem(k, '1'));
    localStorage.setItem('gym_profile', ${JSON.stringify(o.profile || 'V')});
    localStorage.setItem('gym_key','dummy'); localStorage.setItem('gym_db','dummy');
    localStorage.setItem('gym_history', ${JSON.stringify(JSON.stringify(o.history || {}))});
    localStorage.setItem('gym_e1', ${JSON.stringify(JSON.stringify(o.e1 || E1))});
  `);
}
async function page(browser, when, o) {
  const ctx = await browser.newContext({ timezoneId: 'Asia/Tokyo', viewport: { width: 390, height: 844 } });
  const pg = await ctx.newPage();
  await pg.clock.setFixedTime(new Date(when));
  pg._errs = [];
  pg.on('pageerror', e => pg._errs.push(e.message));
  pg.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) pg._errs.push(m.text()); });
  await pg.route('**/notion-proxy**', r => r.fulfill({ status: 503, body: '{}' }));
  await pg.goto(URL);
  await pg.evaluate(seed(o)); await pg.reload(); await pg.waitForTimeout(300);
  return pg;
}
// in-page helpers
const H = `
window.__ex = id => S.exercises.find(e => e.exId === id);
window.__ws = id => { const ex = __ex(id); return ex.sets.map((s, i) => ({ s, i })).filter(x => x.s.kind !== 'wu'); };
window.__sg = (id, n) => { const ex = __ex(id); const w = __ws(id)[n || 0]; const g = suggestFor(ex, w.i); return g ? toTotal(exEq(ex), g.v) : null; };
window.__in = (id, n) => { const ex = __ex(id); const w = __ws(id)[n || 0]; const g = suggestFor(ex, w.i); return g ? g.v : null; };
window.__log = (id, n, inv, reps, rpe) => { const ex = __ex(id); const eq = exEq(ex); const s = __ws(id)[n].s; s.in = inv; s.total = toTotal(eq, inv); s.reps = reps; s.rpe = rpe; s.at = Date.now(); };
`;
const hist = (id, day, session, sets) => ({ [id]: [{ day, session, date: day + 'T10:00:00.000Z', sets }] });

let URL;
(async () => {
  await new Promise(r => server.listen(0, r));
  URL = `http://127.0.0.1:${server.address().port}/`;
  const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
  let p, r;

  console.log('Version + bridge calendar');
  p = await page(browser, MON09, {});
  r = await p.evaluate(() => ({ v: APP_VERSION, w: [weekInfo('2026-11-09'), weekInfo('2026-11-23'), weekInfo('2026-11-30'), weekInfo('2026-11-02')].map(w => [w.w, inBridge(w)]) }));
  ok(r.v === '5.7', 'APP_VERSION is 5.7', r.v);
  ok(JSON.stringify(r.w) === '[[7,true],[9,true],[10,false],[6,false]]', 'bridge = weeks 7–9 only (9 Nov – 28 Nov)', r.w);
  await p.close();

  console.log('Monday week 7');
  p = await page(browser, MON09, {});
  r = await p.evaluate(H + `beginSession('MON');
    const b = __ex('bench_bd'); const kinds = b.sets.filter(s => s.kind !== 'wu').map(s => s.kind + s.r);
    const out = { kinds, top: __sg('bench_bd', 0), back: __sg('bench_bd', 1), sq: __sg('ssb_pause_w', 0), sqN: __ws('ssb_pause_w').length,
      row: S.exercises.find(e => e.slot === 'mon_row').exId, lat: __in('db_leanaway', 0), curl: __in('ez_curl', 0) };
    __log('bench_bd', 0, 35.5, 3, 9); out.backOver = __sg('bench_bd', 1);
    __log('bench_bd', 0, 35.5, 3, 8); out.backOk = __sg('bench_bd', 1);
    out; `);
  ok(r.kinds.join(',') === 'top3,back4,back4,back4,back4', 'bench: TOP ×3 + 4×4 back-offs, no opener single', r.kinds);
  ok(r.top === 91 && r.back === 84, 'bench plan: 91 kg top, 84 kg back-offs', [r.top, r.back]);
  ok(r.backOver === 82 && r.backOk === 84, 'rule: top logged @ 9 (> 8.5) → back-offs −2 kg (84 → 82); @ 8 → 84', [r.backOver, r.backOk]);
  ok(r.sq === 95 && r.sqN === 3, 'pause squat 3 × 4 @ 95 kg (≤ 97 after the max singles)', [r.sq, r.sqN]);
  ok(r.row === 'db_chest_row', 'Monday row stays chest-supported (left wrist, 3 Nov)', r.row);
  ok(r.lat === 10 && r.curl === 10.5, 'lean-away 10 kg · EZ curl 10.5/sleeve', [r.lat, r.curl]);
  r = await p.evaluate(H + `const ex = S.exercises.find(e => e.slot === 'mon_row'); const sel = { value: 'db_row_1arm' }; swapAltSel(S.exercises.indexOf(ex), sel);
    ({ in: __in('db_row_1arm', 0), ws: validWeights(exEq(__ex('db_row_1arm'))).filter(w => w > 27.5) })`);
  ok(r.in === 27.5 && r.ws.join(',') === '28,29,30,31,32', 'one-arm row if picked: 27.5 kg; the 32 kg adjustable adds 28–32 in 1 kg steps', r);
  ok(!p._errs.length, 'no JS errors (Monday)', p._errs);
  await p.close();

  console.log('Wednesday / Thursday / Saturday week 7');
  p = await page(browser, WED11, {});
  r = await p.evaluate(H + `beginSession('WED'); ({ cg: __sg('bench_bd_cg', 0), n: __ws('bench_bd_cg').length, curl: S.exercises.find(e => e.slot === 'wed_curl').exId, ci: __in('ez_curl', 0), sk: __in('ez_skull', 0) })`);
  ok(r.cg === 78 && r.n === 4, 'close-grip bench 4 × 6 @ 78 kg', r);
  ok(r.curl === 'ez_curl' && r.ci === 11 && r.sk === 10, 'Wed: EZ curl 11/sleeve (default in bridge weeks), skull crusher 10/sleeve', r);
  await p.close();
  p = await page(browser, THU12, { history: hist('smith_seated_ohp', '2026-11-05', 'THU', [{ kind: 'work', in: 30, total: 60, reps: 10, rpe: 9 }, { kind: 'work', in: 30, total: 60, reps: 9, rpe: 10 }, { kind: 'work', in: 30, total: 60, reps: 6, rpe: 10 }]) });
  r = await p.evaluate(H + `beginSession('THU'); const live = S.exercises.filter(e => !e.skipped).map(e => e.slot);
    const o = { live, ohp: __in('smith_seated_ohp', 0), inc: __in('smith_incline', 0), incN: __ws('smith_incline').length };
    __log('smith_seated_ohp', 0, 27.5, 10, 9); o.after9 = __in('smith_seated_ohp', 1);
    __log('smith_seated_ohp', 0, 27.5, 10, 8); o.after8 = __in('smith_seated_ohp', 1); o`);
  ok(r.live.join(',') === 'thu_ohp,thu_incline,thu_pd,thu_row,thu_ohe', 'Thursday: Smith OHP first, 5 exercises (laterals, face pull, legs off)', r.live);
  ok(r.ohp === 27.5, 'Smith OHP restarts at 27.5/side (was 30 × 10/9/6)', r.ohp);
  ok(r.inc === 22.5 && r.incN === 4, 'Smith incline 4 × 8–10 @ 22.5/side', r);
  ok(r.after9 === 26.25 && r.after8 === 27.5, 'rule: OHP set @ 9 → next set −1.25/side; @ 8 → same', [r.after9, r.after8]);
  await p.close();
  p = await page(browser, SAT14, {});
  r = await p.evaluate(H + `beginSession('SAT'); ({ live: S.exercises.filter(e => !e.skipped).map(e => e.exId), top: __sg('ssb_w', 0), back: __sg('ssb_w', 1),
    nb: __ws('ssb_w').filter(x => x.s.kind === 'back').length, pb: __sg('bench_bd_pause', 0), pbN: __ws('bench_bd_pause').length, rdl: __sg('trap_rdl', 0), ci: __sg('camber_incline', 0) })`);
  ok(r.live.join(',') === 'ssb_w,bench_bd_pause,trap_rdl,camber_incline', 'Saturday: SSB, paused bench, trap bar RDL, camber incline (calves, laterals off)', r.live);
  ok(r.top === 124 && r.back === 112 && r.nb === 2, 'SSB top 124 × 3, 2 back-offs @ 112', r);
  ok(r.pb === 74 && r.pbN === 4 && r.rdl === 108.5 && r.ci === 55.2, 'paused bench 4 × 4 @ 74 · RDL 108.5 · camber incline 55.2', r);
  ok(!p._errs.length, 'no JS errors (Wed/Thu/Sat)', p._errs);
  await p.close();

  console.log('Week 8 / 9 progression and next-week holds');
  p = await page(browser, MON16, { history: hist('bench_bd', '2026-11-09', 'MON', [{ kind: 'top', in: 35.5, total: 91, reps: 3, rpe: 8 }]) });
  r = await p.evaluate(H + `beginSession('MON'); ({ top: __sg('bench_bd', 0), back: __sg('bench_bd', 1), sq: __sg('ssb_pause_w', 0), sqN: __ws('ssb_pause_w').length, lat: __in('db_leanaway', 0) })`);
  ok(r.top === 94 && r.back === 85 && r.sq === 99 && r.sqN === 4 && r.lat === 11, 'wk 8: bench 94 × 2 / 85 · pause squat 4 × 4 @ 99 · lean-away 11 kg', r);
  await p.close();
  p = await page(browser, MON16, { history: hist('bench_bd', '2026-11-09', 'MON', [{ kind: 'top', in: 35.5, total: 91, reps: 3, rpe: 9 }]) });
  r = await p.evaluate(H + `beginSession('MON'); ({ top: __sg('bench_bd', 0) })`);
  ok(r.top === 91, 'rule: wk 7 top @ 9 → wk 8 top repeats 91 kg', r.top);
  await p.close();
  p = await page(browser, SAT21, { history: Object.assign(hist('ssb_w', '2026-11-14', 'SAT', [{ kind: 'top', in: 47, total: 124, reps: 3, rpe: 8.5 }]), hist('trap_rdl', '2026-11-14', 'SAT', [{ kind: 'work', in: 37, total: 108.5, reps: 8, rpe: 8 }])) });
  r = await p.evaluate(H + `beginSession('SAT'); ({ top: __sg('ssb_w', 0), rdl: __sg('trap_rdl', 0) })`);
  ok(r.top === 124 && r.rdl === 112.5, 'rule: SSB @ 8.5 last week → repeat 124; RDL @ 8 (not over) → 112.5', r);
  await p.close();
  p = await page(browser, THU19, { history: hist('smith_seated_ohp', '2026-11-12', 'THU', [1, 2, 3].map(() => ({ kind: 'work', in: 27.5, total: 55, reps: 10, rpe: 8 }))) });
  r = await p.evaluate(H + `beginSession('THU'); ({ ohp: __in('smith_seated_ohp', 0) })`);
  ok(r.ohp === 28.75, 'wk 8 Smith OHP: 3 × 10 in wk 7 → double progression to 28.75/side', r.ohp);
  await p.close();
  p = await page(browser, MON23, {});
  r = await p.evaluate(H + `beginSession('MON'); ({ kinds: __ws('bench_bd').map(x => x.s.kind + x.s.r).join(','), top: __sg('bench_bd', 0), back: __sg('bench_bd', 1) })`);
  ok(r.kinds === 'top1,back3,back3,back3,back3' && r.top === 97 && r.back === 88, 'wk 9: bench 97 × 1, 4 × 3 @ 88', r);
  await p.close();
  p = await page(browser, SAT28, {});
  r = await p.evaluate(H + `beginSession('SAT'); ({ top: __sg('ssb_w', 0), back: __sg('ssb_w', 1), r: __ws('ssb_w')[0].s.r })`);
  ok(r.top === 132 && r.r === 2 && r.back === 118 && r.top <= 145, 'wk 9: SSB 132 × 2, back-offs 118 (under the 145 plate cap)', r);
  await p.close();
  p = await page(browser, MON30, {});
  r = await p.evaluate(H + `beginSession('MON'); ({ b: __ws('bench_bd').map(x => x.s.kind).join(','), plan: !!__ws('bench_bd')[0].s.planTotal })`);
  ok(!r.plan, 'wk 10 (30 Nov) is outside the bridge — the older peak plan still runs (decide later)', r);
  await p.close();

  console.log('Bench e1RM: Monday competition grip only');
  p = await page(browser, WED11, {});
  r = await p.evaluate(H + `beginSession('WED'); const cg = __ex('bench_bd_cg'); ({ lift: cg.lift, slotLift: cg.slotLift })`);
  ok(r.lift === null, 'close-grip bench never carries the bench lift (no e1RM update)', r);
  await p.close();

  console.log('Target-RPE display');
  p = await page(browser, MON09, {});
  r = await p.evaluate(H + `beginSession('MON'); startLive();
    const ei = S.exercises.indexOf(__ex('bench_bd')); const si = __ws('bench_bd')[0].i; openModal(ei, si);
    const badge = document.querySelector('#modal-rpe-badge .tb-big'); const sub = document.querySelector('#modal-rpe-badge .tb-sub');
    const grid = document.getElementById('rpe-grid'); const cols = getComputedStyle(grid).gridTemplateColumns.split(' ').length;
    const btn = v => [...grid.querySelectorAll('.rp')].find(b => b.textContent === String(v));
    const o = { badge: badge && badge.textContent, sub: sub && sub.textContent, size: badge && parseFloat(getComputedStyle(badge).fontSize), cols,
      tgt: [...grid.querySelectorAll('.rp-tgt')].map(b => b.textContent), over: [...grid.querySelectorAll('.rp-over')].map(b => b.textContent) };
    btn(9).click(); o.w9 = document.getElementById('rpe-warn').textContent; o.cls9 = document.getElementById('rpe-warn').className;
    btn(8).click(); o.w8 = document.getElementById('rpe-warn').textContent;
    btn(6).click(); o.w6 = document.getElementById('rpe-warn').textContent;
    btn(9).click(); logSet(); o.restBadge = (document.querySelector('#rest-next-content .tb-big') || {}).textContent;
    o.restSub = (document.querySelector('#rest-next-content .tb-sub') || {}).textContent;
    closeModal(); o.chips = [...document.querySelectorAll('#excard-' + ei + ' .sc-tgt')].map(c => c.textContent);
    o.redLogged = !!document.querySelector('#excard-' + ei + ' .sc-rpe.over'); o`);
  ok(r.badge === '≤8' && /stop with 2 reps left/.test(r.sub) && r.size >= 30, 'set screen: big "≤8" badge with "stop with 2 reps left"', r);
  ok(r.cols === 5, 'RPE grid in 2 rows (5 columns)', r.cols);
  ok(r.tgt.join() === '8' && r.over.join() === '8.5,9,9.5,10', 'grid: 8 outlined gold, 8.5–10 red', [r.tgt, r.over]);
  ok(/Over target 8 → back-offs −2 kg, next week repeats this weight/.test(r.w9) && /over/.test(r.cls9), 'tap 9: warning line says what happens (no confirm step)', r.w9);
  ok(r.w8 === 'On target' && /Under target/.test(r.w6), 'tap 8: on target · tap 6: under target', [r.w8, r.w6]);
  ok(r.restBadge === '7' && /3 reps left/.test(r.restSub), 'rest screen: next back-off shows target RPE 7 · 3 reps left', [r.restBadge, r.restSub]);
  ok(r.chips.length === 4 && r.chips.every(c => c === '7') && r.redLogged, 'set chips: target on each open set; the logged @ 9 top set shows red', r);
  r = await p.evaluate(H + `const ei = S.exercises.indexOf(__ex('ssb_pause_w')); openModal(ei, __ws('ssb_pause_w')[0].i);
    ({ b: document.querySelector('#modal-rpe-badge .tb-big').textContent, t: [...document.querySelectorAll('#rpe-grid .rp-tgt')].map(b => b.textContent) })`);
  ok(r.b === '6–7' && r.t.join() === '6,6.5,7', 'pause squat: "6–7" badge, 6–7 outlined', r);
  ok(!p._errs.length, 'no JS errors (display)', p._errs);
  await p.close();

  console.log("T's profile");
  p = await page(browser, MON09, { profile: 'T' });
  r = await p.evaluate(() => { const k = Object.keys(TEMPLATES_T)[0]; beginSession(k); const ei = S.exercises.findIndex(e => !e.skipped && e.sets.some(s => s.kind !== 'wu' && s.lo != null));
    const ex = S.exercises[ei]; openModal(ei, ex.sets.findIndex(s => s.kind !== 'wu'));
    return { b: (document.querySelector('#modal-rpe-badge .tb-big') || {}).textContent, line: document.getElementById('modal-target').textContent, grid: getComputedStyle(document.getElementById('rpe-grid')).display }; });
  ok(r.b === 'あと2〜3回' && !/あと2〜3回/.test(r.line) && r.grid === 'none', 'simple mode: Japanese reps-left badge, no RPE grid', r);
  ok(!p._errs.length, 'no JS errors in her profile', p._errs);
  await p.close();

  await browser.close(); server.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) { console.log('FAILED:\n  ' + fails.join('\n  ')); process.exit(1); }
})();
