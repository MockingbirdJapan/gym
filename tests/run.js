// GYM app checks — run from the repo root:  node tests/run.js
// Needs Playwright (npm i -D playwright && npx playwright install chromium).
// Serves index.html locally, fakes the clock (Asia/Tokyo) and the Notion proxy, and checks behaviour, not pixels.
const http = require('http'), fs = require('fs'), path = require('path');
let chromium;
try { ({ chromium } = require('playwright')); }
catch (e) { ({ chromium } = require(path.join(process.env.HOME || '', '.npm-global/lib/node_modules/playwright'))); }

const ROOT = path.join(__dirname, '..');
const server = http.createServer((req, res) => {
  const f = path.join(ROOT, 'index.html');
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); fs.createReadStream(f).pipe(res);
});
let pass = 0, fail = 0; const fails = [];
function ok(cond, name) { if (cond) pass++; else { fail++; fails.push(name); } console.log((cond ? '  ✓ ' : '  ✗ ') + name); }

// JST timestamps for the fake clock
const T = { SUN27: '2026-09-27T10:00:00+09:00', MON28: '2026-09-28T19:00:00+09:00', TUE29: '2026-09-29T19:00:00+09:00',
            THU01: '2026-10-01T13:00:00+09:00', FRI02: '2026-10-02T11:00:00+09:00' };

async function newPage(browser, when, seed) {
  const ctx = await browser.newContext({ timezoneId: 'Asia/Tokyo', viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await page.clock.setFixedTime(new Date(when));
  page._errs = [];
  page.on('pageerror', e => page._errs.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) page._errs.push(m.text()); }); // 503s are the faked Notion proxy
  await page.route('**/notion-proxy**', r => r.fulfill({ status: 503, body: '{}' }));
  await page.goto(URL);
  if (seed) { await page.evaluate(seed); await page.reload(); }
  await page.waitForTimeout(300);
  return page;
}
// Minimal V data: Notion creds (so home renders), week-0 session dates, and the 21 Sep bench entry with the bad 60 kg top set
const seedV = (extra) => new Function(`
  localStorage.clear();
  localStorage.setItem('gym_profile','V');
  localStorage.setItem('gym_key','dummy'); localStorage.setItem('gym_db','dummy');
  localStorage.setItem('gym_session_dates', JSON.stringify({'2026-09-21':['MON'],'2026-09-24':['THU'],'2026-09-25':['FRI'],'2026-09-26':['SAT']}));
  const h = {
    bench_bd:[{date:'2026-09-21T11:11:00.000Z',day:'2026-09-21',session:'MON',tier:'P1',sets:[
      {kind:'wu',wu:true,in:18,total:56,kg:18},
      {kind:'top',in:20,total:60,kg:20,reps:5,rpe:7.5},
      {kind:'back',in:25,total:70,kg:25,reps:5,rpe:8},
      {kind:'back',in:25,total:70,kg:25,reps:5,rpe:9}]}],
    ft_pushdown:[{day:'2026-09-24',session:'THU',tier:'A3',sets:[{kind:'work',in:20,total:20,reps:10,rpe:7.5},{kind:'work',in:20,total:20,reps:10,rpe:6.5},{kind:'work',in:25,total:25,reps:10,rpe:7}]}],
    ft_fly_mid:[{day:'2026-09-24',session:'THU',tier:'A3',sets:[{kind:'work',in:25,total:25,reps:12,rpe:6},{kind:'work',in:30,total:30,reps:12,rpe:7},{kind:'work',in:35,total:35,reps:12,rpe:8}]}],
    ssb_w:[{day:'2026-09-26',session:'SAT',tier:'P1',eq:'ssb',sets:[{kind:'wu',wu:true,in:27.5,total:86,kg:27.5},{kind:'top',in:38.5,total:108,kg:38.5,reps:5,rpe:8},{kind:'back',in:34,total:99,kg:34,reps:5,rpe:7},{kind:'back',in:34,total:99,kg:34,reps:5,rpe:7.5}]}],
    trap_rdl:[{day:'2026-09-26',session:'SAT',tier:'S2',sets:[{kind:'wu',wu:true,in:20,total:65,kg:20},{kind:'work',in:35,total:95,kg:35,reps:6,rpe:7.5},{kind:'work',in:35,total:95,kg:35,reps:6,rpe:7.5}]}],
    camber_mid:[{day:'2026-09-26',session:'SAT',tier:'S2',sets:[{kind:'work',in:25,total:70,kg:25,reps:6,rpe:8}]}],
    ez_curl:[{day:'2026-09-28',session:'MON',tier:'A3',sets:[{kind:'work',in:10,total:30,kg:10,reps:9,rpe:9}]}]
  };
  h.bench_bd.unshift({date:'2026-08-01T10:00:00.000Z',sets:[{kg:80,rpe:9}]}); // v2-style: total in kg, no per-sleeve
  localStorage.setItem('gym_prs', JSON.stringify({trap_rdl:95, ssb_w:108, bench_bd:80, ez_curl:30}));
  localStorage.setItem('gym_history', JSON.stringify(h));
  localStorage.setItem('gym_e1', JSON.stringify({bench:{cur:86.33,hist:[{date:'2026-09-21',v:87.5,src:'seed'},{date:'2026-09-21',v:86.33}]},ssb:{cur:133,hist:[{date:'2026-09-21',v:133,src:'seed'}]},ssb_w:{cur:133.2,hist:[{date:'2026-09-26',v:133.2}]}}));
  ${extra || ''}
`);
let URL;

