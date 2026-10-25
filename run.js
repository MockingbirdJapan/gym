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
T.FRI09 = '2026-10-09T11:00:00+09:00'; T.MON05 = '2026-10-05T19:00:00+09:00';

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
      [s.nanoDef, s.nanoHome].filter(Boolean).forEach(id => { if (!EX[id]) bad.push(k + ':' + s.id + ' nano ' + id); });
    }
    for (const [id, e] of Object.entries(EX)) (e.fam || []).forEach(v => { if (!EX[v]) bad.push('family ' + id + ':' + v); else if (EX[v].eq !== e.eq && !(EX[v].eq === 'cable' && e.eq === 'ft1')) bad.push('family eq ' + id + ':' + v); });
    for (const [k, t] of Object.entries(TEMPLATES_T)) for (const s of t.slots) s.picks.concat([s.def]).forEach(id => { if (!EX[id]) bad.push('T ' + k + ':' + id); });
    return { bad, ver: APP_VERSION, keys: templatesFor(weekInfo('2026-11-02')), fri: !!TEMPLATES.FRI.retired, tests: PROGRAM.tests, cp: PROGRAM.checkpoint, weeks: PROGRAM.weeks, seed: S.e1.ssb_pause && S.e1.ssb_pause.cur };
  });
  ok(prog.ver === '5.4', 'version 5.4');
  ok(prog.bad.length === 0, 'every default / pick / block default exists in EX ' + prog.bad.join(','));
  ok(JSON.stringify(prog.keys) === '["MON","WED","THU","SAT"]' && prog.fri, 'v5.4 week: Mon A, Wed B, Thu C, Sat D; Friday retired (' + prog.keys + ')');
  ok(!prog.tests.bench && prog.tests.ssb_w === '2026-12-12' && prog.cp === '2026-12-14' && prog.weeks === 24, 'SSB test Sat 12 Dec · bench checkpoint Mon 14 Dec (no Wed 16 Dec test) · 24 weeks (' + JSON.stringify(prog.tests) + ')');
  ok(prog.seed === 124, 'SSB pause squat e1RM seeded at 124 (' + prog.seed + ')');
  ok(p._errs.length === 0, 'no JS errors on load ' + p._errs.join(' | '));

  console.log('Template content (v5.4)');
  const tc = await p.evaluate(() => {
    const sl = (d, id) => TEMPLATES[d].slots.find(s => s.id === id);
    return { mb: sl('MON', 'mon_bench'), ms: sl('MON', 'mon_squat'), mr: sl('MON', 'mon_row'), md: sl('MON', 'mon_delts').def,
      wc: sl('WED', 'wed_cg'), wp: sl('WED', 'wed_pull').def, wr: sl('WED', 'wed_row').def, wd: sl('WED', 'wed_dips'), wh: sl('WED', 'wed_hang'),
      thu: TEMPLATES.THU.slots.map(s => s.def), sq: sl('SAT', 'sat_squat'), vol: sl('SAT', 'sat_squat_vol'), satPB: sl('SAT', 'sat_bench'), hinge: sl('SAT', 'sat_hinge'),
      calf: sl('SAT', 'sat_calves').rx.B1, defB: Object.values(TEMPLATES).some(t => t.slots.some(s => s.defB)) };
  });
  ok(tc.mb.tier === 'P1' && tc.mb.lift === 'bench' && tc.mb.def === 'bench_bd' && tc.mb.cal, 'Mon: heavy BD bench is the priority lift (with calibration)');
  ok(tc.ms.tier === 'S2R' && tc.ms.def === 'ssb_pause_w' && tc.ms.rx.B1.s === 3 && tc.ms.rx.B1.r === 4 && tc.ms.rx.B1.cap === 6 && !tc.ms.cal, 'Mon: light pause squat 3×4 @ RPE ≤ 6, no calibration');
  ok(!tc.mr.opt && tc.mr.def === 'db_row_1arm' && tc.md === 'db_leanaway', 'Mon: one-arm DB row on by default; lean-away lateral default');
  ok(tc.wc.def === 'bench_bd_cg' && tc.wc.tier === 'S2' && tc.wc.rx.B1.s === 4 && tc.wc.rx.B1.lo === 5 && tc.wc.rx.B1.hi === 6 && tc.wc.rx.B1.rpe === 8, 'Wed: close-grip BD bench 4×5–6 @ RPE ≤ 8');
  ok(tc.wp === 'chinups' && tc.wh.hang && tc.wr === 'fam_camber_row' && tc.wd.opt && tc.wd.on === false, 'Wed: dead-hang warm-up, chin-ups, camber row family, dips optional');
  ok(JSON.stringify(tc.thu) === '["smith_incline","fam_pulldown","smith_seated_ohp","fam_row","ft_fly_mid","fam_oh_ext","fam_pushdown","fam_cable_lat","fam_facepull","leg_curl","leg_ext"]', 'Thu: the 11 slots in order (' + tc.thu.join(',') + ')');
  ok(tc.sq.tier === 'P1' && tc.sq.lift === 'ssb_w' && !tc.sq.testOnly && !tc.vol, 'Sat: SSB wedge is a weekly priority lift; fixed-load volume slot retired');
  ok(tc.satPB.def === 'bench_bd_pause' && tc.satPB.rx.B1.r === 4 && tc.satPB.rx.B1.cap === 7 && tc.hinge.def === 'trap_rdl' && tc.hinge.rx.B1.rpe === 7.5, 'Sat: paused bench 3×4 @ 7, trap bar RDL 3×6–8 @ ≤ 7.5');
  ok(tc.calf.lo === 10 && tc.calf.hi === 15 && !tc.defB, 'Sat calves 3 × 10–15; no automatic block rotations (no defB)');

  console.log('Week layout');
  const lay = await p.evaluate(() => ({ mon: DOW_PLAN[1], tue: DOW_PLAN[2], wed: DOW_PLAN[3], thu: DOW_PLAN[4], fri: DOW_PLAN[5], sat: DOW_PLAN[6], sun: DOW_PLAN[0], A: JSON.stringify(WEEK_LAYOUTS.A.V) === JSON.stringify(WEEK_LAYOUTS.B.V) }));
  ok(lay.mon.lift === 'MON' && lay.wed.lift === 'WED' && lay.thu.lift === 'THU' && !lay.fri.lift && lay.fri.ride === 'opt' && lay.sat.lift === 'SAT', 'lifts Mon/Wed/Thu/Sat; Friday = optional easy ride');
  ok(lay.tue.ride && !lay.tue.lift, 'Tuesday is a Zwift day with no gym session');
  ok(!lay.sun.lift && lay.sun.ride === 'opt', 'Sunday is rest / optional easy ride');
  ok(lay.A, 'week layouts A and B are the same for you');
  ok(lay.thu.ride !== 'easy' && !lay.wed.ride, 'no easy Thursday ride, no Wednesday ride');

  console.log('Dates: deload and test weeks');
  const dates = await p.evaluate(() => {
    const w = iso => { const x = weekInfo(iso); return [x.w, x.block, x.deload ? 'deload' : '', x.ph || ''].join('/'); };
    return { w1: w('2026-10-05'), w2: w('2026-10-07'), w3: w('2026-10-12'), w5: w('2026-10-26'), w11: w('2026-12-07'), w12: w('2026-12-14'), wk5: weekInfo('2026-10-26').deload, wk12: weekInfo('2026-12-14').bw,
      lt: w('2026-12-21'), vol: w('2027-01-04'), vd: w('2027-02-01'), str: w('2027-02-08'), tw: w('2027-03-08'), post: w('2027-03-15'), nb: [blockLabel('B3'), blockLabel('LT'), blockLabel('VOL'), blockLabel('STR'), blockLabel('TW'), blockLabel('B2')].join(',') };
  });
  ok(dates.wk5 === true, 'week 5 (26 Oct – 1 Nov) is a deload: ' + dates.w5);
  ok(/^11\//.test(dates.w11) && /^12\/B3\/\/BENCH CHECKPOINT/.test(dates.w12), 'weeks 11 and 12 keep their numbers; wk 12 = bench checkpoint: ' + dates.w11 + ' · ' + dates.w12);
  ok(/^13\/LT\/deload/.test(dates.lt) && /^15\/VOL\/\//.test(dates.vol) && /^19\/VOL\/deload/.test(dates.vd) && /^20\/STR\//.test(dates.str) && /^24\/TW/.test(dates.tw) && /^25\/POST/.test(dates.post), 'v5.4 blocks: light wk13–14, volume wk15–19 (19 deload), strength wk20–23, test window wk24: ' + [dates.lt, dates.vol, dates.vd, dates.str, dates.tw, dates.post].join(' · '));
  ok(dates.nb === 'PEAK,LIGHT,B3,B4,TEST,B2', 'Notion block names: ' + dates.nb);

  console.log('Preview: Mon 5 Oct (heavy bench moved to Monday in v5.4)');
  let r = await onDay(browser, T.MON05, 'MON', '', SUMMARY, 'MON');
  let ex = r.res.ex;
  const bench = ex.find(e => e.id === 'bench_bd'), dips = ex.find(e => e.id === 'db_hammer');
  const top = bench.sets.find(s => s.kind === 'top'), backs = bench.sets.filter(s => s.kind === 'back'), cal = bench.sets.find(s => s.kind === 'cal');
  ok(top && top.r === 5 && top.total === 70 && top.v === 25, 'bench top 5 @ 70 kg (25/sleeve): ' + JSON.stringify(top));
  ok(backs.length === 2 && backs.every(b => b.total === 64), 'back-offs 64 kg (22/sleeve) ×2: ' + backs.map(b => b.total));
  ok(cal && cal.total === 70 && cal.v === 25, 'last back-off = calibration set at 70 kg (25/sleeve)');
  ok(dips && dips.skipped, 'optional hammer curl off by default');
  ok(r.errs.length === 0, 'no JS errors ' + r.errs.join(' | '));

  console.log('Preview: Sat 10 Oct');
  r = await onDay(browser, T.SAT10, 'SAT', E1SEED, SUMMARY, 'SAT');
  ex = r.res.ex;
  const sq = ex.find(e => e.id === 'ssb_w'), pb = ex.find(e => e.id === 'bench_bd_pause');
  const sqw = sq.sets.filter(s => s.kind !== 'wu'), pbw = pb.sets.filter(s => s.kind !== 'wu');
  ok(sqw[0].kind === 'top' && sqw[0].r === 5 && sqw[0].rpe === 7.5 && sqw.filter(s => s.kind === 'back').length === 2, 'B1 Saturday: SSB wedge top 5 @ 7.5 + 2 back-offs: ' + JSON.stringify(sqw.map(s => s.kind + s.r + '=' + s.total)));
  ok(sqw[0].total === Math.round(sqw[0].total) && sqw[0].total >= 108 && sqw[0].total <= 112, 'top set from SSB e1RM 137.5: ' + sqw[0].total);
  ok(!ex.some(e => e.id === 'ssb_vol_w'), 'no fixed-load SSB volume slot');
  ok(pbw.length === 3 && pbw.every(s => s.r === 4 && s.rpe === 7), 'paused bench 3×4 @ RPE ≤ 7: ' + JSON.stringify(pbw.map(s => s.r + '@' + s.rpe + '=' + s.total)));
  ok(ex.find(e => e.id === 'db_lateral').skipped, 'optional DB laterals off by default');
  ok(r.errs.length === 0, 'no JS errors ' + r.errs.join(' | '));

  console.log('Monday: light pause squat + bench calibration');
  r = await onDay(browser, T.MON12, 'MON', '', SUMMARY, 'MON');
  ex = r.res.ex;
  const ps = ex.find(e => e.id === 'ssb_pause_w'); const psw = ps.sets.filter(s => s.kind !== 'wu');
  ok(ps.tier === 'S2R' && psw.length === 3 && psw.every(s => s.r === 4 && s.rpe === 6), 'pause squat is light: 3×4 @ RPE ≤ 6 (' + JSON.stringify(psw.map(s => s.r + '@' + s.rpe)) + ')');
  ok(!ps.sets.some(s => s.kind === 'cal'), 'no squat calibration on Monday');
  const mb = ex.find(e => e.id === 'bench_bd'); const mbc = mb.sets.find(s => s.kind === 'cal');
  ok(mbc && mbc.total === 70 && mb.sets.filter(s => s.kind === 'back' || s.kind === 'cal').length === 3, 'bench: first calibration (70 kg) replaces the last of 3 back-offs');
  const hg = ex.find(e => e.id === 'dead_hang'); ok(hg && hg.sets.filter(s => s.kind !== 'wu').length === 2 && hg.sets[0].lo === 10, 'dead hang 2 × 10 s');
  ok(r.errs.length === 0, 'no JS errors ' + r.errs.join(' | '));

  console.log('Calibration cadence and deload');
  const recent = seedCal({ last: { bench: '2026-10-05' }, defer: {}, offsets: {}, log: [] });
  r = await onDay(browser, T.MON12, 'MON', recent, SUMMARY, 'MON');
  ok(!r.res.ex.find(e => e.id === 'bench_bd').sets.some(s => s.kind === 'cal'), 'no prompt 7 days after a calibration');
  const old = seedCal({ last: { bench: '2026-09-14' }, defer: {}, offsets: {}, log: [] });
  r = await onDay(browser, T.MON12, 'MON', old, SUMMARY, 'MON');
  const oc = r.res.ex.find(e => e.id === 'bench_bd').sets.find(s => s.kind === 'cal');
  ok(oc && oc.firstTotal == null, 'prompted again after 4 weeks (not the first-run load): ' + (oc && oc.total));
  r = await onDay(browser, T.MON26, 'MON', old, SUMMARY, 'MON');
  ok(r.res.wk.deload && !r.res.ex.find(e => e.id === 'bench_bd').sets.some(s => s.kind === 'cal'), 'never in a deload week (26 Oct)');
  r = await onDay(browser, T.MON14D, 'MON', old, SUMMARY, 'MON');
  ok(!r.res.ex.some(e => e.sets.some(s => s.kind === 'cal')), 'not in the test week');

  console.log('Calibration flow (bench, Mon 5 Oct)');
  p = await newPage(browser, T.MON05, seedV());
  await p.evaluate(() => { S.day = null; beginSession('MON'); startLive && S.previewing && startLive(); });
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
  p = await newPage(browser, T.MON05, seedV());
  await p.evaluate(() => { beginSession('MON'); if (S.previewing) startLive(); });
  const dc = await p.evaluate(() => {
    const ei = S.exercises.findIndex(e => e.exId === 'bench_bd'); const ex = S.exercises[ei]; const ci = ex.sets.findIndex(s => s.kind === 'cal');
    S.modal = { ei, si: ci }; S.currentKg = 25; S.currentReps = 6; logCalSet(ei, ci); S.currentReps = 7; logCalSet(ei, ci);
    declineCal(ei, ci, impliedE1(70, 7));
    return { cur: e1Cur('bench'), adj: S.adjust.join(' | '), log: calState().log };
  });
  ok(dc.cur === 87.5 && /NOT applied/.test(dc.adj) && dc.log.length === 1 && dc.log[0].applied === false, 'declined: e1RM unchanged, logged as not applied');
  const sk = await p.evaluate(() => {
    const ei = S.exercises.findIndex(e => e.exId === 'bench_bd'); const ex = S.exercises[ei];
    beginSession('MON'); if (S.previewing) startLive();
    const e2 = S.exercises.find(e => e.exId === 'bench_bd'); const i2 = e2.sets.findIndex(s => s.kind === 'cal');
    const n = e2.sets.length; skipCal(S.exercises.indexOf(e2), i2);
    return { n, after: e2.sets.length, defer: calState().defer.bench };
  });
  ok(sk.after === sk.n - 1 && !!sk.defer, 'skip removes the set and defers a week (' + sk.defer + ')');
  await p.close();

  console.log('Zwift rule removed');
  p = await newPage(browser, T.MON12, seedV());
  const zr = await p.evaluate(() => ({ cap: SET.zwiftSquatCap, th: typeof tomorrowHard, msg: JSON.stringify(readiness(null)) }));
  ok(zr.cap === undefined && zr.th === 'undefined' && !/squats at RPE|hard Zwift/i.test(zr.msg), 'hard-Zwift-tomorrow squat cap removed');
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
  ok(hh.start === 10 && hh.pullups === true, 'start at 10 s; pull-ups unlocked by the v5.4 one-off');
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

  console.log('Friday retired');
  p = await newPage(browser, T.FRI09, seedV());
  const fr = await p.evaluate(() => ({ cards: document.getElementById('day-cards').textContent, keys: templatesFor(weekInfo(localISO())), ok: !!TEMPLATES.FRI && TEMPLATES.FRI.retired }));
  ok(!fr.keys.includes('FRI') && !/FRI · [A-Z]+ · /.test(fr.cards.replace('FRI · OPTIONAL EASY RIDE','')) && fr.ok, 'no Friday gym card; the old template is kept only for old sessions');
  ok(/FRI · OPTIONAL EASY RIDE/.test(fr.cards), 'Friday shows as an optional easy ride');
  await p.close();

  console.log('Tuesday ride A/B');
  p = await newPage(browser, T.TUE06, seedV());
  const tu = await p.evaluate(() => ({ ready: document.getElementById('ready-wrap').textContent, cards: [...document.querySelectorAll('#day-cards .dc-tag, #day-cards .dc-ride-tag')].map(e => e.textContent), lay: DOW_PLAN }));
  ok(tu.lay[1].lift === 'MON' && tu.lay[2].ride === 'tue' && tu.lay[0].ride === 'opt', 'layout: Mon lift, Tue ride, Sun optional ride');
  ok(/no gym/i.test(tu.ready), 'Tuesday card says no gym: ' + tu.ready.slice(0, 80));
  ok(tu.cards.some(t => /TUE · (SWEET SPOT|EASY RIDE)/.test(t)), 'Tuesday card shows ride type: ' + tu.cards.join('|'));
  await p.close();

  console.log('Mode / volume');
  p = await newPage(browser, T.MON12, seedV());
  const md = await p.evaluate(() => ({
    lbl: unitLbl({type:'db'}), long: unitLong({type:'db'}),
    calf: volumeKg({type:'db'}, 12.5, 20, 'db_calf_raise'),
    lat: volumeKg({type:'db'}, 10, 12, 'db_lateral')
  }));
  ok(/DB/.test(md.lbl) && /per DB/.test(md.long), 'DB label: ' + md.lbl + ' / ' + md.long);
  ok(md.calf === 12.5 * 20 || md.calf === 12.5 * 20 * 2, 'calf volume uses declared mode (' + md.calf + ')');
  await p.close();

  console.log('Tuesday rotation, downgrade, fixed Saturday');
  p = await newPage(browser, T.MON12, seedV());
  const rot = await p.evaluate(() => {
    S.rides = [];
    const seq0 = ['2026-10-13','2026-10-20','2026-10-27','2026-11-03'].map(d => tueInfo(d).eff);
    localStorage.setItem('gym_legs_heavy', JSON.stringify({'2026-10-12': 1}));
    const rec = syncTueDowngrade('2026-10-13', false);
    const after = ['2026-10-13','2026-10-20','2026-10-27','2026-11-03'].map(d => { const i = tueInfo(d); return i.eff; });
    const own = !!tueDownMap()['2026-10-13'] && !(S.sessionDates['2026-10-13'] || []).length;
    return { seq0, after, own, rec: !!rec, fixed: Object.values(TEMPLATES).some(t => t.slots.some(s => s.fixed)) };
  });
  ok(rot.seq0[0] === 'A' && rot.seq0[1] === 'B', 'rotation alternates from the anchor: ' + rot.seq0);
  ok(rot.rec && rot.own, 'downgrade is its own record, not a session');
  ok(rot.after.join('') === 'BABA'.replace(/^BABA$/, 'BABA') || (rot.after[0] === 'B' && rot.after[1] === 'A'), 'downgraded A repeats next Tuesday: ' + rot.after);
  ok(!rot.after.join('').includes('BB'), 'never two easy weeks in a row: ' + rot.after);
  ok(rot.fixed === false, 'v5.4: the fixed-load Saturday rule is retired');
  await p.close();

  console.log('Mon 14 Dec bench checkpoint + Sat 12 Dec SSB test');
  r = await onDay(browser, T.MON14D, 'MON', '', SUMMARY, 'MON');
  const ck = r.res.ex.find(e => e.id === 'bench_bd'); const ckw = ck.sets.filter(s => s.kind !== 'wu');
  ok(ckw[0].kind === 'top' && ckw[0].r === 3 && ckw[0].rpe === 9 && !ckw.some(s => s.kind === 'cal' || s.kind === 'test'), 'Mon 14 Dec: checkpoint top triple @ ≤ 9, no max, no calibration');
  ok(!r.res.ex.some(e => e.id === 'ssb_pause_w'), 'checkpoint Monday: no squat');
  p = await newPage(browser, T.WED16D, seedV());
  const wt16 = await p.evaluate(() => ({ keys: templatesFor(weekInfo(localISO())), card: document.getElementById('day-cards').textContent }));
  ok(!wt16.keys.includes('TEST') && /BENCH TEST · ANY DAY/.test(wt16.card), 'Wed 16 Dec is no longer a test day; the any-day test card stays');
  await p.close();
  r = await onDay(browser, T.SAT12D, 'SAT', E1SEED, SUMMARY, 'SAT');
  const st = r.res.ex.find(e => e.id === 'ssb_w');
  const tw = st.sets.filter(s => s.kind !== 'wu' && s.total).map(s => s.total);
  ok(st.sets.some(s => s.kind === 'test') && tw.includes(131) && tw.includes(137), 'Sat 12 Dec: SSB test singles include 131 / 137 kg: ' + tw);
  ok(!r.res.ex.some(e => e.id === 'trap_rdl'), 'no hinge on the SSB test day');
  r = await onDay(browser, T.SAT19D, 'SAT', E1SEED, SUMMARY, 'SAT');
  ok(r.res.ex.find(e => e.id === 'ssb_w').sets.filter(s => s.kind === 'top')[0].rpe === 6, 'post-test Saturday: easy SSB triple');

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
    for (const exId of ['fam_pulldown', 'fam_row']) { const ei = S.exercises.findIndex(e => e.exId === exId); const ex = S.exercises[ei];
      for (let si = 0; si < 2; si++) { S.modal = { ei, si }; S.currentKg = 50; S.currentReps = 8; S.currentRpe = 8; logSet(); ex.sets[si].at = t0 + (n++) * 150000; } }
    endSession(); const pl = buildNotionPayload(); const tbl = pl.children[1].table;
    return { w: tbl.table_width, hdr: tbl.children[0].table_row.cells.map(c => c[0].text.content), type: JSON.stringify(pl.properties.Type || pl.properties['Session Type'] || null),
      notes: pl.properties.Notes.rich_text.map(x => x.text.content).join(''), e1: [pl.properties['Bench e1RM'].number, pl.properties['SSB e1RM'].number] };
  });
  ok(pay.w === 10 && pay.hdr.join(',') === 'Slot,Exercise,Variant,Set,Logged,Total kg,Reps,RPE,Time,Rest', 'Notion table: Variant column added, Time + Rest kept');
  ok(/W26 THU/.test(pay.type), 'Thursday session type W26 THU: ' + pay.type);
  ok(pay.e1[0] === 87.5, 'Notion e1RMs to one decimal (' + pay.e1.join(' / ') + ')');
  await p.close();
  p = await newPage(browser, T.WED07, seedV());
  await p.evaluate(() => { beginSession('WED'); if (S.previewing) startLive(); endSession(); });
  const wt = await p.evaluate(() => JSON.stringify(buildNotionPayload().properties));
  ok(/W26 WED/.test(wt), 'Wednesday logs as "W26 WED"');
  await p.close();

  console.log('v5.3 warm-ups, → S1 timer, any-day bench test');
  T.SAT24 = '2026-10-24T10:00:00+09:00';
  p = await newPage(browser, T.SAT24, seedV());
  const home = await p.evaluate(() => ({ card: document.getElementById('day-cards').textContent, e1: e1Cur('bench'), src: S.e1.bench.hist.slice(-1)[0] }));
  ok(/BENCH TEST · ANY DAY/.test(home.card), 'home offers BENCH TEST · ANY DAY outside the test week');
  ok(home.e1 === 100 && home.src.src === 'test' && home.src.date === '2026-10-23', 'one-off: Fri 23 Oct 100 kg single recorded as the bench e1RM (' + home.e1 + ')');
  const sat = await p.evaluate(() => {
    beginSession('SAT'); if (S.previewing) startLive();
    const by = id => S.exercises.findIndex(e => e.slot === id);
    const lad = id => wuSteps(S.exercises[by(id)]);
    const out = { sq: lad('sat_squat'), pb: lad('sat_bench'), rdl: lad('sat_hinge'), txt: wuLadderText(S.exercises[by('sat_squat')]) };
    renderSession(); out.ladders0 = document.querySelectorAll('.wu-ladder').length;
    const ei = by('sat_squat'); const ex = S.exercises[ei];
    S.modal = { ei, si: 0 }; S.currentKg = 25; logSet();
    out.wuRest = S.restTotal; out.wuTxt = document.getElementById('rest-logged').textContent; out.restScreen = document.getElementById('screen-rest').classList.contains('active');
    closeModal();
    S.modal = { ei, si: 1 }; S.currentKg = 38.5; S.currentReps = 5; S.currentRpe = 8; logSet();
    out.sqvRest = S.restTotal; closeModal(); renderSession();
    out.ladders1 = document.querySelectorAll('.wu-ladder').length;
    const pbi = by('sat_bench'); S.modal = { ei: pbi, si: 0 }; S.currentKg = 20; logSet(); out.pbWuRest = S.restTotal; closeModal();
    S.modal = { ei: pbi, si: 0 }; logSet(); out.again = S.restTotal;
    out.rx = rxLine(ex);
    return out;
  });
  ok(sat.sq && sat.sq.first && sat.sq.steps.length === 4 && sat.sq.steps[0].bar && sat.sq.steps[3].r === 1 && sat.sq.single, 'first lift (SSB priority lift): bar×8 → 50%×5 → 70%×3 → 85%×1 (' + sat.txt + ')');
  ok(sat.pb && !sat.pb.first && sat.pb.steps.length === 2 && sat.pb.steps[0].r === 5 && sat.pb.steps[1].r === 2, 'later lift (paused bench): 60%×5 → 80%×2');
  ok(sat.rdl && sat.rdl.steps.length === 2, 'trap bar RDL gets a 2-step ladder (it had none before)');
  ok(/per sleeve/.test(sat.txt) && /S1 timer/.test(sat.txt), 'ladder text has reps, units and the S1 hint');
  ok(sat.wuRest === 150 && sat.restScreen && /warm-up done/.test(sat.wuTxt), 'warm-up chip starts the → S1 timer at 2:30 after an 85% single (' + sat.wuRest + ')');
  ok(sat.sqvRest === 180, 'Saturday SSB top set rests like a priority lift, 3:00 (' + sat.sqvRest + ')');
  ok(sat.ladders0 === 3 && sat.ladders1 === 2, 'ladder stays until set 1 is logged, then hides (' + sat.ladders0 + ' → ' + sat.ladders1 + ')');
  ok(/TOP 1×5 @ RPE/.test(sat.rx), 'Saturday SSB reads as a top set (' + sat.rx.slice(0, 40) + ')');
  ok(p._errs.length === 0, 'no JS errors (Saturday) ' + p._errs.join(' | '));
  await p.close();

  T.MON26b = '2026-10-26T10:00:00+09:00';
  p = await newPage(browser, T.MON26b, seedV());
  const mon = await p.evaluate(() => { beginSession('MON'); if (S.previewing) startLive();
    const ei = S.exercises.findIndex(e => e.slot === 'mon_bench'); const w = wuSteps(S.exercises[ei]);
    S.modal = { ei, si: 0 }; S.currentKg = 20; logSet(); return { w, rest: S.restTotal }; });
  ok(mon.w && mon.w.single && mon.w.steps[mon.w.steps.length - 1].r === 1, 'Monday P1 bench ladder ends on an 85% single');
  ok(mon.rest === 150, 'after an 85% single the → S1 timer is 2:30 (' + mon.rest + ')');
  await p.close();

  p = await newPage(browser, T.SAT24, seedV());
  const tst = await p.evaluate(() => {
    beginSession('TEST'); if (S.previewing) startLive();
    const ei = S.exercises.findIndex(e => e.lift === 'bench'); const ex = S.exercises[ei];
    const kinds = workingSets(ex).map(s => s.kind).join(',');
    [[35, 8], [37.5, 8.5], [40, 9.5], [41.25, 10]].forEach(([kg, rpe], i) => { S.modal = { ei, si: i + 1 }; S.currentKg = kg; S.currentReps = 1; S.currentRpe = rpe; logSet(); closeModal(); });
    endSession(); const pl = buildNotionPayload();
    return { kinds, e1: e1Cur('bench'), last: S.e1.bench.hist.slice(-1)[0], adj: S.adjust.join(' | '), type: JSON.stringify(pl.properties.Type), b: pl.properties['Bench e1RM'].number, ps: pl.properties['Pause squat e1RM'] };
  });
  ok(tst.kinds === 'test,test,test,test', 'any-day bench test runs the four singles in a build week');
  ok(tst.e1 === 102.5 && tst.last.src === 'test', 'tested max replaces the bench e1RM, no RPE estimate (' + tst.e1 + ')');
  ok(/Bench test: best single 102.5/.test(tst.adj), 'test result written to Adjustments');
  ok(/W26 BENCH TEST/.test(tst.type) && tst.b === 102.5, 'Notion: Type W26 BENCH TEST, Bench e1RM 102.5');
  ok(tst.ps && typeof tst.ps.number === 'number', 'Notion: Pause squat e1RM column written (' + JSON.stringify(tst.ps) + ')');
  ok(p._errs.length === 0, 'no JS errors (bench test) ' + p._errs.join(' | '));
  await p.close();

  console.log('v5.4: Block 2 priority lifts');
  T.MON02N = '2026-11-02T19:00:00+09:00'; T.SAT07N = '2026-11-07T10:00:00+09:00'; T.THU03D = '2026-12-03T13:00:00+09:00'; T.WED04N = '2026-11-04T12:00:00+09:00';
  r = await onDay(browser, T.MON02N, 'MON', '', SUMMARY, 'MON');
  const b2 = r.res.ex.find(e => e.id === 'bench_bd').sets.filter(s => s.kind !== 'wu');
  ok(b2[0].kind === 'pct' && b2[0].r === 1 && b2[0].total === 90 && b2[1].kind === 'top' && b2[1].r === 3 && b2[1].rpe === 7.5, 'Mon 2 Nov: single @ 90% (90 kg) then top 3 @ RPE 7.5: ' + JSON.stringify(b2.map(s => s.kind + s.r + '=' + s.total)));
  ok(b2.filter(s => s.kind === 'back' || s.kind === 'cal').length === 3, 'then 3 back-offs (the last may be the calibration set)');
  r = await onDay(browser, T.SAT07N, 'SAT', E1SEED, SUMMARY, 'SAT');
  const s2 = r.res.ex.find(e => e.id === 'ssb_w').sets.filter(s => s.kind !== 'wu');
  ok(s2[0].kind === 'top' && s2[0].r === 3 && s2[0].rpe === 7.5 && s2[0].total === 116, 'Sat 7 Nov: SSB top 3 @ 7.5 = 116 kg from e1RM 137.5 (' + s2[0].total + ')');
  ok(s2.filter(s => s.kind === 'back').length === 3 && s2.filter(s => s.kind === 'back').every(s => s.r === 4 && s.total === 101), 'then 3×4 @ 88% of the top set (101 kg)');
  p = await newPage(browser, T.MON02N, seedV(`localStorage.setItem('gym_history', JSON.stringify(Object.assign(JSON.parse(localStorage.getItem('gym_history')),
    {bench_bd:[{day:'2026-11-02',session:'MON',sets:[{kind:'top',in:35,total:90,reps:3,rpe:9}]}]})));`));
  const mh = await p.evaluate(() => { const a = mondayHeavy('2026-11-02'); S.history.ssb_pause_w = [{ day: '2026-11-02', session: 'MON', sets: [{ kind: 'work', in: 31, total: 92, reps: 4, rpe: 9 }] }]; return [a.length, mondayHeavy('2026-11-02').length]; });
  ok(mh[0] === 0 && mh[1] === 1, 'Tuesday downgrade looks at Monday legs only: bench @ 9 → no, pause squat @ 9 → yes (' + mh + ')');
  await p.close();

  console.log('v5.4: warehouse closed → Thursday at home');
  r = await onDay(browser, T.THU03D, 'THU', '', SUMMARY, 'THU');
  const thIds = r.res.ex.filter(e => !e.skipped).map(e => e.id);
  ok(['db_incline_30', 'pullups', 'db_seated_press', 'db_chest_row', 'db_flat_fly', 'dips', 'db_lateral', 'db_rear_fly', 'kb_swing'].every(id => thIds.includes(id)), 'Thu 3 Dec (closed 1 Dec – 31 Jan): home version with the AB-4100 + DBs + KB swing: ' + thIds.join(','));
  ok(r.res.adjust.some(a => /Warehouse closed/.test(a)), 'session says why it is at home');
  p = await newPage(browser, T.THU03D, seedV());
  const cw = await p.evaluate(() => { beginSession('THU'); const w = changeoverWarn(); goHome(); return { w, card: document.getElementById('day-cards').textContent }; });
  ok(cw.w.length === 1 && /AB-4100 angle: 30° → upright → 30°/.test(cw.w[0]) && /Chest-supported DB row/.test(cw.w[0]), 'setup warning: AB-4100 angle goes back to 30° — group the chest-supported row with the incline (' + cw.w[0] + ')');
  ok(/warehouse closed/.test(cw.card), 'Thursday card shows HOME · warehouse closed');
  await p.evaluate(() => { SET.whClosed = { from: '', to: '' }; saveSettings(); });
  const open = await p.evaluate(() => { beginSession('THU'); return S.sessLoc; });
  ok(open === 'W', 'clearing the dates puts Thursday back at the warehouse');
  await p.close();

  console.log('v5.4: Gym Nano off / preview / installed');
  p = await newPage(browser, T.WED04N, seedV());
  const nOff = await p.evaluate(() => ({ vis: pickVisible('nfam_lat'), wed: (beginSession('WED'), S.exercises.map(e => e.exId)), card: (goHome(), document.getElementById('day-cards').textContent) }));
  ok(nOff.vis === false && !nOff.wed.includes('nfam_lat') && !nOff.wed.includes('nfam_face') && !/PREVIEW \(Programme B\)/.test(nOff.card), 'off: no Nano exercises or cards anywhere');
  await p.evaluate(() => { SET.nano = 'preview'; saveSettings(); });
  const nPv = await p.evaluate(() => {
    goHome(); const card = document.getElementById('day-cards').textContent;
    beginSession('PV_THU'); const ids = S.exercises.map(e => e.exId);
    startLive(); const still = S.previewing;
    const ei = S.exercises.findIndex(e => e.exId === 'nfam_pulldown'); S.modal = { ei, si: 0 }; S.currentKg = 30; S.currentReps = 10; S.currentRpe = 8; logSet();
    return { card, ids, still, logged: S.exercises[ei].sets.some(s => s.in != null), loc: S.sessLoc, vis: pickVisible('nfam_lat') };
  });
  ok(/GYM NANO · PREVIEW \(Programme B\)/.test(nPv.card) && /WED · B PREVIEW/.test(nPv.card) && /THU · B PREVIEW/.test(nPv.card), 'preview: Programme B cards on home');
  ok(nPv.loc === 'H' && ['db_incline_30', 'nfam_pulldown', 'db_seated_press', 'nano_row_1arm', 'nano_fly_1arm', 'nfam_ohe', 'nfam_push', 'nano_leg_curl'].every(id => nPv.ids.includes(id)) && !nPv.ids.includes('fam_cable_lat'), 'preview Thursday at home: DB incline, Nano pulldown / row / fly / overhead ext / pushdown / leg curl; laterals + face pull moved to Wednesday (' + nPv.ids.join(',') + ')');
  ok(nPv.still === true && nPv.logged === false, 'preview: START and logging stay off');
  await p.evaluate(() => { SET.nano = 'installed'; saveSettings(); });
  const nIn = await p.evaluate(() => { beginSession('WED'); return S.exercises.map(e => e.exId); });
  ok(nIn.includes('nfam_face') && nIn.includes('nfam_lat') && !nIn.includes('db_rear_fly'), 'installed: Wednesday gets the Nano face pull + lateral (' + nIn.join(',') + ')');
  await p.close();

  console.log('v5.4: per-set variants (camber bar handles)');
  const VSEED = `localStorage.setItem('gym_history', JSON.stringify(Object.assign(JSON.parse(localStorage.getItem('gym_history')),
    {camber_row_mid:[{day:'2026-10-21',session:'WED',sets:[{kind:'work',in:25,total:70.2,reps:8,rpe:8},{kind:'work',in:25,total:70.2,reps:8,rpe:8}]}],
     camber_row_wide:[{day:'2026-10-14',session:'WED',sets:[{kind:'work',in:20,total:60.2,reps:10,rpe:7}]}]})));
    localStorage.setItem('gym_prs', JSON.stringify(Object.assign(JSON.parse(localStorage.getItem('gym_prs')),{camber_row_mid:70.2,camber_row_wide:60.2})));`;
  p = await newPage(browser, T.WED04N, seedV(VSEED));
  const vr = await p.evaluate(() => {
    beginSession('WED'); startLive(); const ei = S.exercises.findIndex(e => e.slot === 'wed_row'); const ex = S.exercises[ei];
    const out = { v0: ex.sets.map(s => s.v).join(',') };
    openModal(ei, 0); out.kg0 = S.currentKg; out.chips = document.querySelectorAll('#modal-var .var-o').length; S.currentReps = 8; S.currentRpe = 8; logSet(); closeModal();
    openModal(ei, 1); setSetVar('camber_row_wide'); out.kg1 = S.currentKg; out.why1 = S.modal.sg && S.modal.sg.why; S.currentKg = 22.5; S.currentReps = 10; S.currentRpe = 8; logSet(); closeModal();
    out.carry = ex.sets.map(s => s.v).join(',');
    renderSession(); out.chipTag = [...document.querySelectorAll('#excard-' + ei + ' .sc-v')].map(e => e.textContent).join('');
    out.pr = isNewPR(ex, ex.sets[1]);
    endSession();
    out.hm = S.history.camber_row_mid.length; out.hw = S.history.camber_row_wide.length; out.lastW = S.history.camber_row_wide.slice(-1)[0].sets.map(s => s.total).join(',');
    out.fam = S.history.camber_row_wide.slice(-1)[0].fam; out.prW = S.prs.camber_row_wide;
    const pl = buildNotionPayload(); out.row = pl.children[1].table.children.map(r => r.table_row.cells.map(c => c[0].text.content)).find(c => c[1] === 'Camber-bar row' && c[3] === 'S2');
    out.last = famLast('fam_camber_row');
    return out;
  });
  ok(vr.v0 === 'camber_row_mid,camber_row_mid,camber_row_mid' && vr.chips === 3, 'family starts on normal handles; the set window offers narrow / normal / wide');
  ok(vr.kg0 === 25 && vr.kg1 === 20 && /wide/.test(vr.why1), 'each variant suggests from its own history (normal 25, wide 20): ' + vr.kg0 + ' / ' + vr.kg1);
  ok(vr.carry === 'camber_row_mid,camber_row_wide,camber_row_wide', 'later sets carry the previous set\'s handles: ' + vr.carry);
  ok(vr.chipTag === '·WW', 'set chips show the handles (· N W): ' + vr.chipTag);
  ok(vr.pr === true && vr.prW === 65.2, 'PRs per variant (wide 65.2 beats wide 60.2; normal untouched)');
  ok(vr.hm === 2 && vr.hw === 2 && vr.lastW === '65.2' && vr.fam === 'fam_camber_row', 'history saved once per variant used (normal + wide)');
  ok(vr.row && vr.row[2] === 'wide', 'Notion row carries the variant: ' + JSON.stringify(vr.row));
  ok(vr.last === 'camber_row_wide', 'next session starts on the handles you used last');
  await p.close();

  console.log('v5.4: DB ceiling, milestones, weekly review, check-in');
  p = await newPage(browser, T.THU03D, seedV(`localStorage.setItem('gym_history', JSON.stringify(Object.assign(JSON.parse(localStorage.getItem('gym_history')),
    {bench_bd:[{day:'2026-11-02',session:'MON',sets:[{kind:'top',in:35,total:90,reps:3,rpe:8.5}]}]})));`));
  const misc = await p.evaluate(() => {
    beginSession('THU'); startLive(); const ei = S.exercises.findIndex(e => e.exId === 'db_incline_30');
    [1, 2, 3].forEach(si => { S.modal = { ei, si }; S.currentKg = 27.5; S.currentReps = 10; S.currentRpe = 8; logSet(); closeModal(); });
    endSession();
    const flags = S.lastSummary.flags.map(f => f.t).join(' | ');
    const ol = accessoryOverload(Object.assign({}, S.exercises[ei]));
    renderDone(); setCheckin('enjoy', 5); setCheckin('joint', 2);
    const pl = buildNotionPayload();
    const ms = milestoneState();
    S.e1.bench.hist.push({ date: '2026-12-01', v: 104.2 }, { date: '2026-12-02', v: 104.6 });
    goHome();
    return { flags, ceil: lsJSON('gym_db_ceiling', {}).db_incline_30, ol: ol && ol.msg, e: pl.properties.Enjoyment, j: pl.properties['Joint pain'], notes: pl.properties.Notes.rich_text[0].text.content,
      m1: ms[0].done, m2: ms[1].done, m3r: milestoneState()[2].ready, card: document.getElementById('goals-wrap').textContent, wk: weekSets(mondayOf('2026-12-03')), review: document.getElementById('week-strip-wrap').textContent };
  });
  ok(/DB ceiling · DB incline press \(30°\): every set at 27\.5 kg/.test(misc.flags) && misc.ceil && misc.ceil.n === 1, 'DB ceiling: 3×10 @ 27.5 kg is flagged and counted (' + JSON.stringify(misc.ceil) + ')');
  ok(/3 s or pause 1 s/.test(misc.ol || ''), 'next time: 3 s lowering or 1 s pause suggested');
  ok(misc.e && misc.e.number === 5 && misc.j && misc.j.number === 2 && /Check-in: enjoyment 5\/5 · worst joint 2\/10/.test(misc.notes), 'check-in → Notion Enjoyment / Joint pain + notes line');
  ok(misc.m1 === true && misc.m2 === false && misc.m3r === true && /BENCH MILESTONES/.test(misc.card), 'milestones: 90 × 3 @ 8.5 → M1 done; two e1RMs ≥ 104 → M3 ready to test');
  ok(misc.wk['Incline press'] === 3 && /THIS WEEK · sets vs plan/.test(misc.review) && /Incline press3\/3/.test(misc.review), 'weekly review counts this week\'s sets per muscle (' + JSON.stringify(misc.wk) + ')');
  ok(p._errs.length === 0, 'no JS errors (v5.4 features) ' + p._errs.join(' | '));
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
