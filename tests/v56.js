// v5.6 checks — run from the repo root:  node tests/v56.js
// Needs Playwright (npm i -D playwright && npx playwright install chromium).
// Optional: CHROME=/path/to/chrome to use an installed browser instead of Playwright's download.
// Covers: Monday row default, e1RM rules (reduced weeks, 2.5% drop cap, test / checkpoint exceptions, one-time repair),
// A3 RPE 8–9 targets and the effort nudge, the Thursday rebalance (Programme A only), rest defaults + migration,
// the Notion outbox, and bench milestone visibility.
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  fs.createReadStream(path.join(ROOT, 'index.html')).pipe(res);
});
let pass = 0, fail = 0; const fails = [];
function ok(cond, name, info) { if (cond) pass++; else { fail++; fails.push(name); } console.log((cond ? '  ✓ ' : '  ✗ ') + name + (cond || info === undefined ? '' : '  → ' + JSON.stringify(info))); }

const DEL26 = '2026-10-26T19:00:00+09:00';  // week 5 deload (Monday)
const MON02 = '2026-11-02T19:00:00+09:00';  // week 6, B2 — normal
const SAT12D = '2026-12-12T10:00:00+09:00'; // week 11, B3 peak — SSB test day
const MON14D = '2026-12-14T19:00:00+09:00'; // week 12, B3 — bench checkpoint

const SKIP_FIXES = ['gym_v4_migrated', 'gym_bars_0928', 'gym_dur_seeded', 'gym_fix_b0921', 'gym_fix_v52off', 'gym_fix_v53test', 'gym_fix_v54', 'gym_satfix'];
// seed: { history, e1, settings, keep56 (true = mark the v5.6 repair as already done), extra: {key: value} }
function seed(o) {
  o = o || {};
  return new Function(`
    localStorage.clear();
    ${JSON.stringify(SKIP_FIXES.concat(o.keep56 === false ? [] : ['gym_fix_v56']))}.forEach(k => localStorage.setItem(k, '1'));
    localStorage.setItem('gym_profile','V');
    localStorage.setItem('gym_key','dummy'); localStorage.setItem('gym_db','dummy');
    localStorage.setItem('gym_history', ${JSON.stringify(JSON.stringify(o.history || {}))});
    ${o.e1 ? `localStorage.setItem('gym_e1', ${JSON.stringify(JSON.stringify(o.e1))});` : ''}
    ${o.settings ? `localStorage.setItem('gym_settings', ${JSON.stringify(JSON.stringify(o.settings))});` : ''}
    ${Object.entries(o.extra || {}).map(([k, v]) => `localStorage.setItem(${JSON.stringify(k)}, ${JSON.stringify(v)});`).join('\n')}
  `);
}

// notion: 'down' (503) or 'up' (200). Requests to the proxy are counted in pg._posts.
async function page(browser, when, o, notion) {
  const ctx = await browser.newContext({ timezoneId: 'Asia/Tokyo', viewport: { width: 390, height: 844 } });
  const pg = await ctx.newPage();
  await pg.clock.setFixedTime(new Date(when));
  pg._errs = []; pg._posts = 0; pg._notion = notion || 'down';
  pg.on('pageerror', e => pg._errs.push(e.message));
  pg.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) pg._errs.push(m.text()); });
  await pg.route('**/notion-proxy**', r => {
    const u = r.request().url();
    if (r.request().method() === 'POST' && !/\/query/.test(u)) pg._posts++;
    return r.fulfill(pg._notion === 'up' ? { status: 200, contentType: 'application/json', body: '{"results":[]}' } : { status: 503, body: '{}' });
  });
  await pg.goto(URL);
  await pg.evaluate(seed(o)); await pg.reload(); await pg.waitForTimeout(300);
  return pg;
}

