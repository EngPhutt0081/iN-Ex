/* iN&Ex · To Do mode (งาน)
   - Data lives in its own IndexedDB key "todo" — money data (c:*, settings, outbox, sync) is never written here.
   - Syncs through the existing Google Sheet backend as meta docs "todo:*" (works with any Code.gs version;
     Code.gs v2 also builds readable tabs "งาน" and "ประวัติเอกสาร" from them).
   - Kinds: t = task, j = MEA job (document workflow), l = document log entry, plus "todo:settings". */
(function () {
  'use strict';
  const X = window.INEX;
  if (!X) return;

  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));
  const esc = X.esc;
  const pad = (n) => String(n).padStart(2, '0');
  const iso = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const parseD = (s) => { const p = String(s || '').split('-').map(Number); return new Date(p[0], (p[1] || 1) - 1, p[2] || 1); };
  const addDays = (s, n) => { const d = parseD(s); d.setDate(d.getDate() + n); return iso(d); };
  const addMonths = (s, n) => {
    const d = parseD(s); const day = d.getDate(); d.setDate(1); d.setMonth(d.getMonth() + n);
    const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate(); d.setDate(Math.min(day, last)); return iso(d);
  };
  const diff = (a, b) => Math.round((parseD(b) - parseD(a)) / 864e5); // days from a to b
  const today = () => X.todayISO();
  const TH_M = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
  const TH_MS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  const TH_D = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];
  const TH_DS = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'];
  const dmy = (s) => { const d = parseD(s); return d.getDate() + ' ' + TH_MS[d.getMonth()]; };
  const shortD = (s) => { const d = parseD(s); return TH_DS[d.getDay()] + ' ' + d.getDate() + ' ' + TH_MS[d.getMonth()]; };
  const longD = (s) => { const d = parseD(s); return TH_D[d.getDay()] + ' ' + d.getDate() + ' ' + TH_M[d.getMonth()]; };

  const AREAS = { mea: { name: 'MEA', c: 'var(--lime)' }, study: { name: 'เรียน', c: '#8AB8FF' }, me: { name: 'ส่วนตัว', c: '#E2C17A' } };
  const AREA_KEYS = ['mea', 'study', 'me'];
  const REP = { '': 'ไม่ทำซ้ำ', d: 'ทุกวัน', w: 'ทุกสัปดาห์', m: 'ทุกเดือน' };
  const DEFAULT_STEPS = ['ใบสั่งงาน', 'ประมาณราคา / ราคากลาง', 'ขออนุมัติ PR', 'แบบรูป / ขอบเขตงาน / TOR', 'จัดหาผู้รับจ้าง / ทำสัญญา', 'ควบคุมงาน + บันทึกความคืบหน้า', 'ปิดงาน / ส่งมอบ'];
  const KIND = { t: 'tasks', j: 'jobs', l: 'logs' };
  const ICON = {
    today: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M8.5 12.2l2.4 2.4 4.6-5.2"/></svg>',
    week: '<svg viewBox="0 0 24 24"><rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/></svg>',
    matrix: '<svg viewBox="0 0 24 24"><rect x="3.5" y="3.5" width="7.5" height="7.5" rx="2"/><rect x="13" y="3.5" width="7.5" height="7.5" rx="2"/><rect x="3.5" y="13" width="7.5" height="7.5" rx="2"/><rect x="13" y="13" width="7.5" height="7.5" rx="2"/></svg>',
    jobs: '<svg viewBox="0 0 24 24"><rect x="3.5" y="7" width="17" height="13" rx="3"/><path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7"/></svg>',
    plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
    flag: '<svg class="td-flag" role="img" aria-label="สำคัญ" viewBox="0 0 24 24"><path d="M5 21V4"/><path d="M5 4h12l-2.5 4L17 12H5"/></svg>',
    rep: '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M17 2l4 4-4 4"/><path d="M3 11V9a3 3 0 0 1 3-3h15"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v2a3 3 0 0 1-3 3H3"/></svg>',
    sub: '<svg aria-hidden="true" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="4"/><path d="M8 12l3 3 5-6"/></svg>',
    check: '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M5 12l5 5 9-10"/></svg>',
    x: '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    chev: '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg>',
  };

  /* ---------- state & storage ---------- */
  let T = { tasks: [], jobs: [], logs: [], settings: null };
  let ready = false;
  const pending = [];
  let mode = 'money', tab = 'today', filter = 'all', weekSel = 0;
  let tf = null, jf = null, sf = null, setf = null, openJobId = null;
  let armed = '', armT = null;

  const S = () => Object.assign({ urgentDays: 2, steps: DEFAULT_STEPS.slice() }, T.settings || {});
  const save = () => X.kvSet('todo', T);
  const nid = (k) => k + ':' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const clone = (o) => JSON.parse(JSON.stringify(o));
  function pushItem(item) { const doc = Object.assign({}, item, { _t: Date.now() }); delete doc.id; X.enqueue('meta', 'todo:' + item.id, 'put', doc); }
  function upsert(item) {
    const a = T[KIND[item.id.split(':')[0]]]; const i = a.findIndex((x) => x.id === item.id);
    if (i >= 0) a[i] = item; else a.push(item);
    save(); pushItem(item);
  }
  function removeItem(id) {
    const k = KIND[id.split(':')[0]]; T[k] = T[k].filter((x) => x.id !== id);
    save(); X.enqueue('meta', 'todo:' + id, 'del', null);
  }
  function saveSettings(s) { T.settings = Object.assign({}, s, { _t: Date.now() }); save(); X.enqueue('meta', 'todo:settings', 'put', T.settings); }
  function log(job, kind, extra) { upsert(Object.assign({ id: nid('l'), job: job.id, d: today(), tm: X.nowHM(), kind, step: job.cur }, extra || {})); }

  function applyRemote(r) {
    if (!ready) { pending.push(r); return; }
    const id = String(r.id).slice(5);
    if (id === 'settings') { if (!r.deleted && r.doc) T.settings = Object.assign({}, r.doc); }
    else {
      const k = KIND[id.split(':')[0]]; if (!k) return;
      const i = T[k].findIndex((x) => x.id === id);
      if (r.deleted) { if (i >= 0) T[k].splice(i, 1); }
      else if (r.doc) { const row = Object.assign({}, r.doc, { id }); if (i >= 0) T[k][i] = row; else T[k].push(row); }
    }
    save(); render();
  }
  function enqueueAll() {
    if (T.settings) X.enqueue('meta', 'todo:settings', 'put', T.settings);
    ['tasks', 'jobs', 'logs'].forEach((k) => T[k].forEach(pushItem));
  }
  function exportData() { return clone(T); }
  async function importData(j) {
    let n = 0;
    if (j && j.settings) { T.settings = j.settings; n++; }
    ['tasks', 'jobs', 'logs'].forEach((k) => (Array.isArray(j && j[k]) ? j[k] : []).forEach((it) => {
      if (!it || !it.id) return; const i = T[k].findIndex((x) => x.id === it.id); if (i >= 0) T[k][i] = it; else T[k].push(it); n++;
    }));
    await save(); enqueueAll(); render(); return n;
  }

  /* ---------- derived ---------- */
  const jobById = (id) => T.jobs.find((j) => j.id === id) || null;
  const openTasks = () => T.tasks.filter((t) => !t.done);
  const isUrgent = (t) => !!t.due && diff(today(), t.due) <= S().urgentDays;
  const quad = (t) => (t.imp ? (isUrgent(t) ? 1 : 2) : (isUrgent(t) ? 3 : 4));
  const QORDER = { 1: 0, 3: 1, 2: 2, 4: 3 };
  const byDue = (a, b) => (a.due || '9999').localeCompare(b.due || '9999') || (a.time || '99').localeCompare(b.time || '99') || (a.created || 0) - (b.created || 0);
  const byPriority = (a, b) => QORDER[quad(a)] - QORDER[quad(b)] || byDue(a, b);
  function dueInfo(t) {
    if (!t.due) return { text: 'ไม่มีกำหนด', cls: '' };
    const n = diff(today(), t.due); const tm = t.time ? ' ' + t.time : '';
    if (n < 0) return { text: 'เลยกำหนด ' + (-n) + ' วัน', cls: 'over' };
    if (n === 0) return { text: 'วันนี้' + tm, cls: 'today' };
    if (n === 1) return { text: 'พรุ่งนี้' + tm, cls: '' };
    return { text: shortD(t.due) + tm, cls: '' };
  }
  const stepsOf = (j) => (j && Array.isArray(j.steps) ? j.steps : []);
  const stepName = (j, i) => { const s = stepsOf(j)[i]; return s ? s.n : ''; };
  const jobTasks = (j, step) => T.tasks.filter((t) => t.job === j.id && (step == null || Number(t.step) === step));
  const nextTask = (j) => jobTasks(j, j.cur).filter((t) => !t.done).sort(byDue)[0] || null;
  const isMe = (j) => !j.wait;
  const followDue = (j) => !j.closed && j.wait && j.follow && j.follow <= today();
  const lastLog = (j, kind) => T.logs.filter((l) => l.job === j.id && l.kind === kind).sort((a, b) => (b.d + b.tm).localeCompare(a.d + a.tm))[0] || null;
  function holders() {
    const seen = []; T.logs.slice().sort((a, b) => (b.d + b.tm).localeCompare(a.d + a.tm)).forEach((l) => { if (l.kind === 'send' && l.to && !seen.includes(l.to)) seen.push(l.to); });
    return seen;
  }
  function reasonOf(t) {
    const r = []; const n = t.due ? diff(today(), t.due) : null;
    if (n != null) r.push(n < 0 ? 'เลยกำหนด ' + (-n) + ' วัน' : n === 0 ? 'ครบวันนี้' + (t.time ? ' ' + t.time : '') : 'เหลือ ' + n + ' วัน');
    if (t.imp) r.push('ติดธงสำคัญ');
    const j = t.job && jobById(t.job); if (j) r.push('ขั้น ' + (Number(t.step) + 1) + ' ของ ' + j.name);
    if (!r.length) r.push('ยังไม่มีกำหนด');
    return r.join(' · ');
  }

  /* ---------- small html helpers ---------- */
  const dot = (area) => '<i class="td-dot" style="--c:' + (AREAS[area] || AREAS.me).c + '"></i>';
  const areaName = (a) => (AREAS[a] || AREAS.me).name;
  function taskRow(t, opts) {
    const o = opts || {}; const d = dueInfo(t); const j = t.job && jobById(t.job);
    const subs = Array.isArray(t.subs) && t.subs.length ? '<span class="td-ic">' + ICON.sub + t.subs.filter((s) => s.ok).length + '/' + t.subs.length + '</span>' : '';
    const rep = t.rep ? '<span class="td-ic">' + ICON.rep + REP[t.rep] + '</span>' : '';
    const step = j && !o.noStep ? '<small class="td-step">ขั้น: ' + esc(stepName(j, Number(t.step))) + ' (' + (Number(t.step) + 1) + ' จาก ' + stepsOf(j).length + ') · ' + esc(j.name) + '</small>' : '';
    return '<div class="td-row' + (t.done ? ' done' : '') + '">' +
      '<button class="td-chk' + (d.cls === 'over' && !t.done ? ' over' : '') + '" type="button" data-ta="done" data-tv="' + t.id + '" aria-label="' + (t.done ? 'ยกเลิกเสร็จ: ' : 'ทำเสร็จ: ') + esc(t.title) + '" aria-pressed="' + !!t.done + '"><span>' + (t.done ? ICON.check : '') + '</span></button>' +
      '<div class="td-main"><button class="td-body" type="button" data-ta="edit" data-tv="' + t.id + '"><b>' + esc(t.title) + '</b>' + step +
      '<span class="td-meta">' + dot(t.area) + areaName(t.area) + (t.done ? '<em>เสร็จ ' + (t.doneAt ? dmy(t.doneAt) : '') + '</em>' : '<em class="' + d.cls + '">' + d.text + '</em>') + subs + rep + '</span></button>' +
      (j && !o.noStep ? '<button class="td-link" type="button" data-ta="job" data-tv="' + j.id + '">ดูขั้นตอน ›</button>' : '') + '</div>' +
      (t.imp && !t.done ? ICON.flag : '') + '</div>';
  }
  const section = (title, note, inner) => '<section class="td-sec"><div class="td-sec-h"><h2>' + title + '</h2><span>' + (note || '') + '</span></div>' + inner + '</section>';
  const followRow = (j) => '<button class="td-follow" type="button" data-ta="job" data-tv="' + j.id + '"><span><b>ตาม' + esc(j.holder) + '</b><small>' + esc(j.name) + ' · ' + esc(stepName(j, j.cur)) + '</small></span><em class="' + (j.follow < today() ? 'over' : 'today') + '">' + (j.follow < today() ? 'ควรตามตั้งแต่ ' + dmy(j.follow) : 'ตามวันนี้') + '</em></button>';

  /* ---------- views ---------- */
  function renderToday(el) {
    const td = today(); const in7 = addDays(td, 7);
    const all = openTasks();
    const F = all.filter((t) => filter === 'all' || t.area === filter);
    const st = { over: F.filter((t) => t.due && t.due < td).length, today: F.filter((t) => t.due === td).length, next: F.filter((t) => t.due > td && t.due <= in7).length };
    const chips = ['all'].concat(AREA_KEYS).map((k) => '<button class="chip" type="button" data-ta="filter" data-tv="' + k + '" aria-pressed="' + (filter === k) + '"' + (k !== 'all' ? ' style="--c:' + AREAS[k].c + '"' : '') + '>' + (k !== 'all' ? '<i></i>' : '') + (k === 'all' ? 'ทั้งหมด' : AREAS[k].name) + '</button>').join('');
    const used = new Set();
    const take = (arr) => { arr.forEach((t) => used.add(t.id)); return arr; };
    const q1 = take(F.filter((t) => quad(t) === 1).sort(byDue));
    const now = take(F.filter((t) => !used.has(t.id) && t.due && t.due <= td).sort(byDue));
    const soon = take(F.filter((t) => !used.has(t.id) && t.due && t.due <= in7).sort(byDue));
    const later = take(F.filter((t) => !used.has(t.id) && t.due).sort(byDue));
    const nodue = F.filter((t) => !used.has(t.id) && !t.due).sort((a, b) => (b.imp ? 1 : 0) - (a.imp ? 1 : 0) || (a.created || 0) - (b.created || 0));
    const follows = (filter === 'all' || filter === 'mea') ? T.jobs.filter(followDue) : [];
    const doneToday = T.tasks.filter((t) => t.done && t.doneAt === td && (filter === 'all' || t.area === filter));
    let h = '<div class="td-head"><div class="td-sub">' + longD(td) + '</div><h1>วันนี้</h1></div>' +
      '<div class="td-stats"><div><b class="' + (st.over ? 'over' : '') + '">' + st.over + '</b><span>เลยกำหนด</span></div><div><b>' + st.today + '</b><span>ครบวันนี้</span></div><div><b>' + st.next + '</b><span>7 วันข้างหน้า</span></div></div>' +
      '<div class="chips td-filter" role="group" aria-label="กรองตามหมวด">' + chips + '</div>';
    if (follows.length) h += section('ตามเอกสาร', 'ถึงวันที่ควรตาม', follows.map(followRow).join(''));
    if (q1.length) h += section('ทำก่อน', 'สำคัญ + เร่งด่วน', q1.map((t) => taskRow(t)).join(''));
    if (now.length) h += section('วันนี้ / ค้างอยู่', '', now.map((t) => taskRow(t)).join(''));
    if (soon.length) h += section('7 วันข้างหน้า', '', soon.map((t) => taskRow(t)).join(''));
    if (later.length) h += '<details class="td-more"><summary>หลังจากนั้น (' + later.length + ')</summary>' + later.map((t) => taskRow(t)).join('') + '</details>';
    if (nodue.length) h += '<details class="td-more"' + (nodue.length <= 5 ? ' open' : '') + '><summary>ยังไม่มีกำหนด (' + nodue.length + ')</summary>' + nodue.map((t) => taskRow(t)).join('') + '</details>';
    if (!F.length && !follows.length) h += '<div class="td-empty">' + (all.length ? 'ไม่มีงานค้างในหมวดนี้' : 'ยังไม่มีงาน · แตะ + ด้านล่างเพื่อเพิ่มงานแรก') + '</div>';
    if (doneToday.length) h += '<details class="td-more"><summary>เสร็จวันนี้ (' + doneToday.length + ')</summary>' + doneToday.map((t) => taskRow(t)).join('') + '</details>';
    el.innerHTML = h;
  }

  function renderWeek(el) {
    const td = today(); const open = openTasks();
    const days = [];
    for (let i = 0; i < 7; i++) {
      const d = addDays(td, i);
      const list = open.filter((t) => (i === 0 ? t.due && t.due <= d : t.due === d)).sort(byDue);
      const fol = T.jobs.filter((j) => !j.closed && j.wait && j.follow && (i === 0 ? j.follow <= d : j.follow === d));
      days.push({ d, list, fol, n: list.length + fol.length });
    }
    const sel = days[weekSel] || days[0];
    const max = Math.max(4, ...days.map((x) => x.n));
    const strip = days.map((x, i) => { const dd = parseD(x.d); return '<button type="button" class="td-day" data-ta="wday" data-tv="' + i + '" aria-pressed="' + (i === weekSel) + '" aria-label="' + longD(x.d) + ' ' + x.n + ' งาน"><span>' + TH_DS[dd.getDay()].replace('.', '') + '</span><b>' + dd.getDate() + '</b><small class="' + (x.n > 2 ? 'hot' : '') + '">' + (x.n ? x.n + ' งาน' : '') + '</small></button>'; }).join('');
    let list = sel.fol.map(followRow).join('') + sel.list.map((t) => taskRow(t)).join('');
    if (!sel.n) list = '<div class="td-empty">ไม่มีงานวันนี้ · แตะ + เพื่อเพิ่ม</div>';
    const bars = days.map((x) => { const dd = parseD(x.d); return '<div class="td-bar"><span>' + TH_DS[dd.getDay()] + ' ' + dd.getDate() + '</span><i><s style="width:' + Math.round(x.n / max * 100) + '%" class="' + (x.n > 2 ? 'hot' : '') + '"></s></i><b>' + x.n + ' งาน</b></div>'; }).join('');
    const nodue = open.filter((t) => !t.due).length;
    el.innerHTML = '<div class="td-head"><div class="td-sub">' + dmy(td) + ' – ' + dmy(addDays(td, 6)) + '</div><h1>7 วันข้างหน้า</h1></div>' +
      '<div class="td-week" role="group" aria-label="เลือกวัน">' + strip + '</div>' +
      section(weekSel === 0 ? 'วันนี้ · ' + longD(sel.d) : longD(sel.d), weekSel === 0 ? 'รวมงานที่ค้าง' : sel.n + ' งาน', list) +
      section('ภาระงานรายวัน', nodue ? 'ไม่มีกำหนดอีก ' + nodue + ' งาน' : '', '<div class="panel td-bars">' + bars + '</div>');
  }

  function renderMatrix(el) {
    const open = openTasks();
    const Q = { 1: [], 2: [], 3: [], 4: [] }; open.forEach((t) => Q[quad(t)].push(t));
    Object.keys(Q).forEach((k) => Q[k].sort(byDue));
    const qbox = (k, name, hint, cls) => '<div class="td-q ' + cls + '"><div class="td-q-h"><b>' + name + '</b><span class="num">' + Q[k].length + '</span></div><small>' + hint + '</small>' +
      Q[k].slice(0, 5).map((t) => { const d = dueInfo(t); return '<button type="button" class="td-qi" data-ta="edit" data-tv="' + t.id + '"><span>' + esc(t.title) + '</span><small>' + dot(t.area) + areaName(t.area) + ' · <em class="' + d.cls + '">' + d.text + '</em></small></button>'; }).join('') +
      (Q[k].length > 5 ? '<small class="td-q-more">และอีก ' + (Q[k].length - 5) + ' งาน</small>' : '') + '</div>';
    const rank = open.slice().sort(byPriority).slice(0, 5);
    const u = S().urgentDays;
    el.innerHTML = '<div class="td-head"><div class="td-sub">จัดลำดับให้อัตโนมัติ</div><h1>สำคัญ × เร่งด่วน</h1></div>' +
      '<div class="td-rule"><p><b>เร่งด่วน</b> = เหลือไม่เกิน ' + u + ' วัน หรือเลยกำหนด<br><b>สำคัญ</b> = งานที่ติดธงไว้</p><button class="btn" type="button" data-ta="settings">ปรับเกณฑ์</button></div>' +
      '<div class="td-grid"><span></span><span class="td-ax">เร่งด่วน</span><span class="td-ax">ยังไม่เร่ง</span>' +
      '<span class="td-ax td-axv">สำคัญ</span>' + qbox(1, 'ทำทันที', 'สำคัญ · เร่งด่วน', 'q1') + qbox(2, 'วางแผนทำ', 'สำคัญ · ยังไม่เร่ง', 'q2') +
      '<span class="td-ax td-axv">ไม่สำคัญ</span>' + qbox(3, 'ทำให้จบเร็ว', 'เร่งด่วน · ไม่สำคัญ', 'q3') + qbox(4, 'ทีหลัง', 'ไม่เร่ง · ไม่สำคัญ', 'q4') + '</div>' +
      section('ลำดับที่ควรทำถัดไป', '', rank.length ? rank.map((t, i) => '<button type="button" class="td-rank" data-ta="edit" data-tv="' + t.id + '"><b class="num' + (i === 0 && quad(t) === 1 ? ' over' : '') + '">' + (i + 1) + '</b><span><span>' + esc(t.title) + '</span><small>' + esc(reasonOf(t)) + '</small></span></button>').join('') : '<div class="td-empty">ยังไม่มีงานค้าง</div>');
  }

  function jobStatus(j) {
    if (j.closed) return { text: 'ปิดงานแล้ว ' + dmy(j.closed), cls: '' };
    if (j.wait) return { text: 'รอ' + j.holder + (j.follow ? ' · ตามงาน ' + dmy(j.follow) : ''), cls: followDue(j) ? 'over' : 'wait' };
    const n = nextTask(j);
    if (n) { const d = dueInfo(n); return { text: 'ต่อไป: ' + n.title + ' · ' + d.text, cls: d.cls }; }
    return { text: 'เอกสารอยู่ที่เรา · ยังไม่มีสิ่งที่ต้องทำในขั้นนี้', cls: '' };
  }
  function jobCard(j) {
    const n = stepsOf(j).length || 1; const done = j.closed ? n : Math.min(Number(j.cur) || 0, n); const s = jobStatus(j);
    return '<button type="button" class="td-job" data-ta="job" data-tv="' + j.id + '"><span class="td-job-t"><b>' + esc(j.name) + '</b>' + (j.ref ? '<em>' + esc(j.ref) + '</em>' : '') + '</span>' +
      '<span class="td-prog" aria-hidden="true"><s style="width:' + Math.round(done / n * 100) + '%"></s></span>' +
      '<small>ขั้น ' + (Math.min(j.cur, n - 1) + 1) + '/' + n + ' · ' + esc(stepName(j, j.cur)) + '</small><small class="' + s.cls + '">' + esc(s.text) + '</small></button>';
  }
  function renderJobs(el) {
    const open = T.jobs.filter((j) => !j.closed);
    const rank = (j) => (followDue(j) ? 0 : (!j.wait && nextTask(j) && nextTask(j).due && nextTask(j).due < today()) ? 1 : j.wait ? 3 : 2);
    open.sort((a, b) => rank(a) - rank(b) || (a.created || 0) - (b.created || 0));
    const closed = T.jobs.filter((j) => j.closed).sort((a, b) => b.closed.localeCompare(a.closed));
    const yr = today().slice(0, 4);
    const waiting = open.filter((j) => j.wait).length;
    el.innerHTML = '<div class="td-head"><div class="td-sub">ขั้นตอนเดินเอกสาร</div><h1>งาน MEA</h1></div>' +
      '<div class="td-stats"><div><b>' + open.length + '</b><span>เปิดอยู่</span></div><div><b>' + waiting + '</b><span>รอคนอื่น</span></div><div><b>' + closed.filter((j) => j.closed.slice(0, 4) === yr).length + '</b><span>ปิดแล้วปีนี้</span></div></div>' +
      '<div class="td-actions"><button class="btn primary b-save" type="button" data-ta="newjob">+ งานใหม่ (ใบสั่งงาน)</button><button class="btn" type="button" data-ta="settings">ตั้งค่า</button></div>' +
      (open.length ? open.map(jobCard).join('') : '<div class="td-empty">ยังไม่มีงาน MEA · เพิ่มงานแรกด้วยปุ่มด้านบน แล้วไล่ขั้นตอนเอกสารได้ทีละขั้น</div>') +
      (closed.length ? '<details class="td-more"><summary>ปิดแล้ว (' + closed.length + ')</summary>' + closed.map(jobCard).join('') + '</details>' : '');
  }

  /* ---------- job detail ---------- */
  function renderJobDetail() {
    const sh = $('#tdJob'); const j = jobById(openJobId);
    if (!j) { closeSheet('tdJob'); return; }
    $('#tdJobT').textContent = j.name;
    const steps = stepsOf(j); const td = today();
    let card;
    if (j.closed) card = '<div class="td-card"><span class="td-card-k">ปิดงานแล้ว</span><b>' + longD(j.closed) + '</b><button class="btn" type="button" data-ta="reopen">เปิดงานนี้อีกครั้ง</button></div>';
    else if (j.wait) {
      const ls = lastLog(j, 'send');
      card = '<div class="td-card wait' + (followDue(j) ? ' late' : '') + '"><div class="td-card-top"><span class="td-card-k">รอคนอื่น</span><span>' + (ls ? 'ส่งเมื่อ ' + shortD(ls.d) : '') + '</span></div>' +
        '<b>รอ' + esc(j.holder) + ' · ' + esc(stepName(j, j.cur)) + '</b>' +
        '<div class="td-kv"><div><span>เอกสารอยู่ที่</span><b>' + esc(j.holder) + '</b></div><div><span>ตามงานถ้ายังไม่คืน</span><b class="' + (followDue(j) ? 'over' : '') + '">' + (j.follow ? shortD(j.follow) : '—') + '</b></div></div>' +
        '<button class="btn primary b-save" type="button" data-ta="back">ได้เอกสารคืนแล้ว</button><button class="btn" type="button" data-ta="send">ส่งต่อให้คนอื่น</button></div>';
    } else {
      const n = nextTask(j); const d = n && dueInfo(n); const tgt = steps[j.cur] && steps[j.cur].due;
      card = '<div class="td-card' + (n && d.cls === 'over' ? ' late' : '') + '"><div class="td-card-top"><span class="td-card-k">สิ่งที่ต้องทำต่อไป</span><span class="' + (n ? d.cls : '') + '">' + (n ? d.text : '') + '</span></div>' +
        '<b>' + (n ? esc(n.title) : 'ยังไม่มีสิ่งที่ต้องทำในขั้นนี้') + '</b>' +
        '<div class="td-kv"><div><span>เอกสารอยู่ที่</span><b>เรา</b></div><div><span>เป้าขั้นนี้</span><b class="' + (tgt && tgt < td ? 'over' : '') + '">' + (tgt ? shortD(tgt) : '—') + '</b></div></div>' +
        '<button class="btn primary b-save" type="button" data-ta="send">ส่งเอกสารต่อ · บันทึกว่าไปที่ใคร</button>' +
        (j.cur < steps.length - 1 ? '<button class="btn" type="button" data-ta="stepdone">ขั้นนี้เสร็จ → ' + esc(stepName(j, j.cur + 1)) + '</button>' : '<button class="btn" type="button" data-ta="stepdone">ขั้นสุดท้ายเสร็จ · ปิดงาน</button>') + '</div>';
    }
    const tl = steps.map((s, i) => {
      const st = s.done && i !== j.cur ? 'done' : i === j.cur && !j.closed ? 'cur' : i < j.cur || j.closed ? 'done' : 'todo';
      const list = jobTasks(j, i);
      const date = s.done ? 'เสร็จ ' + dmy(s.done) : st === 'done' ? 'ผ่านขั้นนี้แล้ว' : s.due ? 'เป้า ' + shortD(s.due) + (s.due < td && st === 'cur' ? ' · เลย ' + diff(s.due, td) + ' วัน' : '') : 'ยังไม่ตั้งเป้า';
      const late = st === 'cur' && s.due && s.due < td;
      let inner = '';
      if (st === 'cur') {
        inner = '<div class="td-checks">' + list.sort((a, b) => (a.done ? 1 : 0) - (b.done ? 1 : 0) || byDue(a, b)).map((t) => '<div class="td-ck' + (t.done ? ' ok' : '') + '"><button type="button" class="td-box" data-ta="done" data-tv="' + t.id + '" aria-pressed="' + !!t.done + '" aria-label="' + (t.done ? 'ยกเลิกเสร็จ: ' : 'ทำเสร็จ: ') + esc(t.title) + '">' + (t.done ? ICON.check : '') + '</button><button type="button" class="td-ck-t" data-ta="edit" data-tv="' + t.id + '">' + esc(t.title) + (t.due && !t.done ? ' <em class="' + dueInfo(t).cls + '">' + dueInfo(t).text + '</em>' : '') + '</button></div>').join('') +
          '<button type="button" class="td-addck" data-ta="newstep" data-tv="' + i + '">' + ICON.plus + 'เพิ่มสิ่งที่ต้องทำในขั้นนี้</button></div>';
      } else if (list.length) inner = '<small class="td-tl-n">' + list.filter((t) => t.done).length + '/' + list.length + ' งานในขั้นนี้</small>';
      return '<div class="td-tl ' + st + '"><div class="td-tl-m"><span class="td-tl-dot">' + (st === 'done' ? ICON.check : st === 'todo' ? (i + 1) : '') + '</span>' + (i < steps.length - 1 ? '<i></i>' : '') + '</div>' +
        '<div class="td-tl-b"><b>' + esc(s.n) + '</b><small class="' + (late ? 'over' : '') + '">' + date + '</small>' + inner + '</div></div>';
    }).join('');
    const logs = T.logs.filter((l) => l.job === j.id).sort((a, b) => (b.d + b.tm).localeCompare(a.d + a.tm));
    const logText = (l) => l.kind === 'send' ? 'ส่ง' + esc(stepName(j, l.step) ? ' (' + stepName(j, l.step) + ')' : '') + ' → ' + esc(l.to) : l.kind === 'back' ? 'ได้เอกสารคืนจาก' + esc(l.from || '') : l.kind === 'step' ? 'เสร็จขั้น ' + esc(stepName(j, l.step)) : l.kind === 'open' ? 'เปิดงาน' : l.kind === 'close' ? 'ปิดงาน' : l.kind === 'reopen' ? 'เปิดงานอีกครั้ง' : '';
    $('#tdJob .sheet-body').innerHTML =
      '<div class="td-jhead"><span>' + dot('mea') + 'งาน MEA' + (j.ref ? ' · ' + esc(j.ref) : '') + '</span>' + (j.desc ? '<p>' + esc(j.desc) + '</p>' : '') + '<button class="ghost" type="button" data-ta="editjob">แก้ไขข้อมูลงาน / ขั้นตอน</button></div>' +
      card +
      '<div class="td-sec-h"><h2>ขั้นตอนเดินเอกสาร</h2><span class="num">' + Math.min(j.cur + 1, steps.length) + ' / ' + steps.length + '</span></div><div class="td-timeline">' + tl + '</div>' +
      '<div class="td-sec-h"><h2>ประวัติเอกสาร</h2><span>' + logs.length + ' รายการ</span></div>' +
      (logs.length ? '<div class="panel td-log">' + logs.map((l) => '<div class="td-log-r"><span class="num">' + dmy(l.d) + '<br>' + esc(l.tm || '') + '</span><span>' + logText(l) + (l.text ? '<small>' + esc(l.text) + '</small>' : '') + '</span><button type="button" class="td-x" data-ta="dellog" data-tv="' + l.id + '" aria-label="ลบประวัติรายการนี้">' + (armed === 'log:' + l.id ? 'ลบ?' : ICON.x) + '</button></div>').join('') + '</div>' : '<div class="td-empty">ยังไม่มีประวัติ</div>') +
      (j.closed ? '' : '<button class="btn" type="button" data-ta="closejob">ปิดงานนี้ (ส่งมอบแล้ว)</button>') +
      '<button class="danger' + (armed === 'job' ? ' armed' : '') + '" type="button" data-ta="deljob">' + (armed === 'job' ? 'แตะอีกครั้งเพื่อยืนยันการลบ' : 'ลบงานนี้') + '</button>';
    sh.hidden = false;
  }

  /* ---------- task sheet ---------- */
  function lastArea() { try { return localStorage.getItem('inex-td-area') || 'mea'; } catch (e) { return 'mea'; } }
  function openTask(id, preset) {
    const t = id && T.tasks.find((x) => x.id === id);
    tf = t ? clone(t) : Object.assign({ id: '', title: '', area: filter !== 'all' ? filter : lastArea(), due: '', time: '', imp: false, rep: '', subs: [], note: '', job: '', step: null }, preset || {});
    if (!Array.isArray(tf.subs)) tf.subs = [];
    armed = '';
    $('#tdTaskT').textContent = t ? 'แก้ไขงาน' : 'งานใหม่';
    renderTaskForm(); $('#tdTask').hidden = false;
    if (!t) setTimeout(() => { const i = $('#tdTitle'); if (i) i.focus(); }, 60);
  }
  function readTask() {
    if (!tf) return;
    const v = (s) => { const e = $(s); return e ? e.value : undefined; };
    if (v('#tdTitle') != null) tf.title = v('#tdTitle');
    if (v('#tdDue') != null) tf.due = v('#tdDue');
    if (v('#tdTime') != null) tf.time = v('#tdTime');
    if (v('#tdNote') != null) tf.note = v('#tdNote');
    $$('[data-subtext]').forEach((i) => { const s = tf.subs.find((x) => x.id === i.dataset.subtext); if (s) s.x = i.value; });
  }
  function renderTaskForm() {
    const td = today(); const f = tf;
    const seg = AREA_KEYS.map((k) => '<button type="button" data-ta="tarea" data-tv="' + k + '" aria-pressed="' + (f.area === k) + '">' + dot(k) + AREAS[k].name + '</button>').join('');
    let jobPart = '';
    if (f.area === 'mea') {
      const jobs = T.jobs.filter((j) => !j.closed || j.id === f.job);
      const jchips = '<button type="button" class="chip" data-ta="tjob" data-tv="" aria-pressed="' + !f.job + '">ไม่ผูกกับงาน</button>' + jobs.map((j) => '<button type="button" class="chip" style="--c:var(--lime)" data-ta="tjob" data-tv="' + j.id + '" aria-pressed="' + (f.job === j.id) + '"><i></i>' + esc(j.name) + '</button>').join('');
      const j = f.job && jobById(f.job);
      const schips = j ? stepsOf(j).map((s, i) => '<button type="button" class="chip" data-ta="tstep" data-tv="' + i + '" aria-pressed="' + (Number(f.step) === i) + '">' + (i + 1) + ' · ' + esc(s.n) + '</button>').join('') : '';
      jobPart = '<div class="field"><span>ผูกกับงาน MEA</span><div class="chips">' + jchips + '</div></div>' + (j ? '<div class="field"><span>อยู่ในขั้นตอน</span><div class="chips">' + schips + '</div></div>' : '');
    }
    const quick = [['วันนี้', td], ['พรุ่งนี้', addDays(td, 1)], ['+3 วัน', addDays(td, 3)], ['สัปดาห์หน้า', addDays(td, 7)], ['ไม่มีกำหนด', '']].map((q) => '<button type="button" class="chip" data-ta="tdue" data-tv="' + q[1] + '" aria-pressed="' + (f.due === q[1]) + '">' + q[0] + '</button>').join('');
    const urg = !!f.due && diff(td, f.due) <= S().urgentDays;
    const qn = f.imp ? (urg ? 'ทำทันที (สำคัญ · เร่งด่วน)' : 'วางแผนทำ (สำคัญ · ยังไม่เร่ง)') : (urg ? 'ทำให้จบเร็ว (เร่งด่วน · ไม่สำคัญ)' : 'ทีหลัง (ไม่เร่ง · ไม่สำคัญ)');
    const left = f.due ? diff(td, f.due) : null;
    const urgTag = left == null ? 'ไม่มีกำหนด → ไม่เร่ง' : (left < 0 ? 'เลยกำหนด ' + (-left) + ' วัน' : left === 0 ? 'ครบวันนี้' : 'เหลือ ' + left + ' วัน') + (urg ? ' → เร่งด่วน' : ' → ยังไม่เร่ง');
    const reps = Object.keys(REP).map((k) => '<button type="button" class="chip" data-ta="trep" data-tv="' + k + '" aria-pressed="' + (f.rep === k) + '">' + REP[k] + '</button>').join('');
    const subs = f.subs.map((s) => '<div class="td-subrow"><button type="button" class="td-box" data-ta="tsubok" data-tv="' + s.id + '" aria-pressed="' + !!s.ok + '" aria-label="' + (s.ok ? 'ยกเลิกเสร็จ' : 'ทำเสร็จ') + '">' + (s.ok ? ICON.check : '') + '</button><input data-subtext="' + s.id + '" value="' + esc(s.x) + '" aria-label="งานย่อย" autocomplete="off"><button type="button" class="td-x" data-ta="tsubdel" data-tv="' + s.id + '" aria-label="ลบงานย่อย">' + ICON.x + '</button></div>').join('');
    const j = f.job && jobById(f.job);
    $('#tdTask .sheet-body').innerHTML =
      '<label class="field"><span>ชื่องาน</span><input id="tdTitle" value="' + esc(f.title) + '" autocomplete="off" placeholder="เช่น ส่งร่าง TOR ให้หัวหน้าแผนกตรวจ"></label>' +
      '<div class="field"><span>หมวด</span><div class="b-seg td-seg" role="group" aria-label="หมวด">' + seg + '</div></div>' + jobPart +
      '<div class="field"><span>กำหนดส่ง</span><div class="chips">' + quick + '</div></div>' +
      '<div class="row2"><label class="field"><span>วันที่</span><input type="date" id="tdDue" value="' + esc(f.due) + '"></label><label class="field"><span>เวลา (ไม่บังคับ)</span><input type="time" id="tdTime" value="' + esc(f.time) + '"></label></div>' +
      '<div class="panel td-pri"><div class="td-sw"><span><b>สำคัญ</b><small>ติดธง ให้ขึ้นไปอยู่บนสุด</small></span><button type="button" role="switch" class="td-switch" data-ta="timp" aria-checked="' + !!f.imp + '" aria-label="สำคัญ"><i></i></button></div>' +
      '<div class="td-sw"><span><b>เร่งด่วน</b><small>คำนวณจากวันกำหนดส่งให้เอง</small></span><em class="td-tag' + (urg ? ' hot' : '') + '">' + urgTag + '</em></div><small>จะไปอยู่ช่อง <b>' + qn + '</b></small></div>' +
      '<div class="field"><span>ทำซ้ำ</span><div class="chips">' + reps + '</div>' + (f.rep ? '<small class="td-hint">กดเสร็จแล้ว งานจะเลื่อนไปครั้งถัดไปให้เอง</small>' : '') + '</div>' +
      '<div class="field"><span>งานย่อย</span><div class="panel td-subs">' + subs + '<div class="td-subrow"><input id="tdSubNew" placeholder="เพิ่มงานย่อย แล้วกด Enter" autocomplete="off" aria-label="งานย่อยใหม่"><button type="button" class="btn" data-ta="tsubadd">เพิ่ม</button></div></div></div>' +
      '<label class="field"><span>หมายเหตุ</span><textarea id="tdNote" rows="3" placeholder="เช่น เลขที่หนังสือ, คนที่ต้องติดต่อ">' + esc(f.note || '') + '</textarea></label>' +
      (j ? '<button class="btn" type="button" data-ta="job" data-tv="' + j.id + '">เปิดขั้นตอนงาน “' + esc(j.name) + '” ›</button>' : '') +
      (f.id ? '<button class="btn" type="button" data-ta="tdone">' + (f.done ? 'ยังไม่เสร็จ (เปิดงานอีกครั้ง)' : 'ทำเสร็จแล้ว') + '</button><button class="danger' + (armed === 'task' ? ' armed' : '') + '" type="button" data-ta="tdel">' + (armed === 'task' ? 'แตะอีกครั้งเพื่อยืนยันการลบ' : 'ลบงานนี้') + '</button>' : '');
  }
  function saveTask() {
    readTask(); const f = tf;
    f.title = String(f.title || '').trim();
    if (!f.title) { X.toast('ใส่ชื่องานก่อน'); const i = $('#tdTitle'); if (i) i.focus(); return; }
    if (f.area !== 'mea') { f.job = ''; f.step = null; }
    const j = f.job && jobById(f.job);
    if (!j) { f.job = ''; f.step = null; } else if (f.step == null || !stepsOf(j)[Number(f.step)]) f.step = j.cur;
    f.subs = f.subs.map((s) => ({ id: s.id, x: String(s.x || '').trim(), ok: !!s.ok })).filter((s) => s.x);
    const isNew = !f.id;
    if (isNew) { f.id = nid('t'); f.created = Date.now(); f.done = false; }
    try { localStorage.setItem('inex-td-area', f.area); } catch (e) { /* private mode */ }
    upsert(f); closeSheet('tdTask'); render(); X.toast(isNew ? 'เพิ่มงานแล้ว' : 'บันทึกแล้ว');
  }
  function toggleDone(id) {
    const t = T.tasks.find((x) => x.id === id); if (!t) return;
    const prev = clone(t);
    if (!t.done && t.rep) {
      const step = (s) => (t.rep === 'd' ? addDays(s, 1) : t.rep === 'w' ? addDays(s, 7) : addMonths(s, 1));
      let next = step(t.due || today()); let guard = 0;
      while (next <= today() && guard++ < 400) next = step(next);
      t.due = next; t.lastDone = today(); t.subs = (t.subs || []).map((s) => Object.assign({}, s, { ok: false }));
      upsert(t); render();
      X.toast('เสร็จแล้ว · ครั้งถัดไป ' + shortD(next), { label: 'เลิกทำ', fn: () => { upsert(prev); render(); } });
      return;
    }
    t.done = !t.done; t.doneAt = t.done ? today() : '';
    upsert(t); render();
    if (t.done) X.toast('เสร็จแล้ว', { label: 'เลิกทำ', fn: () => { upsert(prev); render(); } });
  }

  /* ---------- job edit sheet ---------- */
  function openJobEdit(id) {
    const j = id && jobById(id);
    jf = j ? clone(j) : { id: '', name: '', ref: '', desc: '', steps: S().steps.map((n) => ({ n, due: '', done: '' })), cur: 0, wait: false, holder: '', follow: '', closed: '' };
    armed = '';
    $('#tdJobEditT').textContent = j ? 'แก้ไขงาน' : 'งาน MEA ใหม่';
    renderJobForm(); $('#tdJobEdit').hidden = false;
    if (!j) setTimeout(() => { const i = $('#tjName'); if (i) i.focus(); }, 60);
  }
  function readJob() {
    if (!jf) return;
    const v = (s) => { const e = $(s); return e ? e.value : undefined; };
    ['name', 'ref', 'desc'].forEach((k) => { const x = v('#tj' + k[0].toUpperCase() + k.slice(1)); if (x != null) jf[k] = x; });
    jf.steps.forEach((s, i) => { const n = v('#tjS' + i); const d = v('#tjD' + i); if (n != null) s.n = n; if (d != null) s.due = d; });
  }
  function renderJobForm() {
    const f = jf;
    const rows = f.steps.map((s, i) => '<div class="td-steprow"><span class="num">' + (i + 1) + '</span><input id="tjS' + i + '" value="' + esc(s.n) + '" aria-label="ชื่อขั้นที่ ' + (i + 1) + '" autocomplete="off"><input type="date" id="tjD' + i + '" value="' + esc(s.due || '') + '" aria-label="เป้าวันที่ขั้นที่ ' + (i + 1) + '"><button type="button" class="td-x" data-ta="jsdel" data-tv="' + i + '" aria-label="ลบขั้นที่ ' + (i + 1) + '"' + (f.steps.length < 2 ? ' disabled' : '') + '>' + ICON.x + '</button></div>').join('');
    const cur = f.steps.map((s, i) => '<button type="button" class="chip" data-ta="jcur" data-tv="' + i + '" aria-pressed="' + (f.cur === i) + '">' + (i + 1) + ' · ' + esc(s.n || '—') + '</button>').join('');
    $('#tdJobEdit .sheet-body').innerHTML =
      '<label class="field"><span>ชื่องาน</span><input id="tjName" value="' + esc(f.name) + '" placeholder="เช่น บ่อ A + HDD 76 ม." autocomplete="off"></label>' +
      '<label class="field"><span>เลขที่ใบสั่งงาน / อ้างอิง</span><input id="tjRef" value="' + esc(f.ref) + '" placeholder="ไม่บังคับ" autocomplete="off"></label>' +
      '<label class="field"><span>รายละเอียด</span><input id="tjDesc" value="' + esc(f.desc) + '" placeholder="เช่น บ่อพักใหม่ · Endcase · HDD 2 ท่อ · Riser" autocomplete="off"></label>' +
      '<div class="field"><span>ขั้นตอนเอกสาร และวันเป้าหมายของแต่ละขั้น</span><div class="panel td-steps">' + rows + '<button type="button" class="td-addck" data-ta="jsadd">' + ICON.plus + 'เพิ่มขั้นตอน</button></div></div>' +
      '<div class="field"><span>ตอนนี้อยู่ขั้นไหน</span><div class="chips">' + cur + '</div></div>' +
      (f.id ? '' : '<small class="td-hint">ขั้นตอนตั้งต้นแก้ได้ที่ “ตั้งค่า” ในแท็บงาน MEA</small>');
  }
  function saveJob() {
    readJob(); const f = jf;
    f.name = String(f.name || '').trim(); if (!f.name) { X.toast('ใส่ชื่องานก่อน'); return; }
    f.steps = f.steps.map((s) => ({ n: String(s.n || '').trim(), due: s.due || '', done: s.done || '' })).filter((s) => s.n);
    if (!f.steps.length) { X.toast('ต้องมีอย่างน้อย 1 ขั้นตอน'); return; }
    f.cur = Math.min(Math.max(0, Number(f.cur) || 0), f.steps.length - 1);
    f.ref = String(f.ref || '').trim(); f.desc = String(f.desc || '').trim();
    const isNew = !f.id;
    if (isNew) { f.id = nid('j'); f.created = Date.now(); }
    upsert(f); if (isNew) log(f, 'open');
    closeSheet('tdJobEdit');
    if (isNew) { openJobId = f.id; renderJobDetail(); }
    render(); X.toast(isNew ? 'สร้างงานแล้ว' : 'บันทึกแล้ว');
  }

  /* ---------- send sheet ---------- */
  function openSend() {
    const j = jobById(openJobId); if (!j) return;
    sf = { to: j.wait ? '' : '', d: today(), follow: addDays(today(), 3), text: '' };
    $('#tdSendT').textContent = 'ส่งเอกสารต่อ';
    renderSendForm(); $('#tdSend').hidden = false;
    setTimeout(() => { const i = $('#tsTo'); if (i) i.focus(); }, 60);
  }
  function readSend() { if (!sf) return; const v = (s) => { const e = $(s); return e ? e.value : undefined; }; ['to', 'd', 'follow', 'text'].forEach((k) => { const x = v('#ts' + k[0].toUpperCase() + k.slice(1)); if (x != null) sf[k] = x; }); }
  function renderSendForm() {
    const j = jobById(openJobId); const hs = holders().slice(0, 8);
    const fq = [1, 3, 7].map((n) => { const d = addDays(sf.d || today(), n); return '<button type="button" class="chip" data-ta="sfol" data-tv="' + d + '" aria-pressed="' + (sf.follow === d) + '">+' + n + ' วัน</button>'; }).join('');
    $('#tdSend .sheet-body').innerHTML =
      '<p class="td-hint">' + esc(j ? j.name : '') + ' · ขั้น ' + esc(j ? stepName(j, j.cur) : '') + '</p>' +
      '<label class="field"><span>ส่งให้ใคร / เอกสารไปอยู่ที่</span><input id="tsTo" value="' + esc(sf.to) + '" placeholder="เช่น หัวหน้าแผนก, ฝ่ายพัสดุ" autocomplete="off" list="tdHolders"></label>' +
      (hs.length ? '<div class="chips">' + hs.map((h) => '<button type="button" class="chip" data-ta="sto" data-tv="' + esc(h) + '" aria-pressed="' + (sf.to === h) + '">' + esc(h) + '</button>').join('') + '</div>' : '') +
      '<div class="row2"><label class="field"><span>วันที่ส่ง</span><input type="date" id="tsD" value="' + esc(sf.d) + '"></label><label class="field"><span>ตามงานถ้ายังไม่คืน</span><input type="date" id="tsFollow" value="' + esc(sf.follow) + '"></label></div>' +
      '<div class="chips">' + fq + '</div>' +
      '<label class="field"><span>หมายเหตุ</span><input id="tsText" value="' + esc(sf.text) + '" placeholder="เช่น ส่งทางสารบรรณ เลขที่ ..." autocomplete="off"></label>' +
      '<datalist id="tdHolders">' + hs.map((h) => '<option value="' + esc(h) + '"></option>').join('') + '</datalist>';
  }
  function saveSend() {
    readSend(); const j = jobById(openJobId); if (!j) return;
    const to = String(sf.to || '').trim(); if (!to) { X.toast('ใส่ว่าส่งให้ใคร'); return; }
    const prevHolder = j.wait ? j.holder : 'เรา';
    Object.assign(j, { wait: true, holder: to, follow: sf.follow || '' });
    upsert(j);
    upsert({ id: nid('l'), job: j.id, d: sf.d || today(), tm: X.nowHM(), kind: 'send', step: j.cur, from: prevHolder, to, text: String(sf.text || '').trim() });
    closeSheet('tdSend'); renderJobDetail(); render(); X.toast('บันทึกแล้ว · เอกสารอยู่ที่' + to);
  }
  function backDoc() {
    const j = jobById(openJobId); if (!j) return;
    const from = j.holder; Object.assign(j, { wait: false, holder: '', follow: '' }); upsert(j);
    log(j, 'back', { from }); renderJobDetail(); render(); X.toast('บันทึกแล้ว · ได้เอกสารคืนจาก' + from);
  }
  function stepDone() {
    const j = jobById(openJobId); if (!j) return;
    const steps = stepsOf(j); const s = steps[j.cur]; if (!s) return;
    s.done = today(); log(j, 'step');
    if (j.cur < steps.length - 1) { j.cur += 1; upsert(j); X.toast('ไปขั้น ' + (j.cur + 1) + ' · ' + stepName(j, j.cur)); }
    else { j.closed = today(); upsert(j); log(j, 'close'); X.toast('ปิดงานแล้ว'); }
    renderJobDetail(); render();
  }

  /* ---------- settings sheet ---------- */
  function openSettings() {
    const s = S(); setf = { urgentDays: s.urgentDays, steps: s.steps.join('\n') };
    $('#tdSetT').textContent = 'ตั้งค่างาน';
    renderSetForm(); $('#tdSet').hidden = false;
  }
  function renderSetForm() {
    const days = [1, 2, 3, 5, 7].map((n) => '<button type="button" class="chip" data-ta="surg" data-tv="' + n + '" aria-pressed="' + (setf.urgentDays === n) + '">' + n + ' วัน</button>').join('');
    $('#tdSet .sheet-body').innerHTML =
      '<div class="field"><span>นับว่า “เร่งด่วน” เมื่อเหลือไม่เกิน</span><div class="chips">' + days + '</div><small class="td-hint">งานที่เลยกำหนดนับเป็นเร่งด่วนเสมอ</small></div>' +
      '<label class="field"><span>ขั้นตอนตั้งต้นของงาน MEA (บรรทัดละ 1 ขั้น)</span><textarea id="tsSteps" rows="9">' + esc(setf.steps) + '</textarea></label>' +
      '<small class="td-hint">ใช้กับงานที่สร้างใหม่ งานเดิมแก้ขั้นตอนได้ในหน้างานนั้น</small>';
  }
  function saveSet() {
    const ta = $('#tsSteps'); const steps = (ta ? ta.value : setf.steps).split('\n').map((x) => x.trim()).filter(Boolean);
    if (!steps.length) { X.toast('ต้องมีอย่างน้อย 1 ขั้นตอน'); return; }
    saveSettings({ urgentDays: setf.urgentDays, steps }); closeSheet('tdSet'); render(); X.toast('บันทึกแล้ว');
  }

  /* ---------- shell ---------- */
  function closeSheet(id) { const s = $('#' + id); if (s) s.hidden = true; if (id === 'tdTask') tf = null; if (id === 'tdJobEdit') jf = null; if (id === 'tdSend') sf = null; if (id === 'tdJob') openJobId = null; armed = ''; }
  function render() {
    if (!ready) return;
    if (mode === 'todo') {
      const el = $('#tview-' + tab); if (el) ({ today: renderToday, week: renderWeek, matrix: renderMatrix, jobs: renderJobs })[tab](el);
    }
    if (openJobId && !$('#tdJob').hidden) renderJobDetail();
  }
  function setTab(t) {
    tab = t;
    $$('[data-tdtab]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tdtab === t)));
    ['today', 'week', 'matrix', 'jobs'].forEach((v) => { $('#tview-' + v).hidden = v !== t; });
    try { localStorage.setItem('inex-td-tab', t); } catch (e) { /* private mode */ }
    render(); window.scrollTo(0, 0);
  }
  function enter() {
    if (window.BODY && window.BODY.setMode) window.BODY.setMode('money');
    mode = 'todo';
    document.body.classList.add('mode-todo');
    $('#todoMain').hidden = false; $('#todoTabs').hidden = false;
    const b = $('#todoBtn'); b.textContent = '฿'; b.setAttribute('aria-label', 'กลับไปโหมดการเงิน');
    try { localStorage.setItem('inex-mode', 'todo'); } catch (e) { /* private mode */ }
    if (X.closeQuick) X.closeQuick();
    render(); window.scrollTo(0, 0);
  }
  function leave(keepPref) {
    if (mode !== 'todo') return;
    mode = 'money';
    document.body.classList.remove('mode-todo');
    $('#todoMain').hidden = true; $('#todoTabs').hidden = true;
    const b = $('#todoBtn'); b.textContent = 'งาน'; b.setAttribute('aria-label', 'สลับไปโหมดงาน (To Do)');
    if (!keepPref) { try { localStorage.setItem('inex-mode', 'money'); } catch (e) { /* private mode */ } }
    window.scrollTo(0, 0);
  }
  function arm(key, rerender) { if (armed === key) return true; armed = key; clearTimeout(armT); armT = setTimeout(() => { if (armed === key) { armed = ''; rerender(); } }, 3500); rerender(); return false; }

  function mountUI() {
    const mb = $('#modeBtn');
    const tb = document.createElement('button');
    tb.className = 'mode-btn td-btn'; tb.id = 'todoBtn'; tb.type = 'button'; tb.textContent = 'งาน'; tb.setAttribute('aria-label', 'สลับไปโหมดงาน (To Do)');
    if (mb && mb.parentNode) mb.parentNode.insertBefore(tb, mb);
    const main = document.createElement('div'); main.id = 'todoMain'; main.hidden = true;
    main.innerHTML = '<section id="tview-today"></section><section id="tview-week" hidden></section><section id="tview-matrix" hidden></section><section id="tview-jobs" hidden></section>';
    const app = $('.app'); if (app) app.appendChild(main);
    const nav = document.createElement('nav'); nav.className = 'tabs b-tabs t-tabs'; nav.id = 'todoTabs'; nav.hidden = true; nav.setAttribute('aria-label', 'เมนูงาน');
    nav.innerHTML = '<div class="tabs-in"><button class="btab" type="button" data-tdtab="today" aria-selected="true">' + ICON.today + 'วันนี้</button><button class="btab" type="button" data-tdtab="week" aria-selected="false">' + ICON.week + '7 วัน</button>' +
      '<button class="b-add" type="button" data-ta="new" aria-label="เพิ่มงาน">' + ICON.plus + '</button>' +
      '<button class="btab" type="button" data-tdtab="matrix" aria-selected="false">' + ICON.matrix + 'เมทริกซ์</button><button class="btab" type="button" data-tdtab="jobs" aria-selected="false">' + ICON.jobs + 'งาน MEA</button></div>';
    document.body.appendChild(nav);
    // order matters: later sheets stack above earlier ones (task / send / edit open on top of a job)
    [['tdJob', false], ['tdTask', true], ['tdSend', true], ['tdJobEdit', true], ['tdSet', true]].forEach(([id, withSave]) => {
      const d = document.createElement('div'); d.id = id; d.className = 'sheet td-sheet'; d.hidden = true;
      d.setAttribute('role', 'dialog'); d.setAttribute('aria-modal', 'true'); d.setAttribute('aria-labelledby', id + 'T');
      d.innerHTML = '<div class="sheet-head"><button class="ghost" type="button" data-ta="close" data-tv="' + id + '">' + (withSave ? 'ยกเลิก' : 'ปิด') + '</button><h2 id="' + id + 'T"></h2>' +
        (withSave ? '<button class="save b-save" type="button" data-ta="save" data-tv="' + id + '">บันทึก</button>' : '<span class="spacer"></span>') + '</div><div class="sheet-body"></div>';
      document.body.appendChild(d);
    });
  }

  /* ---------- events ---------- */
  document.addEventListener('click', (ev) => {
    const b = ev.target.closest('button'); if (!b) return;
    if (b.id === 'todoBtn') { if (mode === 'todo') leave(); else enter(); return; }
    const ds = b.dataset;
    if (ds.tdtab) { setTab(ds.tdtab); return; }
    const a = ds.ta; if (!a) return;
    const v = ds.tv;
    switch (a) {
      case 'new': openTask(null, tab === 'jobs' ? { area: 'mea' } : null); return;
      case 'filter': filter = v; try { localStorage.setItem('inex-td-filter', v); } catch (e) { /* */ } render(); return;
      case 'done': toggleDone(v); return;
      case 'edit': openTask(v); return;
      case 'job': if (tf && !$('#tdTask').hidden) closeSheet('tdTask'); openJobId = v; armed = ''; renderJobDetail(); $('#tdJob').scrollTop = 0; return;
      case 'wday': weekSel = Number(v) || 0; render(); return;
      case 'settings': openSettings(); return;
      case 'newjob': openJobEdit(null); return;
      case 'close': closeSheet(v); if (v !== 'tdJob' && openJobId) renderJobDetail(); return;
      case 'save': ({ tdTask: saveTask, tdJobEdit: saveJob, tdSend: saveSend, tdSet: saveSet })[v](); return;
      // task form
      case 'tarea': readTask(); tf.area = v; renderTaskForm(); return;
      case 'tjob': { readTask(); tf.job = v; const j = jobById(v); tf.step = j ? j.cur : null; renderTaskForm(); return; }
      case 'tstep': readTask(); tf.step = Number(v); renderTaskForm(); return;
      case 'tdue': readTask(); tf.due = v; if (!v) tf.time = ''; renderTaskForm(); return;
      case 'timp': readTask(); tf.imp = !tf.imp; renderTaskForm(); return;
      case 'trep': readTask(); tf.rep = v; renderTaskForm(); return;
      case 'tsubok': { readTask(); const s = tf.subs.find((x) => x.id === v); if (s) s.ok = !s.ok; renderTaskForm(); return; }
      case 'tsubdel': readTask(); tf.subs = tf.subs.filter((x) => x.id !== v); renderTaskForm(); return;
      case 'tsubadd': addSub(); return;
      case 'tdone': { readTask(); if (!tf.id) return; const t = T.tasks.find((x) => x.id === tf.id); if (!t) return; closeSheet('tdTask'); toggleDone(t.id); return; }
      case 'tdel': if (!arm('task', () => { if (tf) { readTask(); renderTaskForm(); } })) return; { const id = tf.id; closeSheet('tdTask'); removeItem(id); render(); X.toast('ลบแล้ว'); } return;
      // job detail
      case 'editjob': openJobEdit(openJobId); return;
      case 'send': openSend(); return;
      case 'back': backDoc(); return;
      case 'stepdone': stepDone(); return;
      case 'newstep': { const j = jobById(openJobId); if (j) openTask(null, { area: 'mea', job: j.id, step: Number(v) }); return; }
      case 'closejob': { const j = jobById(openJobId); if (!j) return; j.closed = today(); upsert(j); log(j, 'close'); renderJobDetail(); render(); X.toast('ปิดงานแล้ว'); return; }
      case 'reopen': { const j = jobById(openJobId); if (!j) return; j.closed = ''; upsert(j); log(j, 'reopen'); renderJobDetail(); render(); return; }
      case 'dellog': if (!arm('log:' + v, renderJobDetail)) return; removeItem(v); armed = ''; renderJobDetail(); return;
      case 'deljob': {
        if (!arm('job', renderJobDetail)) return;
        const id = openJobId;
        T.tasks.filter((t) => t.job === id).forEach((t) => { t.job = ''; t.step = null; upsert(t); });
        T.logs.filter((l) => l.job === id).forEach((l) => removeItem(l.id));
        removeItem(id); closeSheet('tdJob'); render(); X.toast('ลบงานแล้ว · งานย่อยที่ผูกไว้ยังอยู่ในรายการ');
        return;
      }
      // job form
      case 'jsadd': readJob(); jf.steps.push({ n: '', due: '', done: '' }); renderJobForm(); setTimeout(() => { const i = $('#tjS' + (jf.steps.length - 1)); if (i) i.focus(); }, 30); return;
      case 'jsdel': { readJob(); const i = Number(v); if (jf.steps.length < 2) return; jf.steps.splice(i, 1); if (jf.cur >= jf.steps.length) jf.cur = jf.steps.length - 1; else if (jf.cur > i) jf.cur -= 1; renderJobForm(); return; }
      case 'jcur': readJob(); jf.cur = Number(v); renderJobForm(); return;
      // send form
      case 'sto': readSend(); sf.to = v; renderSendForm(); return;
      case 'sfol': readSend(); sf.follow = v; renderSendForm(); return;
      // settings
      case 'surg': { const ta = $('#tsSteps'); if (ta) setf.steps = ta.value; setf.urgentDays = Number(v); renderSetForm(); return; }
      default:
    }
  });
  function addSub() {
    readTask(); const i = $('#tdSubNew'); const x = i ? i.value.trim() : '';
    if (!x) { if (i) i.focus(); return; }
    tf.subs.push({ id: 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 4), x, ok: false });
    renderTaskForm(); const n = $('#tdSubNew'); if (n) n.focus();
  }
  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter' && ev.target && ev.target.id === 'tdSubNew') { ev.preventDefault(); addSub(); return; }
    if (ev.key === 'Enter' && ev.target && ev.target.id === 'tdTitle') { ev.preventDefault(); saveTask(); return; }
    if (ev.key !== 'Escape') return;
    for (const id of ['tdSet', 'tdJobEdit', 'tdSend', 'tdTask', 'tdJob']) { const s = $('#' + id); if (s && !s.hidden) { closeSheet(id); if (id !== 'tdJob' && openJobId) renderJobDetail(); return; } }
  });
  document.addEventListener('change', (ev) => {
    const t = ev.target;
    if ((t.id === 'tdDue' || t.id === 'tdTime') && tf) { readTask(); renderTaskForm(); }
    if (t.id === 'tsD' && sf) { readSend(); renderSendForm(); }
  });
  function handleHash() {
    const h = (location.hash || '').replace('#', '');
    if (h === 'todo' || h === 'task') { enter(); return true; }
    if (h === 'todo-add') { enter(); openTask(null); return true; }
    return false;
  }
  window.addEventListener('hashchange', handleHash);

  window.TODO = {
    applyRemote, enqueueAll, exportData, importData, leave,
    count: () => T.tasks.length + T.jobs.length + T.logs.length,
    active: () => { try { return localStorage.getItem('inex-mode') === 'todo'; } catch (e) { return false; } },
  };

  mountUI();
  try { filter = localStorage.getItem('inex-td-filter') || 'all'; if (filter !== 'all' && !AREAS[filter]) filter = 'all'; } catch (e) { /* */ }
  try { const t = localStorage.getItem('inex-td-tab'); if (['today', 'week', 'matrix', 'jobs'].includes(t)) tab = t; } catch (e) { /* */ }
  $$('[data-tdtab]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tdtab === tab)));
  ['today', 'week', 'matrix', 'jobs'].forEach((v) => { $('#tview-' + v).hidden = v !== tab; });
  if (window.TODO.active()) enter();
  X.ready().then(async () => {
    const v = await X.kvGet('todo');
    if (v && typeof v === 'object') T = { tasks: Array.isArray(v.tasks) ? v.tasks : [], jobs: Array.isArray(v.jobs) ? v.jobs : [], logs: Array.isArray(v.logs) ? v.logs : [], settings: v.settings || null };
    ready = true;
    pending.splice(0).forEach(applyRemote);
    render(); handleHash();
  });
})();