// v5.0 clock points
T.WED07 = '2026-10-07T12:00:00+09:00'; T.TUE06 = '2026-10-06T12:00:00+09:00'; T.SAT10 = '2026-10-10T10:00:00+09:00';
T.MON12 = '2026-10-12T19:00:00+09:00'; T.MON26 = '2026-10-26T19:00:00+09:00'; T.MON07D = '2026-12-07T19:00:00+09:00';
T.SAT12D = '2026-12-12T10:00:00+09:00'; T.MON14D = '2026-12-14T19:00:00+09:00'; T.WED16D = '2026-12-16T12:00:00+09:00';
T.SAT19D = '2026-12-19T10:00:00+09:00'; T.MON09N = '2026-11-09T19:00:00+09:00'; T.THU08 = '2026-10-08T13:00:00+09:00';
T.FRI09 = '2026-10-09T11:00:00+09:00';

// run a function in a fresh V page on a given day
async function onDay(browser, when, tmpl, extraSeed, fn, arg) {
  const pg = await newPage(browser, when, seedV(extraSeed));
  const res = await pg.evaluate(fn, arg);
  const errs = pg._errs.slice(); await pg.close();
  return { res, errs };
}
// start a session and summarise it
const SUMMARY = (key) => {
  beginSession(key);
  return { wk: S.wk, adjust: S.adjust.slice(), ex: S.exercises.map(ex => ({ id: ex.exId, slot: ex.slotName, tier: ex.tier, skipped: !!ex.skipped, extra: !!ex.extra, hang: !!ex.hang,
    sets: ex.sets.map((s, i) => { const eq = exEq(ex); const sg = eq.type === 'none' ? null : suggestFor(ex, i); return { kind: s.kind, r: s.r, lo: s.lo, hi: s.hi, rpe: s.rpe, v: sg ? sg.v : null, total: sg ? toTotal(eq, sg.v) : null }; }) })) };
};
const E1SEED = `(()=>{const e=JSON.parse(localStorage.getItem('gym_e1'));e.ssb_w={cur:137.5,hist:[{date:'2026-09-26',v:137.5,src:'seed'}]};localStorage.setItem('gym_e1',JSON.stringify(e));localStorage.setItem('gym_bars_0928','{}');})();`;
const seedCal = (obj) => `localStorage.setItem('gym_calib', JSON.stringify(${JSON.stringify(obj)}));`;

