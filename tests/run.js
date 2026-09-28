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

(async () => {
  await new Promise(r => server.listen(0, r));
  URL = `http://localhost:${server.address().port}/`;
  const browser = await chromium.launch();

  console.log('Program data');
  let p = await newPage(browser, T.SUN27, seedV());
  const prog = await p.evaluate(() => {
    const bad = [];
    for (const [k, t] of Object.entries(TEMPLATES)) for (const s of t.slots) {
      if (!EX[s.def]) bad.push(k + ':' + s.id + ' def ' + s.def);
      if (!s.picks.includes(s.def)) bad.push(k + ':' + s.id + ' def not in picks');
      s.picks.forEach(id => { if (!EX[id]) bad.push(k + ':' + s.id + ' pick ' + id); });
      Object.values(s.defB || {}).forEach(id => { if (!EX[id]) bad.push(k + ':' + s.id + ' defB ' + id); });
    }
    for (const [k, t] of Object.entries(TEMPLATES_T)) for (const s of t.slots) s.picks.concat([s.def]).forEach(id => { if (!EX[id]) bad.push('T ' + k + ':' + id); });
    return { bad, ver: APP_VERSION };
  });
  ok(prog.ver === '4.5', 'version 4.5');
  ok(prog.bad.length === 0, 'every default / pick / block default exists in EX ' + prog.bad.join(','));
  ok(p._errs.length === 0, 'no JS errors on load ' + p._errs.join(' | '));

  console.log('v4.3 Friday/Thursday attachments');
  const v43 = await p.evaluate(() => {
    const sl = (d, id) => TEMPLATES[d].slots.find(s => s.id === id);
    return { rear: sl('FRI', 'fri_rear').def, curl: sl('FRI', 'fri_biceps').def, curlPicks: sl('FRI', 'fri_biceps').picks,
      cuff: sl('FRI', 'fri_delts').picks.includes('ft_lateral_cuff'), ham: sl('FRI', 'fri_biceps2').picks.includes('ft_kaz_hammer_d'),
      chop: EX.ft_chop.n, fly: sl('THU', 'thu_chest').picks.filter(x => x.endsWith('_kaz')).length };
  });
  ok(v43.rear === 'ft_rear_fly', 'Fri rear delts default = FT rear-delt fly');
  ok(v43.curl === 'ft_kaz_curl_1a' && v43.curlPicks.includes('ft_curl'), 'Fri curl default = KAZ single-arm; straight bar kept in dropdown');
  ok(v43.cuff && v43.ham, 'cuff lateral + KAZ D-mode hammer are options');
  ok(/neoprene strap/.test(v43.chop), 'woodchop on the neoprene strap');
  ok(v43.fly === 2, 'Thu KAZ D-mode fly options');

  console.log('Saturday');
  const sat = await p.evaluate(() => {
    const t = TEMPLATES.SAT; const on = t.slots.filter(s => !s.opt || s.on).map(s => s.id);
    return { on, est: estMinutes(t, weekInfo('2026-10-03'), 'SAT'), bench: t.slots.find(s => s.id === 'sat_bench').rx.B1.s };
  });
  ok(JSON.stringify(sat.on) === JSON.stringify(['sat_squat', 'sat_bench', 'sat_hinge', 'sat_tri', 'sat_calves']), 'Sat on by default: squat, bench, RDL, skulls, calves (' + sat.on + ')');
  ok(sat.bench === 4, 'camber bench stays 4 sets');
  ok(sat.est === '~63 min', 'Sat estimate ~63 min (' + sat.est + ')');

  console.log('Week layouts');
  const lay = await p.evaluate(() => ({ l: weekLayout(), tue: DOW_PLAN[2], thu: DOW_PLAN[4], fri: DOW_PLAN[5], wed: DOW_PLAN[3], tMon: DOW_PLAN_T[1], tFri: DOW_PLAN_T[5], tSat: DOW_PLAN_T[6] }));
  ok(lay.l === 'B', 'default layout is B');
  ok(lay.tue.ride === 'hard' && lay.wed.rest && lay.thu.lift === 'THU' && lay.thu.ride === 'easy' && !lay.fri.ride, 'B for V: hard Tue, rest Wed, THU + easy, FRI lift only');
  ok(lay.tMon.ride === 'z2' && lay.tFri.ride === 'quality' && lay.tSat.rest, 'B for Tomoko: Z2 Mon, quality Fri, rest Sat');
  const noB2B = await p.evaluate(() => Object.values(WEEK_LAYOUTS).every(L => ['V', 'T'].every(who => {
    const P = L[who]; const zw = d => P[d].ride && P[d].ride !== 'long' && P[d].ride !== 'opt';
    return [0, 1, 2, 3, 4, 5, 6].every(d => !(zw(d) && zw((d + 1) % 7)));
  })));
  ok(noB2B, 'no back-to-back Zwift days for either of you in A or B');
  const oneKickr = await p.evaluate(() => Object.values(WEEK_LAYOUTS).every(L => [0,1,2,3,4,5,6].every(d => {
    const v = L.V[d].ride && L.V[d].ride !== 'opt', t = L.T[d].ride && L.T[d].ride !== 'long'; return !(v && t); })));
  ok(oneKickr, 'never both on the KICKR the same day');
  await p.evaluate(() => setWeekLayout('A'));
  const layA = await p.evaluate(() => ({ l: localStorage.getItem('gym_week_layout'), wed: DOW_PLAN[3].ride, fri: DOW_PLAN[5].ride, tMon: DOW_PLAN_T[1].ride }));
  ok(layA.l === 'A' && layA.wed === 'hard' && layA.fri === 'easy' && layA.tMon === 'quality', 'switch to A restores the original week');
  await p.evaluate(() => setWeekLayout('B'));

  console.log('Bench e1RM fix + durations');
  const fix = await p.evaluate(() => ({ top: S.history.bench_bd.find(e => e.day === '2026-09-21').sets.find(s => s.kind === 'top'), cur: e1Cur('bench'), hist: S.e1.bench.hist.map(x => x.v), dur: durMap() }));
  ok(fix.top.total === 70 && fix.top.in === 25, '21 Sep bench TOP corrected to 70 kg (25/sleeve)');
  ok(fix.cur === 87.5, 'bench e1RM now 87.5 (' + fix.cur + ')');
  ok(fix.dur['2026-09-26|SAT'] === 107 && fix.dur['2026-09-21|MON'] === 115, 'week-0 durations seeded');
  await p.evaluate(() => { S.e1.bench.cur = 90; saveData(); }); await p.reload(); await p.waitForTimeout(200);
  ok(await p.evaluate(() => e1Cur('bench')) === 90, 'bench fix runs once only');
  await p.close();

  console.log('Bar weights + totals (v4.5)');
  p = await newPage(browser, T.MON28, seedV());
  const bw = await p.evaluate(() => {
    const H = S.history; const tot = (k, day) => H[k].find(e => (e.day || '') === day).sets.map(s => s.total);
    return { bars: SET.bars, ver: SET.barsVerified, ssb: tot('ssb_w', '2026-09-26'), trap: tot('trap_rdl', '2026-09-26'), ez: tot('ez_curl', '2026-09-28'), camber: tot('camber_mid', '2026-09-26'),
      v2: H.bench_bd.find(e => !e.day).sets[0], benchTop: H.bench_bd.find(e => e.day === '2026-09-21').sets.map(s => s.total),
      e1ssb: e1Cur('ssb_w'), e1bench: e1Cur('bench'), prs: S.prs, goal: [...document.querySelectorAll('.goal-val')].map(e => e.textContent),
      t: { ez: toTotal(EQ('ezHome'), 10), trap: toTotal(EQ('trap'), 35), ssb: toTotal(EQ('ssb'), 32), camber: toTotal(EQ('camber'), 25), bd: toTotal(EQ('bd'), 24.5) } };
  });
  ok(JSON.stringify(bw.bars) === JSON.stringify({ bd: 20, ssb: 30, trap: 34.5, ezHome: 15.9, camber: 20.2, gymway: 15.6 }), 'bar weights exact: ' + JSON.stringify(bw.bars));
  ok(Object.values(bw.ver).every(Boolean), 'all bars marked verified');
  ok(bw.t.ez === 35.9 && bw.t.trap === 104.5 && bw.t.ssb === 94 && bw.t.camber === 70.2 && bw.t.bd === 69, `totals: EZ 10 → ${bw.t.ez} · trap 35 → ${bw.t.trap} · SSB 32 → ${bw.t.ssb} · camber 25 → ${bw.t.camber} · BD 24.5 → ${bw.t.bd}`);
  ok(JSON.stringify(bw.ssb) === '[85,107,98,98]', 'SSB 26 Sep recalculated: ' + bw.ssb);
  ok(JSON.stringify(bw.trap) === '[74.5,104.5,104.5]' && bw.ez[0] === 35.9 && bw.camber[0] === 70.2, `trap ${bw.trap} · EZ ${bw.ez} · camber ${bw.camber}`);
  ok(Math.abs(bw.e1ssb - 131.97) < 0.01 && bw.goal[1].startsWith('132.0'), `SSB e1RM ${bw.e1ssb} shows ${bw.goal[1]}`);
  ok(bw.e1bench === 87.5 && bw.goal[0].startsWith('87.5') && JSON.stringify(bw.benchTop) === '[56,70,70,70]', 'bench unchanged (e1RM 87.5, totals 56/70/70/70)');
  ok(bw.v2.kg === 80 && bw.v2.total === undefined, 'v2 bench entry (total in kg) left alone');
  ok(bw.prs.trap_rdl === 104.5 && bw.prs.ssb_w === 107 && bw.prs.ez_curl === 35.9 && bw.prs.bench_bd === 80, 'PRs recalculated for changed bars only ' + JSON.stringify(bw.prs));
  await p.evaluate(() => { S.day = null; startSession('MON'); });
  const modal = await p.evaluate(() => { const ei = S.exercises.findIndex(e => e.exId === 'ez_curl'); S.modal = { ei, si: 0 }; S.currentKg = 10; updateKgDisplay(); const a = document.getElementById('kg-total').textContent;
    const ej = S.exercises.findIndex(e => e.exId === 'ssb_pause_w'); S.modal = { ei: ej, si: 1 }; S.currentKg = 32; updateKgDisplay(); return [a, document.getElementById('kg-total').textContent]; });
  ok(modal[0] === 'REP EZ bar 15.9 + 20 = 35.9 kg' && modal[1] === 'SSB 30 + 64 = 94 kg', 'weight picker total line: ' + modal.join(' | '));
  await p.evaluate(() => { SET.bars.ssb = 31; saveSettings(); }); await p.reload(); await p.waitForTimeout(200);
  ok(await p.evaluate(() => SET.bars.ssb) === 31, 'bar migration runs once (a later edit in Settings sticks)');
  ok(p._errs.length === 0, 'no JS errors ' + p._errs.join(' | '));
  await p.close();

  console.log('Snap + back-offs (v4.5)');
  p = await newPage(browser, T.MON28, seedV());
  const sn = await p.evaluate(() => {
    const L = validWeights(EQ('ssb')); const full = L.length === 116 && L.every((v, i) => Math.abs(v - i * 0.5) < 1e-9);
    const e = EQ('bd');
    return { full, half: snapW(e, 21.25), above: snapW(e, 21.26), below: snapW(e, 21.24),
      pb245: plateBreakdown(HOME_PLATES, 24.5), pb34: plateBreakdown(HOME_PLATES, 34), pb375: plateBreakdown(HOME_PLATES, 37.5),
      s1: stripBackoff(e, 24.5, 21.74), s2: stripBackoff(e, 24.5, 21.5), tie: stripBackoff(e, 24.5, 22.25), far: stripBackoff(EQ('ssb'), 20, 17) };
  });
  ok(sn.full, 'home plates build every 0.5 kg step from 0 to 57.5 per sleeve');
  ok(sn.half === 21 && sn.above === 21.5 && sn.below === 21, `nearest, halfway rounds down (21.25 → ${sn.half}, 21.26 → ${sn.above}, 21.24 → ${sn.below})`);
  ok(JSON.stringify(sn.pb245) === '[20,2.5,2]' && JSON.stringify(sn.pb34) === '[20,10,2.5,1.5]' && JSON.stringify(sn.pb375) === '[20,15,2.5]', 'fewest plates, heaviest first');
  ok(sn.s1.v === 22 && JSON.stringify(sn.s1.removed) === '[2.5]', 'back-off: top 24.5, target 21.74 → 22 (take off 2.5)');
  ok(sn.s2.v === 22, 'your example: target 21.5 → 22, not 21.5');
  ok(sn.tie.v === 22, 'tie between 22 and 22.5 → the lighter');
  ok(sn.far === null, 'more than 1 kg away → normal rounding');
  await p.evaluate(() => { S.day = null; startSession('MON'); });
  const bo = await p.evaluate(() => {
    const ei = S.exercises.findIndex(e => e.exId === 'bench_bd'); const ex = S.exercises[ei];
    const bi = ex.sets.findIndex(s => s.kind === 'back'); const planned = suggestFor(ex, bi);
    const ti = ex.sets.findIndex(s => s.kind === 'top'); S.modal = { ei, si: ti }; S.currentKg = 24.5; S.currentReps = 5; S.currentRpe = 7; logSet();
    return { planned, after: suggestFor(ex, bi), top: ex.sets[ti].total };
  });
  ok(bo.planned.v === 22 && /take off 2.5/.test(bo.planned.why), 'planned back-off strips plates: ' + bo.planned.why);
  ok(bo.top === 69 && bo.after.v === 22 && /take off 2.5/.test(bo.after.why), 'after the top set (69 kg): ' + bo.after.why);
  await p.close();

  console.log('Home screen (Mon 28 Sep, week B)');
  p = await newPage(browser, T.MON28, seedV());
  await p.evaluate(() => { S.rides = [{ date: '2026-09-23', name: 'Zwift Tempo', workout: 'Tempo', tss: 56.1, if: 0.814, ctl: 10.48, atl: 9.38 }]; renderHome(); });
  const home = await p.evaluate(() => ({
    tags: [...document.querySelectorAll('#day-cards .dc-tag, #day-cards .dc-ride-tag')].map(e => e.textContent.replace(/TODAY/, '').trim()),
    chip: (document.querySelector('#day-cards .ride-chip') || {}).textContent || '',
    strip: [...document.querySelectorAll('.ws-s')].map(e => e.textContent),
    satLast: [...document.querySelectorAll('#day-cards .dc')].find(e => /SAT|· C/.test(e.textContent) && /WEDGE/.test(e.textContent)).textContent,
    ready: document.getElementById('ready-wrap').textContent }));
  ok(home.tags[0].startsWith('MON') || home.tags[0].includes('A ·') || /BENCH/.test(home.tags[0]), 'cards start with Monday');
  ok(home.tags.some(t => /TUE · HARD ZWIFT/.test(t)), 'Tuesday HARD ZWIFT card');
  ok(home.tags.some(t => /SUN · OPTIONAL EASY RIDE/.test(t)), 'Sunday optional row');
  const order = home.tags.map(t => /TUE/.test(t) ? 'TUE' : /SUN/.test(t) ? 'SUN' : /WEDGE/.test(t) ? 'SAT' : /LIGHT SQUAT/.test(t) ? 'MON' : /PRESS/.test(t) ? 'THU' : /PULL/.test(t) ? 'FRI' : '?');
  ok(JSON.stringify(order) === JSON.stringify(['MON', 'TUE', 'THU', 'FRI', 'SAT', 'SUN']), 'cards in weekday order ' + order);
  ok(/EASY ZWIFT/.test(home.chip), 'Thursday card carries the EASY ZWIFT chip');
  ok(home.strip[1] === '🚴' && home.strip[2] === '·', 'week strip: bike on Tue, rest on Wed');
  ok(/last 107 min/.test(home.satLast), 'Saturday card shows last duration');
  ok(/squats at RPE ≤7/.test(home.ready), 'Monday readiness: hard Zwift tomorrow warning');
  await p.close();

  console.log('Ride days');
  p = await newPage(browser, T.TUE29, seedV());
  let r = await p.evaluate(() => document.getElementById('ready-wrap').textContent);
  ok(/HARD Zwift — ride only/.test(r), 'Tuesday: hard ride message (shown even offline)');
  await p.evaluate(() => toggleRideDone('2026-09-29'));
  r = await p.evaluate(() => document.querySelector('.dc-ride.hard').textContent);
  ok(/✓ done/.test(r), 'DONE tap ticks the ride');
  await p.evaluate(() => { S.rides = [{ date: '2026-09-29', name: 'Zwift Tempo', workout: 'Tempo', tss: 60, if: 0.82 }]; renderHome(); });
  r = await p.evaluate(() => document.querySelector('.dc-ride.hard').textContent);
  ok(/✓ logged · Tempo/.test(r), 'ride in Cycling Rides shows as logged');
  await p.close();
  p = await newPage(browser, T.THU01, seedV());
  r = await p.evaluate(() => document.getElementById('ready-wrap').textContent + ' || ' + document.querySelector('.ride-chip').textContent);
  ok(/EASY Zwift this evening/.test(r) && /TONIGHT/.test(r), 'Thursday: easy ride this evening');
  await p.close();

  console.log('Effort nudge (Thursday)');
  p = await newPage(browser, T.THU01, seedV());
  await p.evaluate(() => { S.day = null; startSession('THU'); });
  const nud = await p.evaluate(() => {
    const i = S.exercises.findIndex(e => e.exId === 'ft_pushdown'); const j = S.exercises.findIndex(e => e.exId === 'ft_fly_mid');
    const ban = k => !!document.querySelector('#excard-' + k + ' .ol-banner.easy');
    const reps = k => suggestedReps(S.exercises[k], S.exercises[k].hasWU ? 1 : 0);
    return { pdBan: ban(i), pdReps: reps(i), flyBan: ban(j), flyReps: reps(j) };
  });
  ok(nud.pdBan && nud.pdReps === 13, 'pushdown (avg RPE 7 vs 9): banner + reps 10→13 (' + nud.pdReps + ')');
  ok(!nud.flyBan && nud.flyReps === 13, 'cable fly (avg 7 vs 8.5): no banner, normal +1 (' + nud.flyReps + ')');
  const rest = await p.evaluate(() => {
    const out = {};
    const logFirst = (exId, kg, reps, rpe) => { const ei = S.exercises.findIndex(e => e.exId === exId); const ex = S.exercises[ei]; const si = ex.sets.findIndex(s => s.kind !== 'wu');
      S.modal = { ei, si }; S.currentKg = kg; S.currentReps = reps; S.currentRpe = rpe; logSet(); return S.restTotal; };
    out.a3 = logFirst('ft_pushdown', 20, 13, 9);
    out.s2 = logFirst(S.exercises[0].exId, 20, 8, 8);
    const core = S.exercises.find(e => e.tier === 'C'); out.c = core ? logFirst(core.exId, 20, 12, 8) : null;
    return out;
  });
  ok(rest.a3 === 75 && rest.s2 === 120 && rest.c === 45, `rest by tier: A3 75 · S2 120 · core 45 (${rest.a3}/${rest.s2}/${rest.c})`);
  ok(p._errs.length === 0, 'no JS errors in the Thursday session ' + p._errs.join(' | '));
  await p.close();

  console.log('Light squat stop (Monday)');
  for (const [layout, expectStop] of [['B', true], ['A', false]]) {
    p = await newPage(browser, T.MON28, seedV(`localStorage.setItem('gym_week_layout','${layout}');`));
    await p.evaluate(() => { S.day = null; startSession('MON'); });
    const st = await p.evaluate(() => {
      const ei = S.exercises.findIndex(e => e.tier === 'S2R'); const ex = S.exercises[ei];
      const work = () => ex.sets.filter(s => s.kind !== 'wu').length; const before = work();
      const si = ex.sets.findIndex(s => s.kind !== 'wu'); S.modal = { ei, si }; S.currentKg = 30; S.currentReps = 4; S.currentRpe = 8; logSet();
      return { before, after: S.exercises[ei].sets.filter(s => s.kind !== 'wu').length, note: S.exercises[ei].note || '', adj: S.adjust.join(' ') };
    });
    if (expectStop) ok(st.after === 1 && /Stopped/.test(st.note) && /Light squat stopped/.test(st.adj), `week B: RPE 8 set ends the light squat (${st.before}→${st.after})`);
    else ok(st.after === st.before, `week A: no stop (hard ride is 2 days away) (${st.before}→${st.after})`);
    await p.close();
  }
  p = await newPage(browser, T.MON28, seedV());
  await p.evaluate(() => { S.day = null; startSession('MON'); });
  const st2 = await p.evaluate(() => { const ei = S.exercises.findIndex(e => e.tier === 'S2R'); const ex = S.exercises[ei]; const si = ex.sets.findIndex(s => s.kind !== 'wu');
    S.modal = { ei, si }; S.currentKg = 30; S.currentReps = 4; S.currentRpe = 6; logSet(); return ex.sets.filter(s => s.kind !== 'wu').length; });
  ok(st2 === 3, 'week B: RPE 6 set does not stop the squat');
  await p.close();

  console.log('Notion payload (Friday)');
  p = await newPage(browser, T.FRI02, seedV());
  await p.evaluate(() => { S.day = null; startSession('FRI'); });
  const pay = await p.evaluate(async () => {
    const t0 = Date.now(); let n = 0;
    for (const exId of ['rot8_wide', 'rot8_row_wide']) { const ei = S.exercises.findIndex(e => e.exId === exId); const ex = S.exercises[ei];
      for (let si = 0; si < 2; si++) { S.modal = { ei, si }; S.currentKg = 50; S.currentReps = 8; S.currentRpe = 8; logSet(); ex.sets[si].at = t0 + (n++) * 150000; } }
    endSession(); const pl = buildNotionPayload(); const tbl = pl.children[1].table;
    return { w: tbl.table_width, hdr: tbl.children[0].table_row.cells.map(c => c[0].text.content), widths: tbl.children.map(r => r.table_row.cells.length),
      row2: tbl.children[2].table_row.cells.map(c => c[0].text.content), notes: pl.properties.Notes.rich_text.map(x => x.text.content).join(''),
      dur: durMap()['2026-10-02|FRI'], hist: (S.history.rot8_wide || []).slice(-1)[0].sets[0].at, e1: [pl.properties['Bench e1RM'].number, pl.properties['SSB e1RM'].number] };
  });
  ok(pay.w === 9 && pay.hdr.join(',') === 'Slot,Exercise,Set,Logged,Total kg,Reps,RPE,Time,Rest' && pay.widths.every(x => x === 9), 'Notion table has Time + Rest columns (9 wide)');
  ok(pay.row2[8] === '2:30', 'rest = time since previous set (' + pay.row2[8] + ')');
  ok(/median rest S2 2:30/.test(pay.notes), 'notes carry median rest by tier');
  ok(pay.dur != null && pay.hist != null, 'duration stored + set times kept in history');
  ok(pay.e1[0] === 87.5 && pay.e1[1] === 132, 'Notion e1RMs to one decimal (' + pay.e1.join(' / ') + ')');
  await p.close();

  console.log("Tomoko's profile");
  p = await newPage(browser, T.MON28, () => { localStorage.clear(); localStorage.setItem('gym_profile', 'T'); localStorage.setItem('gym_week_layout', 'B'); });
  const tom = await p.evaluate(() => ({ simple: SET.simple, strip: [...document.querySelectorAll('.ws-s')].map(e => e.textContent), today: document.getElementById('ready-wrap').textContent,
    tmpl: JSON.stringify(TEMPLATES_T).length }));
  ok(tom.simple, 'her profile opens in simple mode');
  ok(tom.strip[4] === 'z' && tom.strip[5] === '·' && tom.strip[0] === 'z', 'her strip: Zwift Mon + Fri, rest Sat (' + tom.strip.join('') + ')');
  ok(/3時間/.test(tom.today), 'Monday Z2 card carries the 3 h long-ride rule');
  await p.evaluate(() => { S.day = null; startSession('TOMO_A'); });
  const tr = await p.evaluate(() => { const ex = S.exercises[0]; const si = 0; S.modal = { ei: 0, si }; S.currentKg = 8; S.currentReps = 10; S.currentRpe = 7.5; logSet(); return S.restTotal; });
  ok(tr === 90, 'her rest timer keeps the single 90 s preset (' + tr + ')');
  ok(p._errs.length === 0, 'no JS errors in her profile ' + p._errs.join(' | '));
  await p.close();

  await browser.close(); server.close();
  console.log(`\n${pass} passed, ${fail} failed`); if (fail) { console.log('FAILED: ' + fails.join('\n        ')); process.exit(1); }
})().catch(e => { console.error(e); process.exit(1); });
