/* ================= Penny & Lolo bunny tracker ================= */

/* ---------- data ---------- */
const LS_DATA = 'bunny.data', LS_KEY = 'bunny.key';

function blankBunny(name, sex, img, subtitle){
  return { name, sex, img, subtitle,
    weight: [], temp: [], meds: [], appts: [], vax: [], flea: [], notes: [], routines: [] };
}
function defaultDB(){
  return {
    version: 1, updatedAt: 0,
    bunnies: {
      penny: blankBunny('Penny', 'f', 'images/penny.webp', 'resident queen ♀'),
      lolo:  blankBunny('Lolo',  'm', 'images/lolo.webp',  'aka “Loretto” when he’s in trouble ♂'),
    },
    snoozes: {},
  };
}
let DB = defaultDB();

function loadLocal(){
  try {
    const raw = localStorage.getItem(LS_DATA);
    if (raw) DB = migrate(JSON.parse(raw));
  } catch (e) { /* fresh start */ }
}
function migrate(d){
  for (const id of ['penny','lolo']) {
    d.bunnies[id] = Object.assign(blankBunny('', '', '', ''), DB.bunnies[id], d.bunnies[id]);
    for (const k of ['weight','temp','meds','appts','vax','flea','notes','routines'])
      if (!Array.isArray(d.bunnies[id][k])) d.bunnies[id][k] = [];
    d.bunnies[id].img = DB.bunnies[id].img;   // photos are app assets, never stored data
    d.bunnies[id].name = d.bunnies[id].name || DB.bunnies[id].name;
  }
  d.snoozes = d.snoozes || {};
  return d;
}
function save(){
  DB.updatedAt = Date.now();
  try { localStorage.setItem(LS_DATA, JSON.stringify(DB)); } catch (e) {}
  schedulePush();
}
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

/* ---------- sync (Cloudflare KV via Pages Function) ---------- */
let pushTimer = null, syncState = '';
const LS_SYNCED = 'bunny.synced';
function familyKey(){ return localStorage.getItem(LS_KEY) || ''; }
// One-time guard for a device that has never synced: add anything local that
// the cloud copy lacks, so a fresh phone can never wipe the cloud data.
function unionInto(base, extra){
  base.bunnies = base.bunnies || {};
  for (const id of ['penny', 'lolo']) {
    const bb = base.bunnies[id] = base.bunnies[id] || {}, eb = (extra.bunnies || {})[id] || {};
    for (const k of ['weight','temp','meds','appts','vax','flea','notes','routines']) {
      const arr = bb[k] = Array.isArray(bb[k]) ? bb[k] : [];
      const have = new Set(arr.map(x => x.id));
      for (const x of (eb[k] || [])) if (!have.has(x.id)) arr.push(x);
    }
  }
  base.snoozes = base.snoozes || {};
  for (const k in (extra.snoozes || {})) if (!(base.snoozes[k] >= extra.snoozes[k])) base.snoozes[k] = extra.snoozes[k];
  return base;
}
function schedulePush(){
  if (!SYNC.enabled || !familyKey()) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(pushRemote, 1500);
}
async function pushRemote(){
  try {
    const r = await fetch(SYNC.endpoint, { method: 'PUT', keepalive: true,
      headers: { 'x-bunny-key': familyKey(), 'content-type': 'application/json' },
      body: JSON.stringify(DB) });
    if (r.status === 401) { localStorage.removeItem(LS_KEY); askKey(); return; }
    if (r.ok) localStorage.setItem(LS_SYNCED, '1');
    setSyncNote(r.ok ? 'synced ☁️' : 'sync hiccup, saved on this phone');
  } catch (e) { setSyncNote('offline, saved on this phone'); }
}
async function pullRemote(){
  if (!SYNC.enabled) { setSyncNote('saved on this phone'); return; }
  if (!familyKey()) { askKey(); return; }
  try {
    const r = await fetch(SYNC.endpoint, { headers: { 'x-bunny-key': familyKey() } });
    if (r.status === 401) { localStorage.removeItem(LS_KEY); askKey(); return; }
    const remote = await r.json();
    if (remote && !localStorage.getItem(LS_SYNCED)) { DB = migrate(unionInto(remote, DB)); save(); renderAll(); }
    if (remote && remote.updatedAt > (DB.updatedAt || 0)) {
      DB = migrate(remote);
      try { localStorage.setItem(LS_DATA, JSON.stringify(DB)); } catch (e) {}
      renderAll();
    } else if (remote === null || (DB.updatedAt || 0) > (remote.updatedAt || 0)) {
      pushRemote();
    }
    setSyncNote('synced ☁️');
    localStorage.setItem(LS_SYNCED, '1');
  } catch (e) { setSyncNote('offline, saved on this phone'); }
}
function setSyncNote(t){ const el = document.getElementById('sync-note'); if (el) el.textContent = t; }