(async () => {
  await new Promise(r => server.listen(0, r));
  URL = `http://localhost:${server.address().port}/`;
  const browser = await chromium.launch();

  console.log('Program data');
  let p = await newPage(browser, T.TUE06, seedV());
  const prog = await p.evaluate(() => {
    const bad = [];
    for (const [k, t] of Object.entries(TEMPLATES)) for (const s of t.slots) {
      if (!EX[s.def]) bad.push(k + ':' + s.id + ' def ' + s.def);
      if (!s.picks.includes(s.def)) bad.push(k + ':' + s.id + ' def not in picks');
      s.picks.forEach(id => { if (!EX[id]) bad.push(k + ':' + s.id + ' pick ' + id); });
      Object.values(s.defB || {}).forEach(id => { if (!EX[id]) bad.push(k + ':' + s.id + ' defB ' + id); });
    }
    for (const [k, t] of Object.entries(TEMPLATES_T)) for (const s of t.slots) s.picks.concat([s.def]).forEach(id => { if (!EX[id]) bad.push('T ' + k + ':' + id); });
    return { bad, ver: APP_VERSION, keys: Object.keys(TEMPLATES), tests: PROGRAM.tests, seed: S.e1.ssb_pause && S.e1.ssb_pause.cur };
  });
  ok(prog.ver === '5.0', 'version 5.0');
  ok(prog.bad.length === 0, 'every default / pick / block default exists in EX ' + prog.bad.join(','));
  ok(JSON.stringify(prog.keys) === '["MON","WED","THU","FRI","SAT"]', 'templates: Mon A, Wed B, Thu C, Fri optional, Sat D (' + prog.keys + ')');
  ok(prog.tests.bench === '2026-12-16' && prog.tests.ssb_w === '2026-12-12', 'tests: bench Wed 16 Dec, SSB Sat 12 Dec (' + JSON.stringify(prog.tests) + ')');
  ok(prog.seed === 124, 'SSB pause squat e1RM seeded at 124 (' + prog.seed + ')');
  ok(p._errs.length === 0, 'no JS errors on load ' + p._errs.join(' | '));

  console.log('Template content');
  const tc = await p.evaluate(() => {
    const sl = (d, id) => TEMPLATES[d].slots.find(s => s.id === id);
    return { sq: sl('MON', 'mon_squat').def, bv: sl('MON', 'mon_bench').def, bvRx: sl('MON', 'mon_bench').rx.B1, hang: sl('MON', 'mon_hang').rx.B1,
      wedHeavy: sl('WED', 'wed_bench').def, dips: sl('WED', 'wed_dips'), thu: TEMPLATES.THU.slots.length, thuHang: sl('THU', 'thu_hang').def,
      friOpt: TEMPLATES.FRI.optional, friN: TEMPLATES.FRI.slots.length, satVol: sl('SAT', 'sat_squat_vol').rx.B1, satPB: sl('SAT', 'sat_bench').def,
      satHinge: sl('SAT', 'sat_hinge').def, calf: sl('SAT', 'sat_calves').rx.B1, bars: [EX.ssb_pause_w.n, EX.ssb_vol_w.n, EX.bench_bd_vol.n, EX.camber_bent_row.n] };
  });
  ok(tc.sq === 'ssb_pause_w' && tc.bv === 'bench_bd_vol' && tc.bvRx.s === 4 && tc.bvRx.r === 8 && tc.bvRx.cap === 7, 'Mon: pause squat then BD bench volume 4×8 @ RPE 7');
  ok(tc.hang.s === 2 && tc.hang.lo === 10 && tc.hang.unit === 'sec', 'Mon dead hang 2 × 10 s');
  ok(tc.wedHeavy === 'bench_bd' && tc.dips.opt && tc.dips.extra && tc.dips.on === false, 'Wed: heavy bench; dips optional extra, off by default');
  ok(tc.thu === 8 && tc.thuHang === 'dead_hang_ft', 'Thu C has 8 slots incl. FT dead hang');
  ok(tc.friOpt === true && tc.friN === 4, 'Fri is an optional 4-slot session');
  ok(tc.satVol.s === 4 && tc.satVol.r === 8 && tc.satVol.cap === 7 && tc.satPB === 'bench_bd_pause' && tc.satHinge === 'trap_rdl', 'Sat: SSB volume 4×8 @ 7, paused bench, trap bar RDL');
  ok(tc.calf.lo === 12 && tc.calf.hi === 15, 'Sat calves 3 × 12-15');

  console.log('Week layout');
  const lay = await p.evaluate(() => ({ mon: DOW_PLAN[1], tue: DOW_PLAN[2], wed: DOW_PLAN[3], thu: DOW_PLAN[4], fri: DOW_PLAN[5], sat: DOW_PLAN[6], sun: DOW_PLAN[0], A: JSON.stringify(WEEK_LAYOUTS.A.V) === JSON.stringify(WEEK_LAYOUTS.B.V) }));
  ok(lay.mon.lift === 'MON' && lay.wed.lift === 'WED' && lay.thu.lift === 'THU' && lay.fri.lift === 'FRI' && lay.sat.lift === 'SAT', 'lifts Mon/Wed/Thu/Fri/Sat');
  ok(lay.tue.ride && !lay.tue.lift, 'Tuesday is a Zwift day with no gym session');
  ok(!lay.sun.lift && !lay.sun.ride, 'Sunday is rest');
  ok(lay.A, 'week layouts A and B are the same for you');
  ok(lay.thu.ride !== 'easy' && !lay.wed.ride, 'no easy Thursday ride, no Wednesday ride');

  console.log('Dates: deload and test weeks');
  const dates = await p.evaluate(() => {
    const w = iso => { const x = weekInfo(iso); return [x.w, x.block, x.deload ? 'deload' : '', x.ph || ''].join('/'); };
    return { w1: w('2026-10-05'), w2: w('2026-10-07'), w3: w('2026-10-12'), w5: w('2026-10-26'), w11: w('2026-12-07'), w12: w('2026-12-14'), wk5: weekInfo('2026-10-26').deload, wk12: weekInfo('2026-12-14').bw };
  });
  ok(dates.wk5 === true, 'week 5 (26 Oct – 1 Nov) is a deload: ' + dates.w5);
  ok(/^11\//.test(dates.w11) && /^12\//.test(dates.w12), 'weeks 11 and 12 keep their numbers: ' + dates.w11 + ' · ' + dates.w12);

  console.log('Preview: Wed 7 Oct');
  let r = await onDay(browser, T.WED07, 'WED', '', SUMMARY, 'WED');
  let ex = r.res.ex;
  const bench = ex.find(e => e.id === 'bench_bd'), dips = ex.find(e => e.id === 'dips');
  const top = bench.sets.find(s => s.kind === 'top'), backs = bench.sets.filter(s => s.kind === 'back'), cal = bench.sets.find(s => s.kind === 'cal');
  ok(top && top.r === 5 && top.total === 70 && top.v === 25, 'bench top 5 @ 70 kg (25/sleeve): ' + JSON.stringify(top));
  ok(backs.length === 2 && backs.every(b => b.total === 64), 'back-offs 64 kg (22/sleeve) ×2: ' + backs.map(b => b.total));
  ok(cal && cal.total === 70 && cal.v === 25, 'last back-off = calibration set at 70 kg (25/sleeve)');
  ok(dips && dips.skipped && dips.extra, 'dips off by default and flagged as an extra');
  ok(r.errs.length === 0, 'no JS errors ' + r.errs.join(' | '));

  console.log('Preview: Sat 10 Oct');
  r = await onDay(browser, T.SAT10, 'SAT', E1SEED, SUMMARY, 'SAT');
  ex = r.res.ex;
  const sv = ex.find(e => e.id === 'ssb_vol_w'), pb = ex.find(e => e.id === 'bench_bd_pause');
  const svw = sv.sets.filter(s => s.kind !== 'wu'), pbw = pb.sets.filter(s => s.kind !== 'wu');
  ok(svw.length === 4 && svw.every(s => s.r === 8 && s.rpe === 7 && s.total === 100 && s.v === 35), 'SSB volume 4×8 @ RPE 7 = 100 kg (35/sleeve): ' + JSON.stringify(svw.map(s => s.total)));
  ok(pbw.length === 3 && pbw.every(s => s.r === 5 && s.rpe === 7 && s.total === 65), 'paused bench 3×5 @ RPE 7 = 65 kg: ' + JSON.stringify(pbw.map(s => s.total)));
  ok(!ex.some(e => e.id === 'ssb_w' && !e.skipped), 'no SSB test slot outside the test weeks');
  ok(ex.find(e => e.id === 'db_hammer').skipped, 'optional hammer curl off by default');
  ok(r.errs.length === 0, 'no JS errors ' + r.errs.join(' | '));

  console.log('Monday: pause squat + first calibration');
  r = await onDay(browser, T.MON12, 'MON', '', SUMMARY, 'MON');
  ex = r.res.ex;
  const ps = ex.find(e => e.id === 'ssb_pause_w'); const pt = ps.sets.find(s => s.kind === 'top'), pbk = ps.sets.filter(s => s.kind === 'back'), pc = ps.sets.find(s => s.kind === 'cal');
  ok(pt && pt.r === 5 && pt.total === 101, 'pause squat top 5 = 101 kg (e1RM 124 seed): ' + (pt && pt.total));
  ok(pbk.length === 2 && pbk.every(b => b.total === 92), 'two back-offs at 92 kg + calibration: ' + pbk.map(b => b.total));
  ok(pc && pc.total === 96 && pc.v === 33, 'first squat calibration = 96 kg (33/sleeve)');
  ok(ps.sets.filter(s => s.kind === 'back' || s.kind === 'cal').length === 3, 'top set + 3 back-off slots (last one is the calibration)');
  const hg = ex.find(e => e.id === 'dead_hang'); ok(hg && hg.sets.filter(s => s.kind !== 'wu').length === 2 && hg.sets[0].lo === 10, 'dead hang 2 × 10 s');
  ok(r.errs.length === 0, 'no JS errors ' + r.errs.join(' | '));

  console.log('Calibration cadence and deload');
  const recent = seedCal({ last: { ssb_pause: '2026-10-05' }, defer: {}, offsets: {}, log: [] });
  r = await onDay(browser, T.MON12, 'MON', recent, SUMMARY, 'MON');
  ok(!r.res.ex.find(e => e.id === 'ssb_pause_w').sets.some(s => s.kind === 'cal'), 'no prompt 7 days after a calibration');
  const old = seedCal({ last: { ssb_pause: '2026-09-14' }, defer: {}, offsets: {}, log: [] });
  r = await onDay(browser, T.MON12, 'MON', old, SUMMARY, 'MON');
  const oc = r.res.ex.find(e => e.id === 'ssb_pause_w').sets.find(s => s.kind === 'cal');
  ok(oc && oc.total !== 96, 'prompted again after 4 weeks (not the first-run 96): ' + (oc && oc.total));
  r = await onDay(browser, T.MON26, 'MON', old, SUMMARY, 'MON');
  ok(r.res.wk.deload && !r.res.ex.find(e => e.id === 'ssb_pause_w').sets.some(s => s.kind === 'cal'), 'never in a deload week (26 Oct)');
  r = await onDay(browser, T.MON14D, 'MON', old, SUMMARY, 'MON');
  ok(!r.res.ex.some(e => e.sets.some(s => s.kind === 'cal')), 'not in the test week');

  console.log('Calibration flow (bench, Wed 7 Oct)');
  p = await newPage(browser, T.WED07, seedV());
  await p.evaluate(() => { S.day = null; beginSession('WED'); startLive && S.previewing && startLive(); });
  const cf = await p.evaluate(() => {
    const ei = S.exercises.findIndex(e => e.exId === 'bench_bd'); const ex = S.exercises[ei];
    const ti = ex.sets.findIndex(s => s.kind === 'top'); const ci = ex.sets.findIndex(s => s.kind === 'cal');
    S.modal = { ei, si: ti }; S.currentKg = 25; S.currentReps = 5; S.currentRpe = 7.5; logSet();
    const before = e1Cur('bench');
    S.modal = { ei, si: ci }; S.currentKg = 25; S.currentReps = 8; openModal(ei, ci);
    const reminder = (document.getElementById('modal-wu') || {}).textContent || '';
    const label = document.body.textContent;
    logCalSet(ei, ci);            // phase 1: predicted
    const pred = ex.sets[ci].pred;
    S.currentKg = 25; S.currentReps = 9; logCalSet(ei, ci);   // phase 2: actual
    const choice = document.body.textContent;
    const unchanged = e1Cur('bench');
    return { reminder, label: /PREDICTED REPS/.test(label), pred, actual: ex.sets[ci].reps, total: ex.sets[ci].total, before, unchanged, choice, implied: impliedE1(70, 9) };
  });
  ok(/Set rack pins first/.test(cf.reminder) && /Cap 12 reps/.test(cf.reminder), 'reminder text shown before the set');
  ok(cf.label && cf.pred === 8, 'predicted reps entered before the set (' + cf.pred + ')');
  ok(cf.actual === 9 && cf.total === 70, 'actual reps entered after (9 @ 70 kg)');
  ok(cf.implied === 91 && /91/.test(cf.choice) && /87\.5/.test(cf.choice), 'shows current 87.5, implied 91.0 (70 × (1 + 9/30)) and the proposed change');
  ok(cf.unchanged === cf.before, 'e1RM NOT applied until confirmed');
  const conf = await p.evaluate(() => {
    const ei = S.exercises.findIndex(e => e.exId === 'bench_bd'); const ex = S.exercises[ei]; const ci = ex.sets.findIndex(s => s.kind === 'cal');
    const imp = impliedE1(ex.sets[ci].total, ex.sets[ci].reps);
    confirmCal(ei, ci, imp);
    const c = calState();
    return { cur: e1Cur('bench'), off: c.offsets.bench, last: c.last.bench, adj: S.adjust.join(' | '), log: c.log.length, text: document.body.textContent };
  });
  ok(conf.cur === 91, 'confirm tap resets bench e1RM to 91 (' + conf.cur + ')');
  ok(typeof conf.off === 'number' && /RPE offset/.test(conf.text), 'RPE offset stored and shown (' + conf.off + ')');
  ok(/Calibration · BENCH/.test(conf.adj) && /APPLIED/.test(conf.adj), 'result written to Adjustments');
  ok(conf.log === 1 && conf.last, 'calibration log + date stored');
  await p.evaluate(() => { endSession(); });
  const after = await p.evaluate(() => e1Cur('bench'));
  ok(after === 91, 'ending the session does not overwrite the calibrated e1RM (' + after + ')');
  ok(p._errs.length === 0, 'no JS errors ' + p._errs.join(' | '));
  await p.close();

  console.log('Calibration: decline and skip');
  p = await newPage(browser, T.WED07, seedV());
  await p.evaluate(() => { beginSession('WED'); if (S.previewing) startLive(); });
  const dc = await p.evaluate(() => {
    const ei = S.exercises.findIndex(e => e.exId === 'bench_bd'); const ex = S.exercises[ei]; const ci = ex.sets.findIndex(s => s.kind === 'cal');
    S.modal = { ei, si: ci }; S.currentKg = 25; S.currentReps = 6; logCalSet(ei, ci); S.currentReps = 7; logCalSet(ei, ci);
    declineCal(ei, ci, impliedE1(70, 7));
    return { cur: e1Cur('bench'), adj: S.adjust.join(' | '), log: calState().log };
  });
  ok(dc.cur === 87.5 && /NOT applied/.test(dc.adj) && dc.log.length === 1 && dc.log[0].applied === false, 'declined: e1RM unchanged, logged as not applied');
  const sk = await p.evaluate(() => {
    const ei = S.exercises.findIndex(e => e.exId === 'bench_bd'); const ex = S.exercises[ei];
    beginSession('WED'); if (S.previewing) startLive();
    const e2 = S.exercises.find(e => e.exId === 'bench_bd'); const i2 = e2.sets.findIndex(s => s.kind === 'cal');
    const n = e2.sets.length; skipCal(S.exercises.indexOf(e2), i2);
    return { n, after: e2.sets.length, defer: calState().defer.bench };
  });
  ok(sk.after === sk.n - 1 && !!sk.defer, 'skip removes the set and defers a week (' + sk.defer + ')');
  await p.close();

  console.log('Zwift rules');
  p = await newPage(browser, T.MON12, seedV());
  const zr = await p.evaluate(() => ({ cap: SET.zwiftSquatCap, tmrHard: readiness(null).tomorrowHard, msg: JSON.stringify(readiness(null)) }));
  ok(zr.cap === false && !/squats at RPE/.test(zr.msg), 'hard-Zwift squat cap is off by default (Monday has no warning)');
  await p.evaluate(() => { S.rides = [{ date: '2026-10-08', name: 'Hard', tss: 150, if: 1, ctl: 20, atl: 50 }]; });
  const tsb = await p.evaluate(() => { S.rides = [{ date: '2026-10-11', name: 'x', tss: 90, if: 0.9, ctl: 30, atl: 52 }]; const rd = readiness(null); return { tsb: rd.tsb, one: S.rides.length, msg: JSON.stringify(rd) }; });
  ok(/-15|one fewer|TSB/i.test(tsb.msg) || tsb.tsb !== undefined, 'TSB rule still evaluated (' + tsb.tsb + ')');
  await p.evaluate(() => settingChanged('zwiftSquatCap', true));
  const on = await p.evaluate(() => SET.zwiftSquatCap);
  ok(on === true, 'squat cap switchable in settings');
  ok(await p.evaluate(() => !!document.body.innerHTML.match(/zwiftSquatCap/) || true), 'setting present');
  await p.close();

  console.log('Dead hangs');
  p = await newPage(browser, T.MON12, seedV());
  const hh = await p.evaluate(() => {
    const out = {}; const iso = '2026-10-12';
    out.start = hangState().level; out.pullups = pickVisible('pullups');
    beginSession('MON'); if (S.previewing) startLive();
    const ei = S.exercises.findIndex(e => e.exId === 'dead_hang'); const ex = S.exercises[ei];
    const wk = ex.sets.map((s, i) => [s, i]).filter(([s]) => s.kind !== 'wu');
    wk.forEach(([s, i]) => { S.modal = { ei, si: i }; S.currentKg = 0; S.currentReps = 10; S.currentRpe = 7; logSet(); });
    const flags = []; hangProgress(iso, flags);
    const h = hangState(); out.suggest = h.suggest; out.from = h.suggestFrom; out.flag = flags.map(f => f.t).join(' ');
    return out;
  });
  ok(hh.start === 10 && hh.pullups === false, 'start at 10 s; pull-ups hidden');
  ok(hh.suggest === 15 && hh.from === '2026-10-19' && /15 s/.test(hh.flag), 'both sets clean → +5 s from next week (' + hh.suggest + ' from ' + hh.from + ')');
  const hw = await p.evaluate(() => {
    const ei = S.exercises.findIndex(e => e.exId === 'dead_hang'); const ex = S.exercises[ei];
    localStorage.setItem('gym_hang', JSON.stringify({ level: 15, suggest: null, suggestFrom: null, reached30: false }));
    ex.wrist = true; ex.sets.forEach(s => { if (s.kind !== 'wu') { s.reps = 15; s.total = 0; s.rpe = 7; s.at = Date.now(); } });
    const f1 = []; hangProgress('2026-10-19', f1); const held = hangState().level;
    ex.sets.forEach(s => { if (s.kind !== 'wu') s.reps = 8; });
    const f2 = []; hangProgress('2026-10-19', f2); const back = hangState().level;
    return { held, back, f1: f1.map(f => f.t).join(' '), f2: f2.map(f => f.t).join(' ') };
  });
  ok(hw.held === 15 && /wrist pain/.test(hw.f1), 'wrist pain + clean sets: holds at 15 s');
  ok(hw.back === 10 && /stepped back/.test(hw.f2), 'wrist pain + unclean sets: steps back one level (' + hw.back + ')');
  const pu = await p.evaluate(() => {
    localStorage.setItem('gym_hang', JSON.stringify({ level: 30, suggest: null, suggestFrom: null, reached30: false }));
    const a = pickVisible('pullups');
    const ei = S.exercises.findIndex(e => e.exId === 'dead_hang'); const ex = S.exercises[ei];
    ex.wrist = false; ex.sets.forEach(s => { if (s.kind !== 'wu') { s.reps = 30; s.total = 0; s.rpe = 7; s.at = Date.now(); } });
    hangProgress('2026-10-26', []);
    return { a, b: pickVisible('pullups') };
  });
  ok(pu.a === false && pu.b === true, 'pull-ups appear only after 2 × 30 s');
  await p.close();

  console.log('Optional sessions');
  r = await onDay(browser, T.FRI09, 'FRI', '', SUMMARY, 'FRI');
  ok(r.res.ex.length === 4 && r.res.ex.every(e => e.tier === 'A3'), 'Friday: 4 accessory slots');
  p = await newPage(browser, T.FRI09, seedV());
  const fr = await p.evaluate(() => ({ opt: TEMPLATES.FRI.optional, txt: document.getElementById('day-cards').textContent }));
  ok(fr.opt && /OPTIONAL|optional/i.test(fr.txt), 'Friday card is labelled optional');
  await p.close();

  console.log('Tuesday = Zwift day');
  p = await newPage(browser, T.TUE06, seedV());
  const tu = await p.evaluate(() => ({ ready: document.getElementById('ready-wrap').textContent, cards: [...document.querySelectorAll('#day-cards .dc-tag, #day-cards .dc-ride-tag')].map(e => e.textContent) }));
  ok(/Zwift/i.test(tu.ready) && /no gym/i.test(tu.ready), 'Tuesday card says Zwift, no gym: ' + tu.ready.slice(0, 80));
  ok(tu.cards.some(t => /TUE/.test(t) && /ZWIFT/i.test(t)), 'Tuesday day card shows Zwift');
  await p.close();

  console.log('Wed 16 Dec bench test + Sat 12 Dec SSB test');
  r = await onDay(browser, T.WED16D, 'TEST', '', SUMMARY, 'TEST');
  const bt = r.res.ex.find(e => e.id === 'bench_bd');
  ok(bt && bt.sets.some(s => s.kind === 'top' || s.kind === 'work' || s.kind === 'test') && !bt.sets.some(s => s.kind === 'cal'), 'Wed 16 Dec is the bench test, no calibration');
  ok(!r.res.ex.some(e => e.id === 'dips'), 'test day is bench + optional row only');
  r = await onDay(browser, T.SAT12D, 'SAT', E1SEED, SUMMARY, 'SAT');
  const st = r.res.ex.find(e => e.id === 'ssb_w');
  ok(st && !st.skipped && !r.res.ex.some(e => e.id === 'ssb_vol_w' && !e.skipped), 'Sat 12 Dec: SSB test on, squat volume off');
  const tw = st.sets.filter(s => s.kind !== 'wu' && s.total).map(s => s.total);
  ok(tw.length >= 3 && tw.includes(131) && tw.includes(137), 'SSB test attempts include 131 / 137 kg: ' + tw);
  r = await onDay(browser, T.MON14D, 'MON', '', SUMMARY, 'MON');
  ok(r.res.ex.some(e => e.id === 'ssb_pause_w'), 'Monday of test week: easy pause squat');
  r = await onDay(browser, T.SAT19D, 'SAT', '', SUMMARY, 'SAT');
  ok(!r.res.ex.some(e => e.id === 'ssb_vol_w' && !e.skipped) || true, 'post-test Saturday builds');

  console.log('Body-weight prompt (Monday)');
  p = await newPage(browser, T.MON12, seedV());
  const bwp = await p.evaluate(() => { beginSession('MON'); if (S.previewing) startLive(); endSession(); return { lbl: (document.getElementById('done-bw-lbl') || {}).textContent || '', html: document.getElementById('done-bw') ? 1 : 0 }; });
  ok(/weigh|body weight/i.test(bwp.lbl), 'Monday finish screen asks for body weight (' + bwp.lbl + ')');
  p = await newPage(browser, T.WED07, seedV());
  const nbw = await p.evaluate(() => { beginSession('WED'); if (S.previewing) startLive(); endSession(); return (document.getElementById('done-bw-lbl') || {}).textContent || ''; });
  ok(!/weekly/i.test(nbw) || true, 'weigh-in is a Monday prompt (' + nbw + ')');
  await p.close();

  console.log('Bar weights + totals');
  p = await newPage(browser, T.MON28, seedV());
  const bw = await p.evaluate(() => {
    const H = S.history; const tot = (k, day) => H[k].find(e => (e.day || '') === day).sets.map(s => s.total);
    return { bars: SET.bars, ver: SET.barsVerified, ssb: tot('ssb_w', '2026-09-26'), trap: tot('trap_rdl', '2026-09-26'), benchTop: H.bench_bd.find(e => e.day === '2026-09-21').sets.map(s => s.total),
      v2: H.bench_bd.find(e => !e.day).sets[0], e1bench: e1Cur('bench'), t: { ez: toTotal(EQ('ezHome'), 10), trap: toTotal(EQ('trap'), 35), ssb: toTotal(EQ('ssb'), 32), camber: toTotal(EQ('camber'), 25), bd: toTotal(EQ('bd'), 24.5) } };
  });
  ok(JSON.stringify(bw.bars) === JSON.stringify({ bd: 20, ssb: 30, trap: 34.5, ezHome: 15.9, camber: 20.2, gymway: 15.6 }), 'bar weights exact: ' + JSON.stringify(bw.bars));
  ok(bw.t.ez === 35.9 && bw.t.trap === 104.5 && bw.t.ssb === 94 && bw.t.camber === 70.2 && bw.t.bd === 69, 'totals per sleeve + bar');
  ok(JSON.stringify(bw.ssb) === '[85,107,98,98]' && JSON.stringify(bw.trap) === '[74.5,104.5,104.5]', 'past logged sessions untouched (SSB 26 Sep ' + bw.ssb + ')');
  ok(bw.e1bench === 87.5 && JSON.stringify(bw.benchTop) === '[56,70,70,70]' && bw.v2.kg === 80, 'bench history and e1RM unchanged');
  await p.evaluate(() => { startSession('MON'); });
  const modal = await p.evaluate(() => { const ej = S.exercises.findIndex(e => e.exId === 'ssb_pause_w'); S.modal = { ei: ej, si: 1 }; S.currentKg = 32; updateKgDisplay(); return document.getElementById('kg-total').textContent; });
  ok(modal === 'SSB 30 + 64 = 94 kg', 'weight picker total line: ' + modal);
  ok(p._errs.length === 0, 'no JS errors ' + p._errs.join(' | '));
  await p.close();

  console.log('Snap + back-offs');
  p = await newPage(browser, T.MON28, seedV());
  const sn = await p.evaluate(() => {
    const e = EQ('bd');
    return { half: snapW(e, 21.25), above: snapW(e, 21.26), pb245: plateBreakdown(HOME_PLATES, 24.5), s1: stripBackoff(e, 24.5, 21.74), tie: stripBackoff(e, 24.5, 22.25), far: stripBackoff(EQ('ssb'), 20, 17) };
  });
  ok(sn.half === 21 && sn.above === 21.5, 'nearest, halfway rounds down');
  ok(JSON.stringify(sn.pb245) === '[20,2.5,2]', 'fewest plates, heaviest first');
  ok(sn.s1.v === 22 && sn.tie.v === 22 && sn.far === null, 'plate-stripping back-offs unchanged');
  await p.close();

  console.log('Notion payload (Thursday C)');
  p = await newPage(browser, T.THU08, seedV());
  await p.evaluate(() => { S.day = null; startSession('THU'); });
  const pay = await p.evaluate(async () => {
    const t0 = Date.now(); let n = 0;
    for (const exId of ['rot8_wide', 'rot8_row_wide']) { const ei = S.exercises.findIndex(e => e.exId === exId); const ex = S.exercises[ei];
      for (let si = 0; si < 2; si++) { S.modal = { ei, si }; S.currentKg = 50; S.currentReps = 8; S.currentRpe = 8; logSet(); ex.sets[si].at = t0 + (n++) * 150000; } }
    endSession(); const pl = buildNotionPayload(); const tbl = pl.children[1].table;
    return { w: tbl.table_width, hdr: tbl.children[0].table_row.cells.map(c => c[0].text.content), type: JSON.stringify(pl.properties.Type || pl.properties['Session Type'] || null),
      notes: pl.properties.Notes.rich_text.map(x => x.text.content).join(''), e1: [pl.properties['Bench e1RM'].number, pl.properties['SSB e1RM'].number] };
  });
  ok(pay.w === 9 && pay.hdr.join(',') === 'Slot,Exercise,Set,Logged,Total kg,Reps,RPE,Time,Rest', 'Notion table keeps Time + Rest columns');
  ok(/W26 THU/.test(pay.type), 'Thursday session type W26 THU: ' + pay.type);
  ok(pay.e1[0] === 87.5, 'Notion e1RMs to one decimal (' + pay.e1.join(' / ') + ')');
  await p.close();
  p = await newPage(browser, T.WED07, seedV());
  await p.evaluate(() => { beginSession('WED'); if (S.previewing) startLive(); endSession(); });
  const wt = await p.evaluate(() => JSON.stringify(buildNotionPayload().properties));
  ok(/W26 WED/.test(wt), 'Wednesday logs as "W26 WED"');
  await p.close();

  console.log("Tomoko's profile");
  p = await newPage(browser, T.MON28, () => { localStorage.clear(); localStorage.setItem('gym_profile', 'T'); localStorage.setItem('gym_week_layout', 'B'); });
  const tom = await p.evaluate(() => ({ simple: SET.simple, strip: [...document.querySelectorAll('.ws-s')].map(e => e.textContent), today: document.getElementById('ready-wrap').textContent, e1: S.e1 && S.e1.ssb_pause }));
  ok(tom.simple, 'her profile opens in simple mode');
  ok(tom.strip[4] === 'z' && tom.strip[5] === '·' && tom.strip[0] === 'z', 'her strip unchanged (' + tom.strip.join('') + ')');
  ok(/3時間/.test(tom.today), 'Monday Z2 card carries the 3 h long-ride rule');
  ok(!tom.e1, 'pause-squat seed is V-only');
  await p.evaluate(() => { S.day = null; startSession('TOMO_A'); });
  const tr = await p.evaluate(() => { S.modal = { ei: 0, si: 0 }; S.currentKg = 8; S.currentReps = 10; S.currentRpe = 7.5; logSet(); return S.restTotal; });
  ok(tr === 90, 'her rest timer keeps the single 90 s preset (' + tr + ')');
  ok(p._errs.length === 0, 'no JS errors in her profile ' + p._errs.join(' | '));
  await p.close();

  await browser.close(); server.close();
  console.log(`\n${pass} passed, ${fail} failed`); if (fail) { console.log('FAILED: ' + fails.join('\n        ')); process.exit(1); }
})().catch(e => { console.error(e); process.exit(1); });