// In-page helper: log a working set directly (total kg, reps, rpe) on the first set of a kind
const LOG = `window.__log = (exId, kind, total, reps, rpe, nth) => {
  const ex = S.exercises.find(e => e.exId === exId); if (!ex) throw new Error('no ' + exId);
  const eq = exEq(ex); const sets = ex.sets.filter(s => s.kind === kind); const s = sets[nth || 0]; if (!s) throw new Error('no ' + kind + ' set on ' + exId);
  s.total = total; s.in = fromTotal(eq, total); s.reps = reps; s.rpe = rpe; s.at = Date.now(); return ex;
};`;

const e1Seed = (bench, ssb) => ({
  bench: { cur: bench, hist: [{ date: '2026-09-27', v: 87.5, src: 'seed' }, { date: '2026-10-23', v: bench, src: 'test' }] },
  ssb: { cur: 137.5, hist: [{ date: '2026-09-27', v: 137.5, src: 'seed' }] },
  ssb_w: { cur: ssb || 137.5, hist: [{ date: '2026-10-24', v: ssb || 137.5, src: 'calibration' }] }
});

let URL;
(async () => {
  await new Promise(r => server.listen(0, r));
  URL = `http://127.0.0.1:${server.address().port}/`;
  const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
  let p, r;

  console.log('Version + calendar assumptions');
  p = await page(browser, MON02, {});
  r = await p.evaluate(() => ({ v: APP_VERSION, d26: weekInfo('2026-10-26'), d02: weekInfo('2026-11-02'), d12: weekInfo('2026-12-12'), d14: weekInfo('2026-12-14') }));
  ok(r.v === '5.6', 'APP_VERSION is 5.6', r.v);
  ok(r.d26.deload && !r.d02.deload && r.d12.block === 'B3' && r.d12.bw === 2 && r.d14.checkpoint, '26 Oct deload · 2 Nov normal · 12 Dec B3 peak · 14 Dec checkpoint', [r.d26.w, r.d02.w, r.d12.w, r.d14.w]);
  await p.close();

  console.log('Monday row default (left wrist)');
  p = await page(browser, MON02, {});
  r = await p.evaluate(() => {
    const slot = TEMPLATES.MON.slots.find(s => s.id === 'mon_row');
    beginSession('MON'); const ids = S.exercises.filter(e => !e.skipped).map(e => e.exId);
    const t = testTemplate().slots.find(s => s.id === 'mon_row');
    return { def: slot.def, picks: slot.picks, ids, tdef: t.def, note: TEMPLATES.MON.note };
  });
  ok(r.def === 'db_chest_row' && r.ids.includes('db_chest_row') && !r.ids.includes('db_row_1arm'), 'Monday session uses the chest-supported DB row', r.ids);
  ok(r.picks.includes('db_row_1arm'), 'one-arm DB row stays in the dropdown', r.picks);
  ok(r.tdef === 'db_chest_row' && /chest-supported DB row/.test(r.note), 'bench-test day and the Monday note follow the new default');
  ok(p._errs.length === 0, 'no JS errors', p._errs);
  await p.close();
  const ROW1 = { db_row_1arm: [{ date: '2026-11-02T01:00:00.000Z', day: '2026-11-02', session: 'MON', week: 6, block: 'B2', tier: 'A3', eq: 'hexdb',
    sets: [{ kind: 'work', in: 27.5, total: 27.5, reps: 12, rpe: 6 }, { kind: 'work', in: 27.5, total: 27.5, reps: 12, rpe: 6 }] }] };
  p = await page(browser, '2026-11-09T19:00:00+09:00', { history: ROW1 });
  r = await p.evaluate(() => { beginSession('MON'); const ex = S.exercises.find(e => e.exId === 'db_chest_row'); const si = ex.sets.findIndex(s => s.kind !== 'wu'); return suggestFor(ex, si); });
  ok(r && r.v === 20 && /first time · ~75% of your one-arm DB row \(27\.5 kg\)/.test(r.why), 'first chest-supported row: starts at 20 kg (~75% of the one-arm row 27.5)', r);
  await p.close();

  console.log('e1RM: deload week leaves e1RM alone');
  p = await page(browser, DEL26, { e1: e1Seed(100) });
  await p.evaluate(LOG);
  r = await p.evaluate(() => {
    beginSession('MON'); startLive();
    __log('bench_bd', 'top', 77.5, 5, 6);
    endSession();
    return { cur: S.e1.bench.cur, n: S.e1.bench.hist.length, adj: S.adjust.join(' | '), ch: S.lastSummary.e1Changes.bench || null, hist: (S.history.bench_bd || []).length };
  });
  ok(r.cur === 100 && r.n === 2 && !r.ch, 'deload bench top set 77.5 × 5 @ 6 → e1RM stays 100, nothing added to e1RM history', r);
  ok(/deload week — today's estimate .* not applied; e1RM stays 100/.test(r.adj), 'Adjustments explain the skip', r.adj);
  ok(r.hist === 1, 'the session is still logged in exercise history');
  await p.close();

  console.log('e1RM: 2.5% drop cap in normal weeks');
  p = await page(browser, MON02, { e1: e1Seed(100) });
  await p.evaluate(LOG);
  r = await p.evaluate(() => {
    beginSession('MON'); startLive();
    __log('bench_bd', 'top', 80, 3, 8); // 80 × 3 @ 8 → 93.3
    endSession();
    const h = S.e1.bench.hist.slice(-1)[0];
    return { cur: S.e1.bench.cur, est: h.est, ch: S.lastSummary.e1Changes.bench, adj: S.adjust.join(' | '), done: document.getElementById('done-e1').textContent };
  });
  ok(r.cur === 97.5 && Math.abs(r.est - 93.33) < 0.01, 'a low normal-week session drops e1RM by at most 2.5% (100 → 97.5; estimate 93.3 kept on the entry)', r);
  ok(r.ch.capped && /drop capped/.test(r.adj) && /drop capped at −2.5%/.test(r.done), 'cap shown in Adjustments and on the done screen', r.done);
  await p.close();
  p = await page(browser, MON02, { e1: e1Seed(100) });
  await p.evaluate(LOG);
  r = await p.evaluate(() => { beginSession('MON'); startLive(); __log('bench_bd', 'top', 90, 3, 8); endSession(); return { cur: S.e1.bench.cur, capped: S.lastSummary.e1Changes.bench.capped }; });
  ok(r.cur === 105 && !r.capped, 'a normal-week rise is applied in full (90 × 3 @ 8 → 105)', r);
  await p.close();
  p = await page(browser, MON02, { e1: e1Seed(100) });
  await p.evaluate(LOG);
  r = await p.evaluate(() => { beginSession('MON'); startLive(); __log('bench_bd', 'top', 85, 3, 8.5); endSession(); return S.e1.bench.cur; });
  ok(Math.abs(r - 97.75) < 0.01, 'a drop inside 2.5% is applied as is (85 × 3 @ 8.5 → 97.75)', r);
  await p.close();

  console.log('e1RM: reduced-week exceptions');
  p = await page(browser, SAT12D, { e1: e1Seed(100, 137.5) });
  await p.evaluate(LOG);
  r = await p.evaluate(() => {
    beginSession('SAT'); startLive();
    const ex = S.exercises.find(e => e.exId === LIFT_EX.ssb_w);
    const kinds = ex ? ex.sets.map(s => s.kind) : null;
    __log(LIFT_EX.ssb_w, 'test', 130, 1, 10);
    endSession();
    return { kinds, cur: S.e1.ssb_w.cur };
  });
  ok(r.kinds && r.kinds.includes('test') && Math.abs(r.cur - 134.33) < 0.01, 'SSB test day (peak week): a tested single still sets e1RM — and is not capped (130 × 1 @ 10 → 134.3)', r);
  await p.close();
  p = await page(browser, MON14D, { e1: e1Seed(100) });
  await p.evaluate(LOG);
  r = await p.evaluate(() => { beginSession('MON'); startLive(); __log('bench_bd', 'top', 90, 3, 9); endSession(); return { cur: S.e1.bench.cur, adj: S.adjust.join(' | ') }; });
  ok(Math.abs(r.cur - 102) < 0.01 && !/not applied/.test(r.adj), 'bench checkpoint (wk 12, a reduced week): the 90 × 3 @ 9 triple still counts (→ 102)', r);
  await p.close();

  console.log('e1RM: one-time repair of deload entries (v5.6)');
  const E1BAD = {
    bench: { cur: 102.8, hist: [{ date: '2026-09-27', v: 87.5, src: 'seed' }, { date: '2026-10-23', v: 100, src: 'test' }, { date: '2026-10-26', v: 95.6 }, { date: '2026-11-02', v: 102.8 }] },
    ssb_w: { cur: 134.3, hist: [{ date: '2026-10-03', v: 130, src: 'calibration' }, { date: '2026-10-24', v: 137.5 }, { date: '2026-10-31', v: 134.3 }] }
  };
  p = await page(browser, '2026-11-03T08:00:00+09:00', { e1: E1BAD, keep56: false });
  r = await p.evaluate(() => ({ b: S.e1.bench, s: S.e1.ssb_w, fix: JSON.parse(localStorage.getItem('gym_fix_v56')) }));
  ok(r.b.cur === 102.8 && !r.b.hist.some(h => h.date === '2026-10-26') && r.b.hist.length === 3, 'bench: 26 Oct deload entry removed, e1RM stays 102.8', r.b);
  ok(r.s.cur === 137.5 && !r.s.hist.some(h => h.date === '2026-10-31'), 'SSB: 31 Oct deload entry removed, e1RM back to 137.5', r.s);
  ok(r.fix && r.fix.removed.bench.entries[0].v === 95.6 && r.fix.removed.ssb_w.cur === 134.3, 'removed entries kept in gym_fix_v56 for restore', r.fix);
  await p.reload(); await p.waitForTimeout(200);
  r = await p.evaluate(() => S.e1.ssb_w.hist.length);
  ok(r === 2, 'repair runs once', r);
  await p.close();

  console.log('A3: RPE 8–9 targets and the effort nudge');
  p = await page(browser, MON02, {});
  r = await p.evaluate(() => {
    const bad = [];
    Object.values(TEMPLATES).forEach(t => t.slots.forEach(s => {
      if (s.tier !== 'A3') return;
      Object.entries(s.rx || {}).forEach(([b, rx]) => {
        const want = s.hang ? (rx.rpe == null && rx.rpeLo == null) : (rx.rpe === 9 && rx.rpeLo === 8);
        if (!want) bad.push(t.key + '.' + s.id + '.' + b);
      });
    }));
    beginSession('MON');
    const ei = S.exercises.findIndex(e => e.exId === 'db_leanaway'); const ex = S.exercises[ei];
    const w = workingSets(ex)[0]; openModal(ei, ex.sets.indexOf(w)); const tgt = document.getElementById('modal-target').textContent; closeModal();
    const hang = S.exercises.find(e => e.exId === 'dead_hang'); const hw = workingSets(hang)[0];
    return { bad, rpeT: w.rpeT, lo: w.rpeLo, tgt, hangLo: hw.rpeLo };
  });
  ok(r.bad.length === 0, 'every A3 slot targets RPE 8–9 (dead hangs stay timed, no RPE)', r.bad);
  ok(r.rpeT === 9 && r.lo === 8 && /RPE 8–9/.test(r.tgt) && r.hangLo == null, 'set window shows "@ RPE 8–9"', r.tgt);
  await p.close();
  p = await page(browser, DEL26, {});
  r = await p.evaluate(() => { beginSession('MON'); const ex = S.exercises.find(e => e.exId === 'db_leanaway'); const w = workingSets(ex)[0]; return { rpe: w.rpe, lo: w.rpeLo }; });
  ok(r.rpe === 7 && r.lo == null, 'deload week: A3 target capped at RPE 7 (no range)', r);
  await p.close();
  const curl = (rpes, reps) => ({ ez_curl: [{ date: '2026-10-28T01:00:00.000Z', day: '2026-10-28', session: 'MON', week: 5, block: 'B1', tier: 'A3', eq: 'ezHome',
    sets: rpes.map((rpe, i) => ({ kind: 'work', in: 10.5, total: 36.9, reps: (reps || [10, 10, 10])[i], rpe })) }] });
  // 28 Oct is in the deload week, so use 19 Oct (normal) as the base entry
  const curlN = (rpes, reps) => { const h = curl(rpes, reps); h.ez_curl[0].date = '2026-10-19T04:00:00.000Z'; h.ez_curl[0].day = '2026-10-19'; h.ez_curl[0].week = 4; return h; };
  p = await page(browser, MON02, { history: curlN([6.5, 6.5, 6.5]) });
  r = await p.evaluate(() => {
    beginSession('MON'); const ei = S.exercises.findIndex(e => e.exId === 'ez_curl'); const nd = easyNudge(S.exercises[ei]);
    renderSession(); const txt = document.body.textContent; return { nd, banner: /averaged RPE 6\.5 vs target 8–9 — take each set to RPE 8–9/.test(txt) };
  });
  ok(r.nd && r.nd.tgt === 9 && r.nd.lo === 8 && r.banner, 'curls logged @ 6.5 → effort nudge fires with "target 8–9"', r);
  await p.close();
  p = await page(browser, MON02, { history: curlN([7.5, 7.5, 7]) });
  r = await p.evaluate(() => { beginSession('MON'); return easyNudge(S.exercises.find(e => e.exId === 'ez_curl')); });
  ok(r === null, 'curls logged @ 7–7.5 → no nudge (within 2 of the top of the range)', r);
  await p.close();
  p = await page(browser, MON02, { history: curlN([9, 9, 9], [12, 12, 12]) });
  r = await p.evaluate(() => { beginSession('MON'); return accessoryOverload(S.exercises.find(e => e.exId === 'ez_curl')); });
  ok(r && r.next > 10.5, '3 × 12 @ RPE 9 → weight goes up', r);
  await p.close();
  p = await page(browser, MON02, { history: curlN([9.5, 9.5, 10], [12, 12, 12]) });
  r = await p.evaluate(() => { beginSession('MON'); return accessoryOverload(S.exercises.find(e => e.exId === 'ez_curl')); });
  ok(r === null, '3 × 12 @ RPE 9.5–10 → hold the weight (over the RPE 9 cap)', r);
  await p.close();

  console.log('Thursday rebalance (Programme A)');
  p = await page(browser, MON02, {});
  r = await p.evaluate(() => {
    const ids = k => { beginSession(k); const a = S.exercises.filter(e => !e.skipped).map(e => e.slot); S.ended = true; S.day = null; return a; };
    const out = { thu: ids('THU'), wed: ids('WED'), sat: ids('SAT'), tgt: Object.fromEntries(MUSCLE_TARGETS) };
    const wc = TEMPLATES.WED.slots.find(s => s.id === 'wed_curl');
    out.wc = { def: wc.def, s: wc.rx.B1.s };
    SET.nano = 'installed';
    out.nanoThu = tmplDef('THU').slots.map(s => s.id); out.nanoWed = tmplDef('WED').slots.map(s => s.id);
    out.pvThu = tmplDef('PV_THU').slots.map(s => s.id);
    SET.nano = 'off';
    return out;
  });
  ok(!r.thu.includes('thu_fly') && !r.thu.includes('thu_push') && r.thu.length === 9, 'Thursday: fly and pushdown gone (9 slots)', r.thu);
  ok(r.wed.includes('wed_curl') && r.wc.def === 'db_incline_curl' && r.wc.s === 3, 'Wednesday: + biceps slot, 3 × DB incline curl', r.wc);
  ok(r.sat.includes('sat_extra'), 'Saturday: DB laterals on by default', r.sat);
  ok(r.tgt.Biceps === 6 && r.tgt['Side delts'] === 7 && r.tgt.Triceps === 6 && r.tgt['Chest fly'] === undefined, 'weekly targets: biceps 6, side delts 7, triceps 6, no chest-fly row', r.tgt);
  ok(r.nanoThu.includes('thu_fly') && r.nanoThu.includes('thu_push') && !r.nanoWed.includes('wed_curl') && r.pvThu.includes('thu_fly'), 'Programme B (Nano) keeps its Thursday fly + pushdown, no extra Wednesday curl', { thu: r.nanoThu, wed: r.nanoWed });
  ok(p._errs.length === 0, 'no JS errors', p._errs);
  await p.close();

  console.log('Rest defaults');
  p = await page(browser, MON02, {});
  r = await p.evaluate(() => {
    beginSession('MON'); const sq = S.exercises.find(e => e.slot === 'mon_squat'), acc = S.exercises.find(e => e.slot === 'mon_delts'), bench = S.exercises.find(e => e.slot === 'mon_bench');
    const out = { sq: restForTier(sq), acc: restForTier(acc), p1: restForTier(bench) };
    S.ended = true; S.day = null; goSettings && goSettings(); out.settings = document.body.innerHTML.includes('Light pause squat (Mon)');
    return out;
  });
  ok(r.sq === 120 && r.acc === 90 && r.p1 === 180, 'light pause squat 2:00 · accessories 1:30 · P1 unchanged', r);
  ok(r.settings, 'Settings has a "Light pause squat (Mon)" rest row');
  await p.close();
  p = await page(browser, MON02, { keep56: false, settings: { restTier: { P1: 180, S2: 120, A3: 75, C: 45, WU: 120, WU1: 150, SQV: 210 } } });
  r = await p.evaluate(() => SET.restTier);
  ok(r.A3 === 90 && r.SQL === 120, 'saved old default (A3 75) moves to 90 once', r);
  await p.close();
  p = await page(browser, MON02, { keep56: false, settings: { restTier: { A3: 60 } } });
  r = await p.evaluate(() => SET.restTier.A3);
  ok(r === 60, 'a custom accessory rest (60 s) is left alone', r);
  await p.close();

  console.log('Notion outbox');
  p = await page(browser, MON02, { e1: e1Seed(100) }, 'down');
  await p.evaluate(LOG);
  r = await p.evaluate(() => { beginSession('MON'); startLive(); __log('bench_bd', 'top', 90, 3, 8); endSession(); return outboxGet(); });
  ok(r.length === 1 && /W26 MON/.test(r[0].label) && r[0].body.properties && !r[0].err, 'END puts a draft payload in the outbox', r.map(x => x.label));
  r = await p.evaluate(async () => { document.getElementById('done-notes').value = 'felt strong'; await saveToNotion(); return { ob: outboxGet(), btn: document.getElementById('done-save-btn').textContent }; });
  ok(r.ob.length === 1 && r.ob[0].err && /felt strong/.test(JSON.stringify(r.ob[0].body)) && /OUTBOX/.test(r.btn), 'failed save keeps the payload (with notes) and says so', r.btn);
  const postsBefore = p._posts;
  await p.evaluate(() => flushOutbox()); await p.waitForTimeout(100);
  ok(p._posts === postsBefore, 'outbox does not send the session still open on the done screen', p._posts - postsBefore);
  r = await p.evaluate(() => { leaveDone(); const msg = document.getElementById('confirm-msg').textContent; document.getElementById('confirm-ok').click(); return { msg, card: document.getElementById('outbox-wrap').textContent }; });
  ok(/outbox/.test(r.msg) && /NOT IN NOTION YET · 1 SESSION/.test(r.card), 'HOME asks, then the home card shows 1 unsent session', r);
  await p.reload(); await p.waitForTimeout(300);
  r = await p.evaluate(() => ({ n: outboxGet().length, card: document.getElementById('outbox-wrap').textContent }));
  ok(r.n === 1 && /1 SESSION/.test(r.card), 'still there after the app restarts offline', r);
  p._notion = 'up';
  await p.evaluate(() => flushOutbox()); await p.waitForTimeout(200);
  r = await p.evaluate(() => ({ n: outboxGet().length, card: document.getElementById('outbox-wrap').textContent }));
  ok(r.n === 0 && r.card === '', 'back online: SEND empties the outbox and the card goes', r);
  await p.close();
  p = await page(browser, MON02, { e1: e1Seed(100), extra: { gym_outbox: JSON.stringify([{ id: 1730000000000, label: 'W26 SAT · old', at: 1, body: { properties: {} }, err: 'network', tries: 1 }]) } }, 'up');
  await p.waitForTimeout(300);
  r = await p.evaluate(() => outboxGet().length);
  ok(r === 0 && p._posts >= 1, 'opening the app sends what is waiting', { left: r, posts: p._posts });
  await p.close();
  p = await page(browser, MON02, { e1: e1Seed(100) }, 'up');
  await p.evaluate(LOG);
  r = await p.evaluate(async () => { beginSession('MON'); startLive(); __log('bench_bd', 'top', 90, 3, 8); endSession(); await saveToNotion(); return { n: outboxGet().length, saved: S.savedToNotion }; });
  ok(r.n === 0 && r.saved, 'successful save leaves nothing in the outbox', r);
  await p.close();
  p = await page(browser, MON02, { extra: { gym_outbox: JSON.stringify([{ id: 1730000000000, label: 'W26 SAT · old', at: 1, body: { properties: {} }, err: 'network', tries: 1 }]) } }, 'down');
  r = await p.evaluate(() => { discardOutbox(1730000000000); document.getElementById('confirm-ok').click(); return { n: outboxGet().length, card: document.getElementById('outbox-wrap').textContent }; });
  ok(r.n === 0 && r.card === '', 'DISCARD (after confirming) drops an item', r);
  r = await p.evaluate(() => { const v = PROFILE; return { v: pkey('gym_outbox') }; });
  ok(r.v === 'gym_outbox', 'outbox key is per profile (V: gym_outbox)', r);
  await p.close();

  console.log('Bench milestones');
  p = await page(browser, MON02, { e1: e1Seed(100) });
  await p.evaluate(LOG);
  r = await p.evaluate(() => {
    goHome(); const before = document.querySelector('.ms-card').textContent;
    beginSession('MON'); startLive(); __log('bench_bd', 'top', 90, 3, 8); endSession();
    const flags = S.lastSummary.flags.map(f => f.t); S.day = null; goHome();
    return { before, flags, after: document.querySelector('.ms-card').textContent };
  });
  ok(/0\/5 MET/.test(r.before) && /not yet/.test(r.before), 'before: header 0/5 MET, rows say "not yet"', r.before);
  ok(r.flags.some(t => /Bench milestone M1 met — 100 established/.test(t)), 'done screen announces M1 the day it is met', r.flags);
  ok(/1\/5 MET/.test(r.after) && /✓ MET · mon 2 nov/.test(r.after), 'home: M1 row reads "✓ MET · mon 2 nov", header 1/5 MET', r.after);
  r = await p.evaluate(() => { beginSession('MON'); startLive(); __log('bench_bd', 'top', 90, 3, 8); endSession(); return S.lastSummary.flags.map(f => f.t).filter(t => /milestone/.test(t)); });
  ok(r.length === 0, 'meeting M1 again does not re-announce it', r);
  ok(p._errs.length === 0, 'no JS errors', p._errs);
  await p.close();

  console.log('Smoke');
  for (const nano of ['off', 'installed']) {
    p = await page(browser, MON02, { settings: nano === 'off' ? undefined : { nano } });
    r = await p.evaluate(() => ['MON', 'WED', 'THU', 'SAT'].map(k => { beginSession(k); const n = S.exercises.length; S.ended = true; S.day = null; return n; }));
    ok(r.every(n => n > 0) && p._errs.length === 0, `Nano ${nano}: MON / WED / THU / SAT build without JS errors`, { r, errs: p._errs });
    await p.close();
  }

  await browser.close(); server.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) { console.log('FAILED: ' + fails.join('\n        ')); process.exitCode = 1; }
})().catch(e => { console.error(e); process.exit(1); });