/* ---------- dates ---------- */
const DAY = 86400000;
const todayStr = () => new Date().toLocaleDateString('sv');           // YYYY-MM-DD local
const parseD = s => new Date(s + 'T12:00:00');
const fmtShort = s => parseD(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
const fmtLong  = s => parseD(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const daysUntil = s => Math.round((parseD(s) - parseD(todayStr())) / DAY);
const addDays = (s, n) => new Date(parseD(s).getTime() + n * DAY).toLocaleDateString('sv');
function rel(n){
  if (n === 0) return 'today';
  if (n === 1) return 'tomorrow';
  if (n > 1)  return 'in ' + n + ' days';
  return Math.abs(n) + (n === -1 ? ' day' : ' days') + ' overdue';
}
function addInterval(s, every, unit){
  if (unit === 'months') { const d = parseD(s); d.setMonth(d.getMonth() + (+every)); return d.toLocaleDateString('sv'); }
  return addDays(s, every * (unit === 'weeks' ? 7 : 1));
}
const unitLabel = (every, unit) => 'every ' + (+every === 1 ? unit.slice(0, -1) : every + ' ' + unit);
const KINDS = { flea: ['💧','Flea'], vax: ['💉','Vaccine'], meds: ['💊','Med'], other: ['✨','Other'] };

/* ---------- greetings ---------- */
const QUIPS = [
  'Two ears up. It’s a good day.',
  'Approved by the Department of Binkies.',
  'Lolo denies everything.',
  'Penny has reviewed your schedule. It says: snacks.',
  'Powered by hay and mild chaos.',
  'The buns are in charge. You just log things.',
  'Somewhere, a cardboard box is being destroyed.',
  'Cilantro inventory: critically low (according to Lolo).',
  'Official record keeper of the fluff council.',
  'Nose boops are a valid form of currency here.',
  'Warning: contents extremely soft.',
  'Hay there, gorgeous.',
  'Today’s forecast: 100% chance of zoomies.',
  'Loretto. Full name. He knows what he did.',
  'Ear inspection passed. Carry on.',
  'The flop means she trusts you. Or she’s dramatic. Both.',
];

/* ---------- upcoming reminders ---------- */
function upcomingFor(id){
  const b = DB.bunnies[id], items = [];
  for (const r of b.routines) if (r.nextDue) items.push({
    key: 'rt:' + id + ':' + r.id, bunny: id, icon: KINDS[r.kind] ? KINDS[r.kind][0] : '✨', kind: 'rt', id: r.id,
    title: b.name + ' · ' + esc(r.name), sub: unitLabel(r.every, r.unit), due: r.nextDue });
  for (const a of b.appts) if (!a.done && daysUntil(a.date) >= -30) items.push({
    key: 'appt:' + id + ':' + a.id, bunny: id, icon: '🩺', kind: 'appt', id: a.id,
    title: b.name + ' · ' + esc(a.title), sub: esc([a.time, a.place].filter(Boolean).join(' · ')), due: a.date });
  return items;
}
function allUpcoming(){
  const t = todayStr();
  return ['penny', 'lolo'].flatMap(upcomingFor)
    .filter(i => !(DB.snoozes[i.key] && DB.snoozes[i.key] > t && daysUntil(i.due) >= 0))
    .sort((a, b) => a.due < b.due ? -1 : 1);
}
const dueClass = n => n < 0 ? 'late' : n <= 10 ? 'soon' : 'ok';

function markDone(key){
  const [kind, id, entryId] = key.split(':');
  const b = DB.bunnies[id];
  if (kind === 'rt') {
    const r = b.routines.find(x => x.id === entryId);
    if (!r) return;
    const t = todayStr();
    if (r.lastDone === t) { toast('Already logged today 💕'); return; }
    r.lastDone = t;
    if (r.kind === 'flea')      b.flea.push({ id: uid(), date: t, product: r.name, note: '' });
    else if (r.kind === 'vax')  b.vax.push({ id: uid(), date: t, name: r.name, note: '' });
    else                        b.notes.push({ id: uid(), date: t, title: (KINDS[r.kind] ? KINDS[r.kind][0] + ' ' : '') + r.name + ' ✓', note: '' });
    r.nextDue = addInterval(t, r.every, r.unit);
    toast('Logged ✓ next due ' + fmtShort(r.nextDue));
  } else if (kind === 'appt') {
    const a = b.appts.find(x => x.id === entryId);
    if (a) a.done = true;
    toast('Appointment done ✓');
  }
  save(); renderAll();
}
function snoozeItem(key){
  DB.snoozes[key] = addDays(todayStr(), 3);
  save(); renderAll(); toast('Snoozed 3 days 💤');
}

/* ---------- home ---------- */
function renderHome(){
  const h = new Date().getHours();
  document.getElementById('greeting').innerHTML =
    (h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening') + ' <span class="heart">♥</span>';
  document.getElementById('today-line').textContent =
    new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  document.getElementById('quip').textContent = '“' + QUIPS[Math.floor(Math.random() * QUIPS.length)] + '”';

  document.getElementById('bunny-pick').innerHTML = ['penny', 'lolo'].map(id => {
    const b = DB.bunnies[id];
    const w = latest(b.weight);
    const ups = upcomingFor(id).map(i => daysUntil(i.due));
    let chip = '<span class="chip ok">✓ All caught up</span>';
    if (ups.some(n => n < 0)) chip = '<span class="chip late">❗ Something’s overdue</span>';
    else if (ups.some(n => n <= 10)) chip = '<span class="chip soon">⏰ Due soon</span>';
    return `<button class="bunny-card ${id}" onclick="openProfile('${id}')" aria-label="Open ${b.name}’s profile">
      <img class="photo" src="${b.img}" alt="${b.name}">
      <h2>${b.name}</h2>
      <p class="sub">${w ? w.value.toFixed(1) + ' lb' : 'no weigh-ins yet'}</p>
      ${chip}</button>`;
  }).join('');

  const ups = allUpcoming();
  document.getElementById('upcoming').innerHTML = ups.length ? ups.map(i => {
    const n = daysUntil(i.due), cls = dueClass(n);
    const actionable = n <= 7;   // buttons only when due within a week or overdue
    return `<div class="up-card">
      <div class="up-main">
        <div class="up-icon ${i.bunny}">${i.icon}</div>
        <div class="up-body"><strong>${i.title}</strong><span>${i.sub || ''}</span></div>
        <div class="up-when"><span class="num ${cls === 'ok' ? '' : cls}">${fmtShort(i.due)}</span><small>${rel(n)}</small></div>
      </div>
      ${actionable ? `<div class="up-actions">
        <button class="btn-done" onclick="markDone('${i.key}')">✓ Done</button>
        ${n >= 0 ? `<button class="btn-snooze" onclick="snoozeItem('${i.key}')">Later 💤</button>` : ''}
      </div>` : ''}</div>`;
  }).join('') : '<div class="empty">Nothing on the calendar. Enjoy the zoomies 🐇</div>';
}

/* ---------- profile ---------- */
const TABS = ['Overview', 'Meds', 'Weight', 'Temp', 'Appts', 'Vaccines', 'Flea', 'Notes'];
let currentBunny = 'penny', currentTab = 'Overview';
const latest = arr => arr.length ? arr.slice().sort(byDateDesc)[0] : null;

function openProfile(id){
  currentBunny = id; currentTab = 'Overview';
  const sc = document.getElementById('screen-profile');
  sc.dataset.bunny = id;
  document.getElementById('screen-home').hidden = true;
  sc.hidden = false;
  document.getElementById('fab').hidden = false;
  renderProfile();
  window.scrollTo(0, 0);
}
function goHome(){
  document.getElementById('screen-profile').hidden = true;
  document.getElementById('screen-home').hidden = false;
  document.getElementById('fab').hidden = true;
  renderHome();
  window.scrollTo(0, 0);
}
function renderProfile(){
  const b = DB.bunnies[currentBunny];
  const ph = document.getElementById('prof-photo-el');
  ph.src = b.img; ph.className = 'prof-photo ' + currentBunny; ph.alt = b.name;
  document.getElementById('prof-name').textContent = b.name;
  document.getElementById('prof-sub').textContent = b.subtitle || 'add a little bio';
  renderTiles(); renderTabs(); renderTab();
}
function renderTiles(){
  const b = DB.bunnies[currentBunny];
  const w = latest(b.weight), t = latest(b.temp);
  let wD = ['flat', 'no weigh-ins yet'];
  if (w) {
    const month = b.weight.filter(e => e.date <= addDays(w.date, -21)).sort((a, c) => a.date < c.date ? 1 : -1)[0];
    if (month) {
      const diff = +(w.value - month.value).toFixed(1);
      wD = diff > 0 ? ['up', '▲ ' + diff.toFixed(1) + ' lb/month'] : diff < 0 ? ['warn', '▼ ' + Math.abs(diff).toFixed(1) + ' lb/month'] : ['flat', 'steady'];
    } else wD = ['flat', 'logged ' + fmtShort(w.date)];
  }
  let tD = ['flat', 'no readings yet'];
  if (t) tD = (t.value >= 101 && t.value <= 103) ? ['flat', 'in healthy range'] : ['warn', 'outside 101–103 °F'];
  const ups = upcomingFor(currentBunny).sort((a, c) => a.due < c.due ? -1 : 1)[0];
  let due = ['Nothing due', ['flat', 'all caught up 💕']];
  if (ups) {
    const n = daysUntil(ups.due);
    due = [ups.icon + ' ' + fmtShort(ups.due), [dueClass(n) === 'ok' ? 'flat' : dueClass(n), rel(n)]];
  }
  document.getElementById('tiles').innerHTML = `
    <div class="tile"><span class="eyebrow">Weight</span><span class="big num">${w ? w.value.toFixed(1) + ' <small>lb</small>' : '–'}</span><div class="delta ${wD[0]}">${wD[1]}</div></div>
    <div class="tile"><span class="eyebrow">Last temp</span><span class="big num">${t ? t.value.toFixed(1) + ' <small>°F</small>' : '–'}</span><div class="delta ${tD[0]}">${tD[1]}</div></div>
    <div class="tile"><span class="eyebrow">Next due</span><span class="big" style="font-size:1rem;line-height:1.25">${due[0]}</span><div class="delta ${due[1][0]}">${due[1][1]}</div></div>`;
}
function renderTabs(){
  document.getElementById('tabbar').innerHTML = TABS.map(t =>
    `<button class="pill" role="tab" aria-selected="${t === currentTab}" onclick="switchTab('${t}')">${t}</button>`).join('');
}
function switchTab(t){ currentTab = t; renderTabs(); renderTab(); }

/* ---------- entry rendering ---------- */
const esc = s => String(s || '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
function entryCard(e, kind){
  const del = `<button class="del" onclick="delEntry(this,'${kind}','${e.id}')" aria-label="Remove entry">✕</button>`;
  const edit = `<button class="edit" onclick="editEntry('${kind}','${e.id}')" aria-label="Edit entry">✎</button>`;
  const badge = e.badge ? `<span class="chip ${e.badge[0]} badge">${e.badge[1]}</span>` : '';
  const extra = e.extra || '';
  return `<div class="entry ${e.cls || ''}">${edit}${del}
    <div class="row"><strong>${e.title}</strong><span class="when num">${e.when}</span></div>
    ${e.note ? `<p class="note">${esc(e.note)}</p>` : ''}${badge}${extra}</div>`;
}
function listOrEmpty(html, emptyMsg, act, hint){
  if (html) return `<div class="entry-list">${html}</div>`;
  if (!act) return `<div class="empty">${emptyMsg}</div>`;
  return `<button class="empty tappable" onclick="${act}">${emptyMsg}<br><span class="tap-hint">${hint || 'tap here to add one ♥'}</span></button>`;
}
function openSheetType(t){ sheetType = t; openSheet(); }
const byDateDesc = (a, b) => a.date === b.date ? (a.id < b.id ? 1 : -1) : (a.date < b.date ? 1 : -1);   // same day: later-added first

function delEntry(btn, kind, id2){
  if (!btn.classList.contains('arm')) {
    btn.classList.add('arm'); btn.textContent = 'remove?';
    setTimeout(() => { btn.classList.remove('arm'); btn.textContent = '✕'; }, 2600);
    return;
  }
  const b = DB.bunnies[currentBunny];
  b[kind] = b[kind].filter(e => e.id !== id2);
  save(); renderProfile(); toast('Removed');
}
function stopMed(id2){
  const m = DB.bunnies[currentBunny].meds.find(x => x.id === id2);
  if (m) { m.active = false; save(); renderTab(); toast('Moved to past meds'); }
}

function renderTab(){
  const b = DB.bunnies[currentBunny], el = document.getElementById('tab-body'), T = currentTab, n = b.name;
  if (T === 'Overview') {
    const hint = b.routines.length ? '' :
      `<button class="empty" style="width:100%;cursor:pointer;margin-bottom:12px" onclick="openPlan()">🗓️ Set up ${n}’s care plan<br><span style="font-size:.8rem">flea, vaccine, and med schedules live there. You pick the rhythm, the app remembers.</span></button>`;
    const acts = [];
    for (const e of b.weight) acts.push({ date: e.date, title: 'Weighed ' + e.value.toFixed(1) + ' lb', note: e.note, kind: 'weight', id: e.id });
    for (const e of b.temp)   acts.push({ date: e.date, title: 'Temp ' + e.value.toFixed(1) + ' °F', note: e.note, kind: 'temp', id: e.id });
    for (const e of b.flea)   acts.push({ date: e.date, title: '💧 Flea treatment' + (e.product ? ' · ' + esc(e.product) : ''), note: e.note, kind: 'flea', id: e.id });
    for (const e of b.vax)    acts.push({ date: e.date, title: '💉 ' + esc(e.name), note: e.note, kind: 'vax', id: e.id });
    for (const e of b.meds)   acts.push({ date: e.date, title: '💊 Started ' + esc(e.name), note: e.note, kind: 'meds', id: e.id });
    for (const e of b.appts)  acts.push({ date: e.date, title: '🩺 ' + esc(e.title), note: e.note, kind: 'appts', id: e.id });
    for (const e of b.notes)  acts.push({ date: e.date, title: '📔 ' + esc(e.title), note: e.note, kind: 'notes', id: e.id });
    acts.sort(byDateDesc);
    el.innerHTML = hint + `<div class="section-title"><h3>Recent activity 🐾</h3></div>` +
      listOrEmpty(acts.slice(0, 8).map(a => entryCard({ id: a.id, title: a.title, when: fmtShort(a.date), note: a.note }, a.kind)).join(''),
        `Nothing logged yet. Start ${n}’s story 🌸`, 'openSheet()', 'tap here to add the first entry ♥');
  }
  else if (T === 'Meds') {
    const act = b.meds.filter(m => m.active !== false).sort(byDateDesc)
      .map(m => entryCard({ id: m.id, title: esc(m.name), when: fmtShort(m.date), note: [m.freq, m.note].filter(Boolean).join(' · '),
        cls: 'active-med', extra: `<br><button class="stop-med" onclick="stopMed('${m.id}')">finished this med</button>` }, 'meds')).join('');
    const past = b.meds.filter(m => m.active === false).sort(byDateDesc)
      .map(m => entryCard({ id: m.id, title: esc(m.name), when: fmtShort(m.date), note: [m.freq, m.note].filter(Boolean).join(' · '), badge: ['ok', 'Finished'] }, 'meds')).join('');
    el.innerHTML = listOrEmpty(act, `No active medications. ${n} is happy and healthy! 🌸`, "openSheetType('meds')") +
      (past ? `<div class="section-title" style="margin-top:18px"><h3>Past meds</h3></div><div class="entry-list">${past}</div>` : '');
  }
  else if (T === 'Weight' || T === 'Temp') {
    const kind = T.toLowerCase(), arr = b[kind].slice().sort((a, c) => a.date < c.date ? -1 : 1);
    const chart = arr.length >= 2 ? chartCard(kind, arr) : '';
    const rev = arr.slice().reverse();
    const cards = rev.map((e, i) => {
      let note = e.note || '';
      if (kind === 'weight' && rev[i + 1]) {
        const diff = +(e.value - rev[i + 1].value).toFixed(1);
        const d = diff > 0 ? `▲ up ${diff.toFixed(1)} lb since ${fmtShort(rev[i+1].date)}` : diff < 0 ? `▼ down ${Math.abs(diff).toFixed(1)} lb since ${fmtShort(rev[i+1].date)}` : `steady since ${fmtShort(rev[i+1].date)}`;
        note = note ? note + ' · ' + d : d;
      }
      if (kind === 'temp' && (e.value < 101 || e.value > 103)) note = (note ? note + ' · ' : '') + '⚠️ outside the usual 101–103 °F';
      return entryCard({ id: e.id, title: e.value.toFixed(1) + (kind === 'weight' ? ' lb' : ' °F'), when: fmtShort(e.date), note }, kind);
    }).join('');
    el.innerHTML = chart + listOrEmpty(cards, kind === 'weight' ? `No weigh-ins yet. A kitchen scale and a cooperative bunny is all it takes ⚖️` : 'No temperature logs yet 🌡️', `openSheetType('${kind}')`);
    if (arr.length >= 2) wireChart(kind, arr);
  }
  else if (T === 'Appts') {
    const up = b.appts.filter(a => !a.done).sort((a, c) => a.date < c.date ? -1 : 1)
      .map(a => entryCard({ id: a.id, title: esc(a.title), when: fmtShort(a.date), note: [a.time, a.place, a.note].filter(Boolean).join(' · '), badge: ['soon', 'Upcoming'] }, 'appts')).join('');
    const done = b.appts.filter(a => a.done).sort(byDateDesc)
      .map(a => entryCard({ id: a.id, title: esc(a.title), when: fmtShort(a.date), note: [a.place, a.note].filter(Boolean).join(' · '), badge: ['ok', 'Done'] }, 'appts')).join('');
    el.innerHTML = listOrEmpty(up + done, 'No appointments on the books 🩺', "openSheetType('appts')");
  }
  else if (T === 'Vaccines') {
    el.innerHTML = listOrEmpty(b.vax.slice().sort(byDateDesc).map(v => {
      let badge = ['ok', 'Done'];
      if (v.nextDue) { const d = daysUntil(v.nextDue); badge = d < 0 ? ['late', 'Overdue since ' + fmtShort(v.nextDue)] : [d <= 30 ? 'soon' : 'ok', 'Next due ' + fmtLong(v.nextDue)]; }
      return entryCard({ id: v.id, title: esc(v.name), when: fmtShort(v.date), note: v.note, badge }, 'vax');
    }).join(''), 'No vaccine records yet. RHDV2 is the big one for house rabbits 💉', "openSheetType('vax')");
  }
  else if (T === 'Flea') {
    const rts = b.routines.filter(r => r.kind === 'flea' && r.nextDue);
    const head = rts.length ? `<div class="empty" style="border-style:solid;margin-bottom:12px">${rts.map(r =>
      `<strong>${esc(r.name)}</strong> · ${unitLabel(r.every, r.unit)} · next <strong>${fmtShort(r.nextDue)}</strong>`).join('<br>')}</div>` : '';
    el.innerHTML = head + listOrEmpty(b.flea.slice().sort(byDateDesc).map(f =>
      entryCard({ id: f.id, title: esc(f.product || 'Flea treatment'), when: fmtShort(f.date), note: f.note }, 'flea')).join(''),
      'No flea treatments logged yet. Add the schedule in the care plan 🗓️', 'openPlan()', 'tap here to open the care plan ♥');
  }
  else if (T === 'Notes') {
    el.innerHTML = listOrEmpty(b.notes.slice().sort(byDateDesc).map(x =>
      entryCard({ id: x.id, title: esc(x.title), when: fmtShort(x.date), note: x.note }, 'notes')).join(''),
      'No notes yet. Jot down a cute moment 📔', "openSheetType('notes')");
  }
}

/* ---------- charts ---------- */
function chartCard(kind, arr){
  const isW = kind === 'weight';
  const data = arr.slice(-12).map(e => [fmtShort(e.date), e.value]);
  return `<div class="chart-card"><div class="section-title"><h3>${isW ? 'Weight over time' : 'Temperature over time'}</h3></div>
    <p class="sub">${isW ? 'pounds · last ' + data.length + ' weigh-ins' : '°F · shaded band = healthy 101–103'}</p>
    ${chartSVG(kind, data)}<div class="tip" id="tip-${kind}"></div></div>`;
}
function chartSVG(kind, data){
  const W = 360, H = 170, padL = 36, padR = 14, padT = 16, padB = 26;
  const vals = data.map(d => d[1]), isW = kind === 'weight';
  let lo = Math.min(...vals), hi = Math.max(...vals);
  if (!isW) { lo = Math.min(lo, 100.5); hi = Math.max(hi, 103.5); }
  else { const m = (hi - lo) * .5 || .3; lo -= m; hi += m; }
  const X = i => padL + (W - padL - padR) * (data.length === 1 ? .5 : i / (data.length - 1));
  const Y = v => padT + (H - padT - padB) * (1 - (v - lo) / (hi - lo));
  const pts = data.map((d, i) => [X(i), Y(d[1])]);
  const path = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
  const area = path + ` L${pts.at(-1)[0].toFixed(1)} ${H - padB} L${pts[0][0].toFixed(1)} ${H - padB} Z`;
  let grid = '';
  for (let i = 0; i <= 3; i++) {
    const v = lo + (hi - lo) * i / 3, y = Y(v);
    grid += `<line x1="${padL}" x2="${W - padR}" y1="${y}" y2="${y}" stroke="var(--line)" stroke-width="1"/>` +
            `<text x="${padL - 6}" y="${y + 3}" text-anchor="end" font-size="9" fill="var(--muted)">${isW ? v.toFixed(1) : v.toFixed(0)}</text>`;
  }
  const band = !isW ? `<rect x="${padL}" y="${Y(103)}" width="${W - padL - padR}" height="${Y(101) - Y(103)}" fill="var(--good-tint)" opacity=".7"/>` : '';
  const dots = pts.map((p, i) => `<circle cx="${p[0]}" cy="${p[1]}" r="${i === data.length - 1 ? 5 : 3.5}" fill="${i === data.length - 1 ? 'var(--accent)' : 'var(--card)'}" stroke="var(--accent)" stroke-width="2"/>`).join('');
  const endLabel = `<text x="${Math.min(pts.at(-1)[0], W - padR - 2)}" y="${Math.max(pts.at(-1)[1] - 10, 10)}" text-anchor="end" font-size="10" font-weight="800" fill="var(--ink)">${vals.at(-1)}${isW ? ' lb' : '°'}</text>`;
  const xlab = [0, data.length - 1].map(i => `<text x="${X(i)}" y="${H - 8}" text-anchor="${i ? 'end' : 'start'}" font-size="9" fill="var(--muted)">${data[i][0]}</text>`).join('');
  return `<svg viewBox="0 0 ${W} ${H}" id="svg-${kind}" role="img" aria-label="${kind} chart">
    <defs><linearGradient id="g-${kind}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="var(--accent)" stop-opacity=".28"/><stop offset="1" stop-color="var(--accent)" stop-opacity="0"/>
    </linearGradient></defs>
    ${band}${grid}<path d="${area}" fill="url(#g-${kind})"/>
    <path d="${path}" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
    ${dots}${endLabel}${xlab}</svg>`;
}
function wireChart(kind, arr){
  const svg = document.getElementById('svg-' + kind); if (!svg) return;
  const data = arr.slice(-12).map(e => [fmtShort(e.date), e.value]);
  const tip = document.getElementById('tip-' + kind);
  const move = ev => {
    const r = svg.getBoundingClientRect();
    const x = (ev.touches ? ev.touches[0].clientX : ev.clientX) - r.left;
    const frac = Math.max(0, Math.min(1, (x / r.width * 360 - 36) / (360 - 50)));
    const i = Math.round(frac * (data.length - 1));
    const card = svg.closest('.chart-card').getBoundingClientRect();
    const cx = (36 + (360 - 50) * (data.length === 1 ? .5 : i / (data.length - 1))) / 360 * r.width + (r.left - card.left);
    tip.style.left = cx + 'px';
    tip.style.top = (r.top - card.top + 30) + 'px';
    tip.innerHTML = `${data[i][1]}${kind === 'weight' ? ' lb' : ' °F'}<small>${data[i][0]}</small>`;
    tip.style.opacity = 1;
  };
  svg.addEventListener('pointermove', move);
  svg.addEventListener('pointerdown', move);
  svg.addEventListener('pointerleave', () => tip.style.opacity = 0);
}

/* ---------- add sheet ---------- */
const SHEET_TYPES = [['weight','⚖️ Weight'],['temp','🌡️ Temp'],['meds','💊 Med'],['appts','🩺 Appt'],['vax','💉 Vaccine'],['flea','💧 Flea'],['notes','📔 Note']];
let sheetType = 'weight', sheetMode = 'add', editingId = null;

function openSheet(){
  sheetMode = 'add'; editingId = null;
  const b = DB.bunnies[currentBunny];
  document.getElementById('sheet-title').textContent = 'New entry ✨';
  document.getElementById('sheet-for').innerHTML = 'for <strong>' + b.name + '</strong>';
  document.getElementById('type-chips').hidden = false;
  renderChips(); renderForm();
  showSheet();
}
function editEntry(kind, id){
  const b = DB.bunnies[currentBunny];
  const e = b[kind].find(x => x.id === id);
  if (!e) return;
  sheetMode = 'edit'; editingId = id; sheetType = kind;
  document.getElementById('sheet-title').textContent = 'Edit entry ✎';
  document.getElementById('sheet-for').innerHTML = 'for <strong>' + b.name + '</strong>';
  document.getElementById('type-chips').hidden = true;
  renderForm(e);
  showSheet();
}
function showSheet(){
  document.getElementById('scrim').classList.add('show');
  document.getElementById('sheet').classList.add('show');
}
function closeSheet(){
  document.getElementById('scrim').classList.remove('show');
  document.getElementById('sheet').classList.remove('show');
}
function renderChips(){
  document.getElementById('type-chips').innerHTML = SHEET_TYPES.map(([k, label]) =>
    `<button type="button" class="tchip" aria-pressed="${k === sheetType}" onclick="sheetType='${k}';renderChips();renderForm()">${label}</button>`).join('');
}
const F = {
  date: v => `<div class="field"><label>When</label><input name="date" type="date" required value="${v || todayStr()}"></div>`,
  txt: (name, label, ph, req, v) => `<div class="field"><label>${label}</label><input name="${name}" placeholder="${ph}" ${req ? 'required' : ''} value="${esc(v || '')}"></div>`,
  numf: (name, label, ph, v) => `<div class="field"><label>${label}</label><input name="${name}" type="number" step="any" inputmode="decimal" placeholder="${ph}" required value="${v ?? ''}"></div>`,
  time: v => `<div class="field"><label>Time</label><input name="time" type="time" value="${v || ''}"></div>`,
  note: v => `<div class="field"><label>Note (optional)</label><textarea name="note" rows="2" placeholder="anything worth remembering…">${esc(v || '')}</textarea></div>`,
};
function renderForm(pre = {}){
  const map = {
    weight: `<div class="field-row">${F.date(pre.date)}${F.numf('value', 'Weight (lb)', '7.2', pre.value)}</div>${F.note(pre.note)}`,
    temp:   `<div class="field-row">${F.date(pre.date)}${F.numf('value', 'Temp (°F)', '101.8', pre.value)}</div>${F.note(pre.note)}`,
    meds:   `${F.txt('name', 'Medication', 'Metacam 0.3 ml', 1, pre.name)}<div class="field-row">${F.date(pre.date)}${F.txt('freq', 'How often', 'once daily', 0, pre.freq)}</div>${F.note(pre.note)}`,
    appts:  `${F.txt('title', 'What for', 'annual checkup', 1, pre.title)}<div class="field-row">${F.date(pre.date)}${F.time(pre.time)}</div>${F.txt('place', 'Where', 'vet clinic', 0, pre.place)}${F.note(pre.note)}`,
    vax:    `${F.txt('name', 'Vaccine', 'RHDV2 booster', 1, pre.name)}${F.date(pre.date)}${F.note(pre.note)}`,
    flea:   `${F.txt('product', 'Product', 'Revolution', 0, pre.product)}${F.date(pre.date)}${F.note(pre.note)}`,
    notes:  `${F.txt('title', 'Title', 'binkied twice today 🥰', 1, pre.title)}${F.date(pre.date)}${F.note(pre.note)}`,
  };
  const form = document.getElementById('sheet-form');
  form.innerHTML = map[sheetType] + `<button class="save-btn" type="submit">${sheetMode === 'edit' ? 'Update ♥' : 'Save with love ♥'}</button>`;
  form.onsubmit = saveEntry;
}
function saveEntry(ev){
  ev.preventDefault();
  const fd = new FormData(ev.target), vals = {};
  for (const [k, v] of fd.entries()) vals[k] = typeof v === 'string' ? v.trim() : v;
  if (sheetType === 'weight' || sheetType === 'temp') vals.value = parseFloat(vals.value);
  const b = DB.bunnies[currentBunny];

  if (sheetMode === 'edit' && editingId) {           // adjust in place, history intact
    const e = b[sheetType].find(x => x.id === editingId);
    if (e) Object.assign(e, vals);
    save(); closeSheet(); toast('Updated ✓'); renderProfile();
    return;
  }

  const e = Object.assign({ id: uid() }, vals);
  if (sheetType === 'meds') e.active = true;
  b[sheetType].push(e);
  let rolled = '';
  if (sheetType === 'flea' || sheetType === 'vax') {
    const nm = (e.product || e.name || '').toLowerCase();
    for (const r of b.routines) if (r.kind === sheetType) {
      const rn = (r.name || '').toLowerCase();
      if (!nm || !rn || nm.includes(rn) || rn.includes(nm)) {
        // only roll forward: a backfilled old dose must not rewind the schedule
        const cand = addInterval(e.date, r.every, r.unit);
        const ok = r.lastDone ? e.date >= r.lastDone : (cand >= (r.nextDue || '') || e.date >= todayStr());
        if (ok) { r.nextDue = cand; r.lastDone = e.date; rolled = ' · next due ' + fmtShort(r.nextDue); }
      }
    }
  }
  save(); closeSheet(); toast('Saved! 🐰💕' + rolled);
  renderProfile();
}

/* ---------- care plan (per-bunny schedules) ---------- */
function openPlan(){
  sheetMode = 'plan';
  const b = DB.bunnies[currentBunny];
  document.getElementById('sheet-title').textContent = b.name + '’s care plan 🗓️';
  document.getElementById('sheet-for').textContent = 'recurring care, on your schedule';
  document.getElementById('type-chips').hidden = true;
  renderPlanList();
  showSheet();
}
function renderPlanList(){
  const b = DB.bunnies[currentBunny];
  const rows = b.routines.map(r => `<div class="entry">
      <button class="del" onclick="delRoutine(this,'${r.id}')" aria-label="Remove schedule">✕</button>
      <div class="row"><strong>${KINDS[r.kind] ? KINDS[r.kind][0] : '✨'} ${esc(r.name)}</strong><span class="when num">${r.nextDue ? fmtShort(r.nextDue) : ''}</span></div>
      <p class="note">${unitLabel(r.every, r.unit)}${r.nextDue ? ' · next ' + fmtLong(r.nextDue) : ''}</p>
      <button class="stop-med" onclick="editRoutine('${r.id}')">✎ edit</button>
    </div>`).join('');
  const form = document.getElementById('sheet-form');
  form.innerHTML = (rows
    ? `<div class="entry-list" style="margin-bottom:14px">${rows}</div>`
    : `<div class="empty" style="margin-bottom:14px">Nothing scheduled yet. Add the flea and vaccine rhythm below, and reminders appear on the home screen 🌸</div>`)
    + `<button class="save-btn" type="button" onclick="editRoutine('')">+ Add a schedule</button>`
    + `<button class="secondary-btn" type="button" onclick="exportBunny()">📤 Save ${esc(b.name)}’s data as a file</button>`
    + `<button class="reset-link" type="button" onclick="resetBunny(this)">start fresh (erase ${b.sex === 'm' ? 'his' : 'her'} data)</button>`;
  form.onsubmit = ev => ev.preventDefault();
}
function editRoutine(id){
  const b = DB.bunnies[currentBunny];
  const r = b.routines.find(x => x.id === id) || { name: '', kind: 'flea', every: 1, unit: 'months', nextDue: todayStr() };
  const kindChips = Object.entries(KINDS).map(([k, [ic, label]]) =>
    `<button type="button" class="tchip" aria-pressed="${k === r.kind}" data-kind="${k}"
      onclick="this.parentNode.querySelectorAll('.tchip').forEach(c=>c.setAttribute('aria-pressed','false'));this.setAttribute('aria-pressed','true')">${ic} ${label}</button>`).join('');
  const form = document.getElementById('sheet-form');
  form.innerHTML = `
    <div class="type-chips" id="plan-kind">${kindChips}</div>
    <div class="field"><label>What</label><input name="name" required placeholder="Revolution flea dose" value="${esc(r.name)}"></div>
    <div class="field-row">
      <div class="field"><label>Repeat every</label><input name="every" type="number" min="1" max="36" inputmode="numeric" required value="${r.every}"></div>
      <div class="field"><label>Unit</label><select name="unit">${['days','weeks','months'].map(u => `<option ${u === r.unit ? 'selected' : ''}>${u}</option>`).join('')}</select></div>
    </div>
    <div class="field"><label>Next due</label><input name="nextDue" type="date" required value="${r.nextDue || todayStr()}"></div>
    <button class="save-btn" type="submit">Save schedule ♥</button>`;
  form.onsubmit = ev => {
    ev.preventDefault();
    const fd = new FormData(ev.target);
    const kindBtn = document.querySelector('#plan-kind .tchip[aria-pressed="true"]');
    const data = { name: fd.get('name').trim(), kind: kindBtn ? kindBtn.dataset.kind : 'other',
      every: parseInt(fd.get('every')) || 1, unit: fd.get('unit'), nextDue: fd.get('nextDue') };
    if (id) Object.assign(b.routines.find(x => x.id === id), data);
    else b.routines.push(Object.assign({ id: uid() }, data));
    save(); renderPlanList(); renderProfile();
    toast('Schedule saved 🗓️');
  };
}
function delRoutine(btn, id){
  if (!btn.classList.contains('arm')) {
    btn.classList.add('arm'); btn.textContent = 'remove?';
    setTimeout(() => { btn.classList.remove('arm'); btn.textContent = '✕'; }, 2600);
    return;
  }
  const b = DB.bunnies[currentBunny];
  b.routines = b.routines.filter(r => r.id !== id);
  save(); renderPlanList(); renderProfile(); toast('Removed');
}

/* ---------- edit subtitle / family key ---------- */
function editSubtitle(){
  sheetMode = 'sub';
  const b = DB.bunnies[currentBunny];
  document.getElementById('sheet-title').textContent = 'About ' + b.name + ' ✎';
  document.getElementById('sheet-for').textContent = 'a short line under the name';
  document.getElementById('type-chips').hidden = true;
  const form = document.getElementById('sheet-form');
  form.innerHTML = `<div class="field"><label>Bio line</label><input name="subtitle" value="${esc(b.subtitle)}" placeholder="breed · birthday · attitude"></div>
    <button class="save-btn" type="submit">Save ♥</button>`;
  form.onsubmit = ev => {
    ev.preventDefault();
    b.subtitle = new FormData(ev.target).get('subtitle').trim();
    save(); closeSheet(); renderProfile();
  };
  showSheet();
}
function askKey(){
  sheetMode = 'key';
  document.getElementById('sheet-title').textContent = 'Family password 🔐';
  document.getElementById('sheet-for').textContent = 'so the bunnies’ data can sync between phones';
  document.getElementById('type-chips').hidden = true;
  const form = document.getElementById('sheet-form');
  form.innerHTML = `<div class="field"><label>Password</label><input name="key" type="password" required autocomplete="current-password"></div>
    <button class="save-btn" type="submit">Unlock ♥</button>`;
  form.onsubmit = ev => {
    ev.preventDefault();
    const k = new FormData(ev.target).get('key').trim();
    localStorage.setItem(LS_KEY, k);
    idbSetKey(k);                    // the service worker needs it for notification text
    closeSheet(); pullRemote(); refreshNotifBtn();
  };
  showSheet();
}

/* ---------- start fresh (one bunny at a time, triple-tap guarded) ---------- */
let resetTimer = null;
function resetBunny(btn){
  const b = DB.bunnies[currentBunny];
  const their = b.sex === 'm' ? 'his' : 'her';
  const stage = +(btn.dataset.stage || 0);
  clearTimeout(resetTimer);
  if (stage === 0) {
    btn.dataset.stage = 1; btn.classList.add('arm');
    btn.textContent = 'erase ALL of ' + b.name + '’s history? tap again';
  } else if (stage === 1) {
    btn.dataset.stage = 2;
    btn.textContent = 'ARE YOU SURE? this can’t be undone. Last tap does it';
  } else {
    DB.bunnies[currentBunny] = blankBunny(b.name, b.sex, b.img, b.subtitle);
    for (const k in DB.snoozes) if (k.split(':')[1] === currentBunny) delete DB.snoozes[k];
    save(); closeSheet(); renderProfile();
    toast(b.name + '’s slate is clean 🧺');
    return;
  }
  resetTimer = setTimeout(() => {
    btn.dataset.stage = 0; btn.classList.remove('arm');
    btn.textContent = 'start fresh (erase ' + their + ' data)';
  }, 4000);
}

/* ---------- export (iPhone-first: share sheet, download fallback) ---------- */
async function exportBunny(){
  const b = DB.bunnies[currentBunny];
  const data = JSON.stringify({ app: 'Penny & Lolo', exported: new Date().toISOString(), bunny: b }, null, 2);
  const name = b.name.toLowerCase() + '-backup-' + todayStr() + '.json';
  const file = new File([data], name, { type: 'application/json' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: name }); return; }
    catch (e) { if (e.name === 'AbortError') return; }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
  a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  toast('Backup saved 📤');
}

/* ---------- push reminders ---------- */
function idbSetKey(v){
  try {
    const rq = indexedDB.open('bunny-kv', 1);
    rq.onupgradeneeded = () => rq.result.createObjectStore('kv');
    rq.onsuccess = () => rq.result.transaction('kv', 'readwrite').objectStore('kv').put(v, 'familyKey');
  } catch (e) {}
}
const pushReady = () => SYNC.enabled && typeof PUSH !== 'undefined' && PUSH.publicKey && 'serviceWorker' in navigator;
function b64ToU8(s){
  const pad = '='.repeat((4 - s.length % 4) % 4);
  const bin = atob((s + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...bin].map(c => c.charCodeAt(0)));
}
async function refreshNotifBtn(){
  const btn = document.getElementById('notif-btn');
  if (!pushReady()) { btn.hidden = true; return; }
  btn.hidden = false;
  let on = false;
  try {
    const reg = await navigator.serviceWorker.ready;
    on = !!(await reg.pushManager.getSubscription());
  } catch (e) {}
  btn.textContent = on ? '🔔 daily reminders are on' : '🔕 turn on daily reminders';
}
async function toggleReminders(){
  if (!('Notification' in window) || !('PushManager' in window)) {
    toast('Pin the app to your home screen first, then tap here 💕');
    return;
  }
  try {
    const reg = await navigator.serviceWorker.ready;
    const cur = await reg.pushManager.getSubscription();
    if (cur) {
      await fetch('/api/push', { method: 'DELETE',
        headers: { 'x-bunny-key': familyKey(), 'content-type': 'application/json' },
        body: JSON.stringify({ endpoint: cur.endpoint }) });
      await cur.unsubscribe();
      toast('Reminders off');
    } else {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') { toast('Notifications are blocked for this app'); return; }
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToU8(PUSH.publicKey) });
      const r = await fetch('/api/push', { method: 'POST',
        headers: { 'x-bunny-key': familyKey(), 'content-type': 'application/json' },
        body: JSON.stringify(sub) });
      if (!r.ok) { await sub.unsubscribe(); toast('Could not save the reminder signup'); return; }
      toast('Reminders on 🔔 mornings, when something is due');
    }
  } catch (e) { toast('Could not update reminders'); }
  refreshNotifBtn();
}

/* ---------- misc ---------- */
let toastTimer = null;
function toast(msg){
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 1800);
}
function renderAll(){
  if (document.getElementById('screen-profile').hidden) renderHome();
  else renderProfile();
}

/* ---------- boot ---------- */
loadLocal();
renderHome();
pullRemote();
// a pinned app resumed from the background does not reload; refresh from the cloud first
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') pullRemote(); });
if ('serviceWorker' in navigator) {
  try { navigator.serviceWorker.register('sw.js').catch(() => {}); } catch (e) {}
}
if (familyKey()) idbSetKey(familyKey());
refreshNotifBtn();
