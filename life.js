/* iN&Ex · หน้าแรก (home) + สลับโหมด + ค้นหา + ต่ออายุ + ซื้อของ + ลดหย่อนภาษี + ตั้งค่า
   - Owns which mode is on screen: home | money | todo | body (kcal). Money/kcal/To Do keep their own screens.
   - Data lives in IndexedDB key "life"; syncs through the existing Sheet as meta docs "life:*"
     (r = ต่ออายุ, s = ซื้อของ, x = ลดหย่อนที่กรอกเอง, settings). Money data is only read, except
     "ลงรายจ่าย" from the shopping list, which goes through the same store.add('expenses') path as the expense form. */
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
  const diff = (a, b) => Math.round((parseD(b) - parseD(a)) / 864e5);
  const today = () => X.todayISO();
  const TH_M = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
  const TH_MS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  const TH_D = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];
  const dmy = (s) => { const d = parseD(s); return d.getDate() + ' ' + TH_MS[d.getMonth()]; };
  const dmyY = (s) => { const d = parseD(s); return d.getDate() + ' ' + TH_MS[d.getMonth()] + ' ' + String((d.getFullYear() + 543) % 100).padStart(2, '0'); };
  const longD = (s) => { const d = parseD(s); return TH_D[d.getDay()] + ' ' + d.getDate() + ' ' + TH_M[d.getMonth()]; };
  const fmtB = (n) => (Math.round(Number(n) || 0)).toLocaleString('th-TH');
  const num = (v) => { const n = Number(String(v == null ? '' : v).replace(/[, ]/g, '')); return isFinite(n) ? n : 0; };
  const nid = (k) => k + ':' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : v; } catch (e) { return d; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } };

  const MODES = {
    money: { name: 'เงิน', sub: 'รายรับ รายจ่าย เดินทาง ลงทุน', c: '#C9A46A', soft: '#2A2419', mark: '฿' },
    todo: { name: 'To Do List', sub: 'งาน MEA · เรียน · ส่วนตัว', c: '#C9F24A', soft: '#1B2110', mark: '✓' },
    body: { name: 'แคลอรี่', sub: 'อาหาร น้ำหนัก ออกกำลังกาย', c: '#6FD3C2', soft: '#10221F', mark: 'kc' },
  };
  const MEA = '#F47B20', LATE = '#F08A80', BLUE = '#8AB8FF', GOLD = '#C9A46A', LIME = '#C9F24A', TEAL = '#6FD3C2';
  const AREA_C = { mea: MEA, study: BLUE, me: '#E2C17A' };
  const ICO = {
    chev: '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg>',
    down: '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>',
    up: '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M6 15l6-6 6 6"/></svg>',
    search: '<svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>',
    x: '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    check: '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M5 12l5 5 9-10"/></svg>',
    gear: '<svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1L7 17M17 7l2.1-2.1"/></svg>',
  };

  /* ---------- data ---------- */
  const DEF_SET = {
    start: 'home', fixed: 'todo', quick: true, taxTags: {},
    notify: {
      cal: { on: true, due: true, follow: true, contract: true, renew: true, impOnly: false, m0730: true, d1: true },
      mail: { on: true, time: '07:00', days: 'weekdays', today: true, follow: true, contract: true, money: true, kcal: false },
    },
  };
  let L = { renew: [], shop: [], tax: [], settings: null };
  let ready = false;
  const pending = [];
  const KIND = { r: 'renew', s: 'shop', x: 'tax' };
  const S = () => { const s = Object.assign({}, clone(DEF_SET), L.settings || {}); s.notify = { cal: Object.assign({}, DEF_SET.notify.cal, (s.notify || {}).cal || {}), mail: Object.assign({}, DEF_SET.notify.mail, (s.notify || {}).mail || {}) }; s.taxTags = s.taxTags || {}; return s; };
  const save = () => X.kvSet('life', L);
  function pushItem(it) { const doc = Object.assign({}, it, { _t: Date.now() }); delete doc.id; X.enqueue('meta', 'life:' + it.id, 'put', doc); }
  function upsert(it) { const a = L[KIND[it.id.split(':')[0]]]; const i = a.findIndex((x) => x.id === it.id); if (i >= 0) a[i] = it; else a.push(it); save(); pushItem(it); }
  function removeItem(id) { const k = KIND[id.split(':')[0]]; L[k] = L[k].filter((x) => x.id !== id); save(); X.enqueue('meta', 'life:' + id, 'del', null); }
  function saveSettings(patch) { L.settings = Object.assign({}, S(), patch, { _t: Date.now() }); save(); X.enqueue('meta', 'life:settings', 'put', L.settings); lsSet('inex-start', L.settings.start); lsSet('inex-start-fixed', L.settings.fixed); }
  function applyRemote(r) {
    if (!ready) { pending.push(r); return; }
    const id = String(r.id).slice(5);
    if (id === 'settings') { if (!r.deleted && r.doc) { L.settings = Object.assign({}, r.doc); lsSet('inex-start', L.settings.start || 'home'); lsSet('inex-start-fixed', L.settings.fixed || 'todo'); } }
    else {
      const k = KIND[id.split(':')[0]]; if (!k) return;
      const i = L[k].findIndex((x) => x.id === id);
      if (r.deleted) { if (i >= 0) L[k].splice(i, 1); } else if (r.doc) { const row = Object.assign({}, r.doc, { id }); if (i >= 0) L[k][i] = row; else L[k].push(row); }
    }
    save(); refresh();
  }
  function enqueueAll() { if (L.settings) X.enqueue('meta', 'life:settings', 'put', L.settings); ['renew', 'shop', 'tax'].forEach((k) => L[k].forEach(pushItem)); }
  function exportData() { return clone(L); }
  async function importData(j) {
    let n = 0;
    if (j && j.settings) { L.settings = j.settings; n++; }
    ['renew', 'shop', 'tax'].forEach((k) => (Array.isArray(j && j[k]) ? j[k] : []).forEach((it) => { if (!it || !it.id) return; const i = L[k].findIndex((x) => x.id === it.id); if (i >= 0) L[k][i] = it; else L[k].push(it); n++; }));
    await save(); enqueueAll(); refresh(); return n;
  }

  /* ---------- mode switching ---------- */
  const home = () => $('#lfHome');
  function curMode() { const b = document.body.classList; return b.contains('mode-home') ? 'home' : b.contains('mode-todo') ? 'todo' : b.contains('mode-body') ? 'body' : 'money'; }
  function setMode(m, opt) {
    closeSwitch();
    if (m === 'home') {
      if (window.TODO && window.TODO.isOn()) window.TODO.leave(true);
      if (window.BODY && window.BODY.isOn()) { const keep = lsGet('inex-mode', 'money'); window.BODY.setMode('money'); lsSet('inex-mode', keep); }
      document.body.classList.add('mode-home'); home().hidden = false;
      if (X.closeQuick) X.closeQuick();
      renderHome(true);
    } else {
      document.body.classList.remove('mode-home'); home().hidden = true;
      if (m === 'todo') window.TODO.enter(opt && opt.tab);
      else if (m === 'body') window.BODY.setMode('body');
      else { if (window.TODO && window.TODO.isOn()) window.TODO.leave(); if (window.BODY && window.BODY.isOn()) window.BODY.setMode('money'); lsSet('inex-mode', 'money'); }
      lsSet('inex-last', m);
      if (m === 'money' && opt && opt.tab) X.showTab(opt.tab);
      window.scrollTo(0, 0);
    }
    updateChip();
  }
  function updateChip() {
    const m = curMode(); const c = $('#modeChip'); if (!c || m === 'home') return;
    const M = MODES[m];
    c.innerHTML = '<span class="lf-chip-ic" style="--c:' + M.c + ';--s:' + M.soft + '">' + M.mark + '</span>' + M.name + ICO.down;
    c.setAttribute('aria-label', 'สลับโหมด ตอนนี้อยู่โหมด' + M.name);
  }
  function openSwitch() {
    const m = curMode(); const sw = $('#lfSwitch');
    const sum = summaries();
    const rows = [['home', 'หน้าแรก', 'ภาพรวมทุกโหมด + เพิ่มด่วน', '#ECE8E1', '#1D2125', 'iE']].concat(['money', 'todo', 'body'].map((k) => [k, MODES[k].name, sum[k].line, MODES[k].c, MODES[k].soft, MODES[k].mark]));
    $('#lfSwitch .lf-sheet-in').innerHTML = '<span class="lf-grab" aria-hidden="true"></span><div class="lf-sw-h"><b>ไปที่โหมด</b></div>' +
      rows.map(([id, name, sub, c, soft, mark]) => '<button type="button" class="lf-sw-row' + (id === m ? ' cur' : '') + '" data-lf="mode" data-v="' + id + '"' + (id === m ? ' aria-current="page"' : '') + '><span class="lf-chip-ic big" style="--c:' + c + ';--s:' + soft + '">' + mark + '</span><span><b>' + name + '</b><small>' + esc(sub) + '</small></span>' + (id === m ? '<em style="color:' + c + '">อยู่ที่นี่</em>' : '') + '</button>').join('');
    sw.hidden = false; requestAnimationFrame(() => sw.classList.add('open'));
  }
  function closeSwitch() { const sw = $('#lfSwitch'); if (!sw || sw.hidden) return; sw.classList.remove('open'); setTimeout(() => { sw.hidden = true; }, 220); }

  /* ---------- summaries ---------- */
  function moneySum() {
    if (!X.isLoaded()) return null;
    const snap = X.snapshot(); const td = today(); const ym = td.slice(0, 7);
    const mine = snap.expenses.filter((e) => !e.reimb);
    const month = mine.filter((e) => String(e.date || '').slice(0, 7) === ym);
    const tday = mine.filter((e) => e.date === td);
    return { month: month.reduce((s, e) => s + num(e.amount), 0), today: tday.reduce((s, e) => s + num(e.amount), 0), todayN: tday.length, snap };
  }
  function summaries() {
    const ms = moneySum(); const ts = window.TODO && window.TODO.ready() ? window.TODO.summary() : null; const ks = window.BODY && window.BODY.summary ? window.BODY.summary() : null;
    return {
      money: { v: ms ? '฿' + fmtB(ms.month) : '–', vs: ms ? '฿' + fmtB(ms.month) : '–', k: 'ใช้ไปเดือนนี้', side: ms ? 'วันนี้ ฿' + fmtB(ms.today) + ' · ' + ms.todayN + ' รายการ' : '', line: ms ? 'ใช้เดือนนี้ ฿' + fmtB(ms.month) : '' },
      todo: { v: ts ? ts.due + ' งาน' : '–', vs: ts ? ts.due + ' งาน' : '–', k: 'ครบ/ค้างวันนี้', side: ts ? (ts.overdue ? 'เลยกำหนด ' + ts.overdue : 'ไม่มีงานเลยกำหนด') + (ts.next ? ' · ต่อไป: ' + ts.next : '') : '', line: ts ? 'ค้างวันนี้ ' + ts.due + (ts.overdue ? ' · เลยกำหนด ' + ts.overdue : '') : '' },
      body: { v: ks ? fmtB(ks.remaining) + ' kcal' : '–', vs: ks ? fmtB(ks.remaining) : '–', k: ks && ks.remaining < 0 ? 'เกินวันนี้' : 'เหลือวันนี้', side: ks ? 'กินไป ' + fmtB(ks.eaten) + ' จาก ' + fmtB(ks.target) : '', line: ks ? 'เหลือวันนี้ ' + fmtB(ks.remaining) + ' kcal' : '' },
    };
  }

  /* ---------- home: launcher that morphs into "วันนี้ของฉัน" as you scroll ---------- */
  const QUICK = [
    { t: 'รายจ่าย', c: GOLD, act: 'q-expense' }, { t: 'เดินทาง', c: GOLD, act: 'q-transit' }, { t: 'งาน', c: LIME, act: 'q-task' },
    { t: 'ซื้อของ', c: GOLD, act: 'q-shop' }, { t: 'อาหาร', c: TEAL, act: 'q-food' },
  ];
  const CARD_Q = { money: [['รายจ่าย', 'q-expense'], ['เดินทาง', 'q-transit']], todo: [['งาน', 'q-task'], ['งาน MEA', 'q-mea']], body: [['อาหาร', 'q-food'], ['น้ำหนัก', 'q-weight']] };
  let geo = null, raf = 0;
  function measure() {
    const h = home(); const sc = h.querySelector('.lf-scroll');
    const W = Math.min(h.clientWidth, 720); const off = (h.clientWidth - W) / 2; const H = h.clientHeight;
    const probe = $('#lfSafe'); const safe = probe ? probe.getBoundingClientRect().height : 0;
    const inner = W - 32; const top = safe + 12;
    const bigTop = top + 74; const gap = 12;
    const bigH = Math.max(118, Math.min(204, Math.floor((H - bigTop - 72) / 3) - gap));
    const smW = (inner - 16) / 3; const smTop = top + 122; const smH = 116;
    const chipsTop = smTop + smH + 12; const flowCompact = chipsTop + 40 + 18;
    const bigBottom = bigTop + 3 * (bigH + gap);
    const flowStart = Math.max(bigBottom + 8, flowCompact + 120);
    const pin = flowStart - flowCompact;
    geo = { W, off, H, top, bigTop, bigH, gap, inner, smW, smTop, smH, chipsTop, flowCompact, bigBottom, flowStart, pin, sc };
    h.style.setProperty('--lf-pin', pin + 'px');
    h.style.setProperty('--lf-inner', inner + 'px');
    h.style.setProperty('--lf-off', off + 'px');
    h.querySelector('.lf-flow').style.paddingTop = flowStart + 'px';
    h.querySelector('.lf-flow-in').style.minHeight = Math.max(0, H - flowCompact + 24) + 'px';
    h.querySelector('.lf-snap1').style.top = pin + 'px';
    h.classList.toggle('short', bigH < 186); h.classList.toggle('tiny', bigH < 146);
    paint();
  }
  const clamp = (v) => Math.max(0, Math.min(1, v));
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const lerp = (a, b, t) => a + (b - a) * t;
  function paint() {
    raf = 0; if (!geo) return;
    const g = geo; const h = home(); const p = clamp(g.sc.scrollTop / g.pin);
    let lowest = 0;
    $$('#lfHome .lf-card').forEach((el, i) => {
      const t = ease(clamp((p - i * 0.07) / 0.86));
      const x = g.off + 16 + lerp(0, i * (g.smW + 8), t), y = lerp(g.bigTop + i * (g.bigH + g.gap), g.smTop, t);
      el.style.transform = 'translate3d(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px,0)';
      el.style.width = lerp(g.inner, g.smW, t).toFixed(1) + 'px'; el.style.height = lerp(g.bigH, g.smH, t).toFixed(1) + 'px';
      el.style.borderRadius = lerp(22, 18, t).toFixed(1) + 'px';
      lowest = Math.max(lowest, y + lerp(g.bigH, g.smH, t));
      el.classList.toggle('is-small', t > 0.5);
    });
    const fade = (a, b) => ease(clamp((p - a) / (b - a)));
    h.style.setProperty('--lf-big', (1 - clamp(p / 0.5)).toFixed(3));
    h.style.setProperty('--lf-small', fade(0.25, 0.7).toFixed(3));
    const s = fade(0.5, 1), c = fade(0.62, 1);
    const se = h.querySelector('.lf-search'); se.style.opacity = s.toFixed(3); se.style.transform = 'translate3d(' + (g.off + 16) + 'px,' + (g.top + 64 + (1 - s) * -14).toFixed(1) + 'px,0)'; se.style.width = g.inner + 'px'; se.style.pointerEvents = s > 0.5 ? 'auto' : 'none';
    const ch = h.querySelector('.lf-chips'); ch.style.opacity = c.toFixed(3); ch.style.transform = 'translate3d(' + (g.off + 16) + 'px,' + (g.chipsTop + (1 - c) * 16).toFixed(1) + 'px,0)'; ch.style.width = g.inner + 'px'; ch.style.pointerEvents = c > 0.5 ? 'auto' : 'none';
    const hd = h.querySelector('.lf-head'); hd.style.transform = 'translate3d(' + (g.off + 18) + 'px,' + g.top + 'px,0)'; hd.style.width = (g.inner - 4) + 'px';
    const bg = h.querySelector('.lf-deckbg'); bg.style.height = Math.max(lerp(g.H, g.flowCompact - 6, ease(p)), Math.max(lowest + 10, g.flowCompact - 6)).toFixed(1) + 'px';
    const hint = h.querySelector('.lf-hint'); hint.style.opacity = (1 - clamp(p / 0.2)).toFixed(3); hint.style.transform = 'translate3d(0,' + (Math.min(g.bigBottom + 6, g.H - 64)).toFixed(1) + 'px,0)';
    const fl = h.querySelector('.lf-flow'); fl.style.setProperty('--lf-in', fade(0.55, 1).toFixed(3));
  }
  function onScroll() { if (!raf) raf = requestAnimationFrame(paint); }

  function cardHTML(k, sum) {
    const M = MODES[k]; const s = sum[k];
    return '<div class="lf-card" style="--c:' + M.c + ';--s:' + M.soft + '">' +
      '<button type="button" class="lf-card-hit" data-lf="mode" data-v="' + k + '" aria-label="เข้าโหมด' + M.name + '"></button>' +
      '<div class="lf-big"><div class="lf-big-h"><span class="lf-chip-ic big">' + M.mark + '</span><span><b>' + M.name + '</b><small>' + M.sub + '</small></span>' + ICO.chev + '</div>' +
      '<div class="lf-big-n"><span><small>' + s.k + '</small><b>' + esc(s.v) + '</b></span><em>' + esc(s.side) + '</em></div>' +
      (S().quick ? '<div class="lf-big-q">' + CARD_Q[k].map(([t, a]) => '<button type="button" data-lf="' + a + '"><i>+</i>' + t + '</button>').join('') + '</div>' : '') + '</div>' +
      '<div class="lf-small"><span class="lf-chip-ic">' + M.mark + '</span><b>' + M.name + '</b><span><em>' + esc(s.vs) + '</em><small>' + s.k + '</small></span></div></div>';
  }
  function timeline() {
    const td = today(); const out = [];
    if (window.TODO && window.TODO.ready()) window.TODO.todayItems().forEach((it) => out.push({ time: it.time, tc: it.late ? LATE : '#ECE8E1', c: it.kind === 'follow' ? BLUE : (AREA_C[it.area] || LIME), t: it.title, s: it.sub, act: it.kind === 'follow' ? 'open-job' : 'open-task', v: it.id }));
    if (X.isLoaded()) X.bills(td.slice(0, 7)).filter((b) => b.date === td && !b.done).forEach((b) => out.push({ time: 'วันนี้', tc: '#ECE8E1', c: GOLD, t: b.name, s: 'บิล/ผ่อน · ฿' + fmtB(b.amt), act: 'go-bills', v: '' }));
    renewDue().forEach((r) => out.push({ time: diff(td, r.exp) < 0 ? 'หมดแล้ว' : diff(td, r.exp) + ' วัน', tc: diff(td, r.exp) <= 7 ? LATE : '#ECE8E1', c: LIME, t: 'ต่ออายุ ' + r.t, s: 'หมด ' + dmyY(r.exp), act: 'renew', v: '' }));
    const shop = L.shop.filter((x) => !x.done);
    if (shop.length) out.push({ time: 'ซื้อ', tc: '#ECE8E1', c: GOLD, t: 'ต้องซื้อ ' + shop.length + ' รายการ', s: shop.slice(0, 3).map((x) => x.t).join(', ') + (shop.length > 3 ? ', …' : ''), act: 'shop', v: '' });
    return out;
  }
  function upcomingList() {
    const td = today(); const out = [];
    if (window.TODO && window.TODO.ready()) window.TODO.upcoming(30).forEach((u) => out.push({ k: u.k, t: u.t, date: u.date, c: AREA_C[u.area] || LIME, act: u.job ? 'open-job' : 'open-task', v: u.job || u.task }));
    L.renew.filter((r) => r.exp && diff(td, r.exp) > 0 && diff(td, r.exp) <= 30 && !renewDue().includes(r)).forEach((r) => out.push({ k: 'ต่ออายุ', t: r.t, date: r.exp, c: LIME, act: 'renew', v: '' }));
    const m = Number(td.slice(5, 7));
    if (m >= 9) { const end = td.slice(0, 4) + '-12-31'; const room = taxModel(); if (room && room.roomTotal > 0) out.push({ k: 'ลดหย่อนภาษี', t: 'ยังใช้สิทธิได้อีก ฿' + fmtB(room.roomTotal), date: end, c: GOLD, act: 'tax', v: '' }); }
    return out.sort((a, b) => a.date.localeCompare(b.date));
  }
  function renderHome(resetScroll) {
    const h = home(); if (!h || h.hidden) return;
    const sum = summaries(); const td = today();
    h.querySelector('.lf-head').innerHTML = '<span>' + longD(td) + '</span><b>iN&amp;Ex</b><button type="button" class="lf-sync" data-lf="sync" aria-label="สถานะซิงก์"><i class="' + syncCls() + '"></i>' + esc(syncTxt()) + '</button>';
    h.querySelector('.lf-cards').innerHTML = ['money', 'todo', 'body'].map((k) => cardHTML(k, sum)).join('');
    h.querySelector('.lf-chips').innerHTML = S().quick ? QUICK.map((q) => '<button type="button" data-lf="' + q.act + '"><i style="color:' + q.c + '">+</i>' + q.t + '</button>').join('') : '';
    const tl = timeline(); const up = upcomingList();
    h.querySelector('.lf-flow-in').innerHTML =
      '<section class="lf-sec"><div class="lf-sec-h"><b>วันนี้ของฉัน</b><span>' + longD(td) + '</span></div>' +
      (tl.length ? '<div class="lf-tl">' + tl.map((r, i) => '<button type="button" class="lf-tl-r" data-lf="' + r.act + '" data-v="' + esc(r.v) + '" style="--d:' + i + '"><span class="lf-tl-t" style="color:' + r.tc + '">' + esc(r.time) + '</span><i style="background:' + r.c + '"></i><span class="lf-tl-x"><b>' + esc(r.t) + '</b><small>' + esc(r.s) + '</small></span></button>').join('') + '</div>'
        : '<div class="lf-empty">วันนี้ว่าง ไม่มีงานค้าง บิล หรือของที่ต้องซื้อ</div>') + '</section>' +
      '<section class="lf-sec"><div class="lf-sec-h"><b>ใกล้ถึง</b><span>30 วันข้างหน้า</span></div>' +
      (up.length ? '<div class="lf-up">' + up.map((r) => '<button type="button" class="lf-up-c" data-lf="' + r.act + '" data-v="' + esc(r.v) + '"><small style="color:' + r.c + '">' + esc(r.k) + '</small><b>' + esc(r.t) + '</b><em style="color:' + r.c + '">อีก ' + diff(td, r.date) + ' วัน</em></button>').join('') + '</div>'
        : '<div class="lf-empty">ยังไม่มีอะไรครบกำหนดใน 30 วัน</div>') + '</section>' +
      '<section class="lf-sec"><div class="lf-sec-h"><b>เครื่องมือ</b></div><div class="lf-tools">' +
      [['renew', 'ต่ออายุ', 'วันหมดอายุเอกสาร'], ['shop', 'ซื้อของ', 'ติ๊กแล้วลงรายจ่าย'], ['tax', 'ลดหย่อนภาษี', 'ปี ' + (Number(td.slice(0, 4)) + 543)], ['stats', 'สถิติงาน', 'งาน MEA'], ['settings', 'ตั้งค่า', 'หน้าแรก · แจ้งเตือน']].map(([a, t, s]) => '<button type="button" data-lf="' + a + '"><b>' + t + '</b><small>' + s + '</small></button>').join('') + '</div></section>';
    measure();
    if (resetScroll) geo.sc.scrollTop = 0;
  }
  function syncCls() { const d = $('#syncDot'); return d ? d.className.replace('sync-dot', '').trim() : 'off'; }
  function syncTxt() { const d = $('#syncDot'); const t = d ? (d.title || '') : ''; return X.syncConnected() ? (t.replace(/^ซิงก์แล้ว /, 'ซิงก์ ') || 'ซิงก์แล้ว') : 'ยังไม่เชื่อม Sheet'; }

  let refT = null;
  function refresh() { clearTimeout(refT); refT = setTimeout(() => { if (!home() || home().hidden) return; renderHome(false); autoRenewTasks(); }, 120); }

  /* ---------- ต่ออายุ ---------- */
  const WARN = [180, 90, 60, 30, 14, 7];
  function renewDue() { const td = today(); return L.renew.filter((r) => r.exp && diff(td, r.exp) <= Math.max(...(r.warn && r.warn.length ? r.warn : [30]))).sort((a, b) => a.exp.localeCompare(b.exp)); }
  function autoRenewTasks() {
    if (!window.TODO || !window.TODO.ready() || !ready) return;
    const td = today();
    renewDue().forEach((r) => {
      const key = 't:rn-' + r.id.slice(2) + '-' + r.exp;
      if (window.TODO.hasTask((t) => t.id === key)) return;
      if (diff(td, r.exp) < -30) return;
      window.TODO.createTask({ id: key, title: 'ต่ออายุ ' + r.t, area: 'me', due: diff(td, r.exp) > 7 ? addDays(r.exp, -7) : td, imp: true, note: 'จากรายการต่ออายุ · หมด ' + dmyY(r.exp) + (r.org ? ' · ' + r.org : '') });
    });
  }
  let rf = null;
  function openRenew() {
    const td = today(); const list = L.renew.slice().sort((a, b) => (a.exp || '9').localeCompare(b.exp || '9'));
    sheet('lfRenew', 'วันหมดอายุ / ต่ออายุ', false,
      '<p class="lf-note">เก็บแค่ชื่อรายการกับวันหมดอายุ ไม่ต้องใส่เลขบัตร · ใกล้ครบแล้วแอปสร้างงาน “ต่ออายุ …” ใน To Do List ให้เอง</p>' +
      '<button class="btn primary wide" type="button" data-lf="renew-new">+ เพิ่มรายการ</button>' +
      (list.length ? list.map((r) => {
        const n = r.exp ? diff(td, r.exp) : null; const warn = r.warn && r.warn.length ? r.warn : [30]; const soon = n != null && n <= Math.max(...warn);
        const pct = n == null ? 0 : Math.max(3, Math.min(100, Math.round(Math.min(Math.max(n, 0), 365) / 365 * 100)));
        return '<button type="button" class="lf-rn' + (soon ? ' soon' : '') + '" data-lf="renew-edit" data-v="' + r.id + '"><span class="lf-rn-h"><span><b>' + esc(r.t) + '</b><small>' + esc(r.org || '') + '</small></span><em>' + (n == null ? '—' : n < 0 ? 'หมดแล้ว ' + (-n) + ' วัน' : 'อีก ' + n + ' วัน') + '</em></span><i><s style="width:' + pct + '%"></s></i><span class="lf-rn-f"><span>หมด ' + (r.exp ? dmyY(r.exp) : '—') + '</span><span>เตือน ' + warn.join(' · ') + ' วัน</span></span></button>';
      }).join('') : '<div class="lf-empty">ยังไม่มีรายการ เช่น ใบอนุญาต ภาคีวิศวกร · ใบขับขี่ · หนังสือเดินทาง · กรมธรรม์</div>'));
  }
  function openRenewEdit(id) {
    const r = id && L.renew.find((x) => x.id === id);
    rf = r ? clone(r) : { id: '', t: '', org: '', exp: '', warn: [90, 30, 7] };
    renderRenewEdit(); $('#lfRenewEdit').hidden = false;
  }
  function renderRenewEdit() {
    const f = rf;
    sheet('lfRenewEdit', f.id ? 'แก้ไขรายการ' : 'เพิ่มรายการต่ออายุ', true,
      '<label class="field"><span>ชื่อรายการ</span><input id="rnT" value="' + esc(f.t) + '" placeholder="เช่น ใบอนุญาต ภาคีวิศวกร (โยธา)" autocomplete="off"></label>' +
      '<div class="chips">' + ['ใบอนุญาต ภาคีวิศวกร', 'ใบขับขี่', 'หนังสือเดินทาง', 'บัตรประชาชน', 'กรมธรรม์ประกัน', 'พ.ร.บ. / ภาษีรถ'].map((x) => '<button type="button" class="chip" data-lf="rn-pick" data-v="' + x + '">' + x + '</button>').join('') + '</div>' +
      '<label class="field"><span>หน่วยงาน / หมายเหตุ (ไม่บังคับ)</span><input id="rnO" value="' + esc(f.org) + '" autocomplete="off" placeholder="เช่น สภาวิศวกร"></label>' +
      '<label class="field"><span>วันหมดอายุ</span><input type="date" id="rnE" value="' + esc(f.exp) + '"></label>' +
      '<div class="field"><span>เตือนล่วงหน้า (วัน)</span><div class="chips">' + WARN.map((w) => '<button type="button" class="chip" data-lf="rn-warn" data-v="' + w + '" aria-pressed="' + f.warn.includes(w) + '">' + w + '</button>').join('') + '</div></div>' +
      (f.id ? '<button class="danger' + (armed === 'rn' ? ' armed' : '') + '" type="button" data-lf="rn-del">' + (armed === 'rn' ? 'แตะอีกครั้งเพื่อยืนยันการลบ' : 'ลบรายการนี้') + '</button>' : ''));
  }
  function readRenew() { if (!rf) return; const v = (s) => { const e = $(s); return e ? e.value : undefined; }; if (v('#rnT') != null) rf.t = v('#rnT'); if (v('#rnO') != null) rf.org = v('#rnO'); if (v('#rnE') != null) rf.exp = v('#rnE'); }
  function saveRenew() {
    readRenew(); const f = rf; f.t = String(f.t || '').trim(); f.org = String(f.org || '').trim();
    if (!f.t) { X.toast('ใส่ชื่อรายการ'); return; } if (!f.exp) { X.toast('ใส่วันหมดอายุ'); return; }
    if (!f.id) f.id = nid('r');
    f.warn = f.warn.slice().sort((a, b) => b - a);
    upsert(f); $('#lfRenewEdit').hidden = true; rf = null; openRenew(); refresh(); autoRenewTasks(); X.toast('บันทึกแล้ว');
  }

  /* ---------- ซื้อของ ---------- */
  let shopOpen = '';
  function lastPrice(t) { const k = String(t || '').trim().toLowerCase(); const prev = L.shop.filter((x) => x.done && x.price && String(x.t).trim().toLowerCase() === k).sort((a, b) => String(b.doneAt).localeCompare(String(a.doneAt)))[0]; return prev ? prev.price : ''; }
  function openShop(focus) {
    const td = today(); const todo = L.shop.filter((x) => !x.done).sort((a, b) => (a.created || 0) - (b.created || 0));
    const doneT = L.shop.filter((x) => x.done && x.doneAt === td); const doneOld = L.shop.filter((x) => x.done && x.doneAt !== td);
    const accts = X.accounts(); const cats = X.cats();
    sheet('lfShop', 'ต้องซื้อ', false,
      '<div class="lf-add"><span>+</span><input id="shNew" placeholder="เพิ่มของ เช่น ไข่ 1 แผง แล้วกด Enter" autocomplete="off" aria-label="เพิ่มของที่ต้องซื้อ"><button type="button" class="btn" data-lf="sh-add">เพิ่ม</button></div>' +
      (todo.length ? '<div class="panel lf-shop">' + todo.map((x) => {
        const open = shopOpen === x.id; const g = X.guess(x.t) || {}; const cat = x.cat || g.cat || 'other'; const lp = lastPrice(x.t);
        return '<div class="lf-sh"><div class="lf-sh-r"><button type="button" class="lf-box' + (open ? ' on' : '') + '" data-lf="sh-pick" data-v="' + x.id + '" aria-label="ซื้อแล้ว: ' + esc(x.t) + '"></button><span><b>' + esc(x.t) + '</b><small>' + esc((cats.find((c) => c.id === cat) || {}).name || '') + (lp ? ' · ครั้งก่อน ฿' + fmtB(lp) : '') + '</small></span><button type="button" class="lf-x" data-lf="sh-del" data-v="' + x.id + '" aria-label="ลบ ' + esc(x.t) + '">' + ICO.x + '</button></div>' +
          (open ? '<div class="lf-sh-buy"><small>ซื้อแล้ว · ลงรายจ่ายเลยไหม</small><label class="lf-amt"><span>฿</span><input id="shAmt" inputmode="decimal" value="' + esc(lp) + '" aria-label="ราคา" autocomplete="off"></label>' +
            '<div class="chips">' + accts.map((a, i) => '<button type="button" class="chip" style="--c:' + a.color + '" data-lf="sh-acct" data-v="' + a.id + '" aria-pressed="' + ((x.acct || (accts[0] && accts[0].id)) === a.id) + '"><i></i>' + esc(a.name) + '</button>').join('') + '</div>' +
            '<div class="chips">' + cats.filter((c) => ['food', 'shopping', 'health', 'other', 'housing', 'work'].includes(c.id)).map((c) => '<button type="button" class="chip" style="--c:' + c.color + '" data-lf="sh-cat" data-v="' + c.id + '" aria-pressed="' + (cat === c.id) + '"><i></i>' + esc(c.name) + '</button>').join('') + '</div>' +
            '<div class="lf-sh-act"><button type="button" class="btn primary" data-lf="sh-buy" data-v="' + x.id + '">ลงรายจ่าย</button><button type="button" class="btn" data-lf="sh-only" data-v="' + x.id + '">ติ๊กอย่างเดียว</button></div></div>' : '') + '</div>';
      }).join('') + '</div>' : '<div class="lf-empty">ไม่มีของที่ต้องซื้อ</div>') +
      (doneT.length ? '<div class="lf-sec-h"><b>ซื้อแล้ววันนี้</b></div><div class="panel lf-shop">' + doneT.map((x) => '<div class="lf-sh-r done"><span><b>' + esc(x.t) + '</b></span><em>' + (x.price ? '฿' + fmtB(x.price) : 'ไม่ลงรายจ่าย') + '</em><button type="button" class="lf-x" data-lf="sh-undo" data-v="' + x.id + '" aria-label="ยังไม่ได้ซื้อ ' + esc(x.t) + '">↺</button></div>').join('') + '</div>' : '') +
      (doneOld.length ? '<button class="ghost" type="button" data-lf="sh-clear">ล้างของที่ซื้อแล้ว ' + doneOld.length + ' รายการ</button>' : ''));
    if (focus) setTimeout(() => { const i = $('#shNew'); if (i) i.focus(); }, 60);
  }
  function addShop() { const i = $('#shNew'); const t = i ? i.value.trim() : ''; if (!t) { if (i) i.focus(); return; } const g = X.guess(t) || {}; upsert({ id: nid('s'), t, cat: g.cat || '', sub: g.sub || '', done: false, created: Date.now() }); openShop(true); refresh(); }
  async function buyShop(id, withExpense) {
    const x = L.shop.find((s) => s.id === id); if (!x) return;
    const it = clone(x);
    if (withExpense) {
      const amt = num($('#shAmt') ? $('#shAmt').value : '');
      if (!(amt > 0)) { X.toast('ใส่ราคาก่อน'); const a = $('#shAmt'); if (a) a.focus(); return; }
      const accts = X.accounts(); const acct = x.acct || (accts[0] && accts[0].id) || '';
      const g = X.guess(x.t) || {}; const cat = x.cat || g.cat || 'other';
      try { await X.addExpenseAny({ amount: amt, note: x.t, cat, sub: cat === g.cat ? (x.sub || g.sub || '') : '', acct }); } catch (e) { X.toast('ลงรายจ่ายไม่สำเร็จ'); return; }
      it.price = amt; it.acct = acct; it.cat = cat;
    } else it.price = '';
    it.done = true; it.doneAt = today(); upsert(it); shopOpen = ''; openShop(); refresh();
    X.toast(withExpense ? 'ลงรายจ่าย ฿' + fmtB(it.price) + ' แล้ว' : 'ติ๊กแล้ว');
  }

  /* ---------- ลดหย่อนภาษี (ประมาณการ ปีภาษีปัจจุบัน) ---------- */
  const BR = [[150000, 0], [300000, 0.05], [500000, 0.1], [750000, 0.15], [1000000, 0.2], [2000000, 0.25], [5000000, 0.3], [Infinity, 0.35]];
  function taxOf(net) { let t = 0, prev = 0, rate = 0; for (const [cap, r] of BR) { if (net > prev) { t += (Math.min(net, cap) - prev) * r; rate = r; } prev = cap; } return { tax: Math.max(0, t), rate: net > 150000 ? rate : 0 }; }
  const MANUAL = { life: 'ประกันชีวิต', health: 'ประกันสุขภาพ', home: 'ดอกเบี้ยบ้าน', donate: 'เงินบริจาค', other: 'อื่นๆ' };
  function taxModel() {
    if (!X.isLoaded()) return null;
    const snap = X.snapshot(); const Y = today().slice(0, 4); const m = Number(today().slice(5, 7));
    const inY = (x) => String(x.date || '').slice(0, 4) === Y;
    const inc = snap.incomes.filter(inY);
    const gross = inc.filter((e) => e.type !== 'exempt').reduce((s, e) => s + num(e.amount), 0);
    const sal = inc.filter((e) => ['salary', 'bonus', 'ot', 'freelance'].includes(e.type)).reduce((s, e) => s + num(e.amount), 0);
    const first = inc.reduce((mn, e) => Math.min(mn, Number(String(e.date).slice(5, 7)) || 12), m);
    const span = Math.max(1, m - first + 1);
    const annual = gross / span * 12; const salA = sal / span * 12;
    const sso = inc.reduce((s, e) => s + num(e.sso), 0); const pvd = inc.reduce((s, e) => s + num(e.pvd), 0); const wht = inc.reduce((s, e) => s + num(e.wht), 0);
    const tags = S().taxTags;
    const buys = (tag) => snap.trades.filter((t) => inY(t) && t.type === 'buy' && tags[t.assetId] === tag).reduce((s, t) => s + num(t.amount), 0);
    const rmf = buys('rmf'), esg = buys('esg');
    const man = (k) => L.tax.filter((x) => x.y === Y && x.k === k).reduce((s, x) => s + num(x.amt), 0);
    const life = man('life'), health = man('health'), homeI = man('home'), donate = man('donate'), other = man('other');
    const expense = Math.min(100000, salA * 0.5);
    const retireCap = 500000;
    const pvdCap = Math.min(salA * 0.15, retireCap); const pvdU = Math.min(pvd, pvdCap);
    const rmfCap = Math.max(0, Math.min(annual * 0.3, retireCap - pvdU)); const rmfU = Math.min(rmf, rmfCap);
    const esgCap = Math.min(annual * 0.3, 300000); const esgU = Math.min(esg, esgCap);
    const healthU = Math.min(health, 25000); const lifeU = Math.min(life, 100000 - healthU);
    const rows = [
      { k: 'ส่วนตัว', cap: 60000, used: 60000, src: 'ได้อัตโนมัติ', capT: '60,000' },
      { k: 'ประกันสังคม', cap: 10500, used: Math.min(sso, 10500), src: 'จากช่องประกันสังคมในรายรับ', capT: 'สูงสุด 10,500' },
      { k: 'กองทุนสำรองเลี้ยงชีพ', cap: pvdCap, used: pvdU, src: 'จากช่องกองทุนสำรองฯ ในรายรับ', capT: '15% ของค่าจ้าง · กลุ่มเกษียณรวม 500,000', auto: true },
      { k: 'RMF', cap: rmfCap, used: rmfU, src: 'ซื้อ/DCA กองทุนที่ติดป้าย RMF', capT: '30% ของเงินได้ · กลุ่มเกษียณรวม 500,000', room: true },
      { k: 'Thai ESG / ESGX', cap: esgCap, used: esgU, src: 'ซื้อ/DCA กองทุนที่ติดป้าย ThaiESG', capT: '30% ของเงินได้ ไม่เกิน 300,000', room: true },
      { k: 'ประกันชีวิต + สุขภาพ', cap: 100000, used: lifeU + healthU, src: 'กรอกเอง (สุขภาพไม่เกิน 25,000)', capT: 'รวมไม่เกิน 100,000', room: true },
      { k: 'ดอกเบี้ยบ้าน', cap: 100000, used: Math.min(homeI, 100000), src: 'กรอกเอง', capT: 'ไม่เกิน 100,000', hideEmpty: true },
    ];
    const ded = rows.reduce((s, r) => s + r.used, 0) + other;
    const netPre = Math.max(0, annual - expense - ded);
    const donU = Math.min(donate, netPre * 0.1);
    const net = Math.max(0, netPre - donU);
    const t = taxOf(net);
    const roomTotal = rows.filter((r) => r.room).reduce((s, r) => s + Math.max(0, r.cap - r.used), 0);
    return { Y, m, gross, annual, wht, rows, net, tax: t.tax, rate: t.rate, roomTotal, donU, other, snap, tags };
  }
  let taxForm = { k: 'life', amt: '', note: '' };
  function openTax() {
    const M = taxModel(); const td = today();
    if (!M) { sheet('lfTax', 'ลดหย่อนภาษี', false, '<div class="lf-empty">กำลังโหลดข้อมูล…</div>'); return; }
    const end = M.Y + '-12-31'; const left = diff(td, end);
    const funds = M.snap.assets.filter((a) => M.snap.trades.some((t) => t.assetId === a.id && t.type === 'buy') || /กองทุน|fund|rmf|esg|ssf/i.test((a.kind || '') + ' ' + (a.name || '')));
    const items = L.tax.filter((x) => x.y === M.Y);
    sheet('lfTax', 'ลดหย่อนภาษีปี ' + (Number(M.Y) + 543), false,
      '<div class="lf-tax-h"><span class="lf-pill gold">' + (left >= 0 ? 'เหลือ ' + left + ' วัน ถึง 31 ธ.ค.' : 'ปีภาษีนี้จบแล้ว') + '</span></div>' +
      '<div class="lf-kv"><div><small>เงินได้คาดทั้งปี</small><b>฿' + fmtB(M.annual) + '</b><em>ถึงตอนนี้ ฿' + fmtB(M.gross) + '</em></div><div><small>ภาษีที่คาดว่าต้องจ่าย</small><b class="gold">≈ ฿' + fmtB(M.tax) + '</b><em>ถูกหักไว้แล้ว ฿' + fmtB(M.wht) + '</em></div></div>' +
      (M.rate > 0 ? '<p class="lf-note">อัตราภาษีขั้นสุดท้ายของคุณ ≈ <b>' + Math.round(M.rate * 100) + '%</b> · ลดหย่อนเพิ่มทุก ฿10,000 ประหยัดภาษีได้ราว ฿' + fmtB(M.rate * 10000) + '</p>' : '<p class="lf-note">ตอนนี้เงินได้สุทธิยังอยู่ในขั้นยกเว้นภาษี</p>') +
      M.rows.filter((r) => !(r.hideEmpty && !r.used)).map((r) => { const pct = r.cap > 0 ? Math.round(r.used / r.cap * 100) : 0; const full = r.cap > 0 && r.used >= r.cap - 1; const room = Math.max(0, r.cap - r.used);
        return '<div class="lf-tx"><div class="lf-tx-h"><span><b>' + r.k + '</b><small>' + r.capT + '</small></span><em class="' + (full ? 'ok' : r.room ? 'gold' : '') + '">' + (full ? 'ครบแล้ว' : r.room ? 'ใช้ได้อีก ฿' + fmtB(room) : 'ใช้ ฿' + fmtB(r.used)) + '</em></div><i><s class="' + (full ? 'ok' : '') + '" style="width:' + Math.max(2, Math.min(100, pct)) + '%"></s></i><small>' + r.src + (r.used ? ' · ใช้แล้ว ฿' + fmtB(r.used) : '') + '</small></div>'; }).join('') +
      '<div class="lf-sec-h"><b>ป้ายกองทุน</b><span>ซื้อกองที่ติดป้ายแล้ว จะนับให้เอง</span></div>' +
      (funds.length ? '<div class="panel lf-funds">' + funds.map((a) => '<div class="lf-fund"><span>' + esc(a.name || '') + '</span><div class="lf-seg3">' + [['', 'ไม่ลดหย่อน'], ['rmf', 'RMF'], ['esg', 'ThaiESG']].map(([v, t]) => '<button type="button" data-lf="tx-tag" data-v="' + a.id + '|' + v + '" aria-pressed="' + ((M.tags[a.id] || '') === v) + '">' + t + '</button>').join('') + '</div></div>').join('') + '</div>' : '<div class="lf-empty">ยังไม่มีกองทุนในพอร์ต · ซื้อผ่านปุ่ม “ซื้อ / DCA” แล้วกลับมาติดป้าย</div>') +
      '<div class="lf-sec-h"><b>กรอกเอง</b><span>เบี้ยประกัน ดอกเบี้ยบ้าน บริจาค</span></div>' +
      '<div class="panel lf-man"><div class="chips">' + Object.keys(MANUAL).map((k) => '<button type="button" class="chip" data-lf="tx-k" data-v="' + k + '" aria-pressed="' + (taxForm.k === k) + '">' + MANUAL[k] + '</button>').join('') + '</div>' +
      '<div class="row2"><label class="field"><span>จำนวน (บาท)</span><input id="txAmt" inputmode="decimal" value="' + esc(taxForm.amt) + '" autocomplete="off"></label><label class="field"><span>หมายเหตุ</span><input id="txNote" value="' + esc(taxForm.note) + '" autocomplete="off" placeholder="เช่น ชื่อกรมธรรม์"></label></div><button type="button" class="btn" data-lf="tx-add">เพิ่ม</button>' +
      (items.length ? items.map((x) => '<div class="lf-sh-r done"><span><b>' + MANUAL[x.k] + '</b><small>' + esc(x.note || '') + '</small></span><em>฿' + fmtB(x.amt) + '</em><button type="button" class="lf-x" data-lf="tx-del" data-v="' + x.id + '" aria-label="ลบรายการนี้">' + ICO.x + '</button></div>').join('') : '') + '</div>' +
      '<p class="lf-note">ประมาณการจากรายรับที่บันทึก (คาดทั้งปีจากค่าเฉลี่ยต่อเดือนตั้งแต่เดือนแรกที่มีรายรับ) หักค่าใช้จ่าย 50% ไม่เกิน 100,000 สำหรับเงินเดือน/ค่าจ้าง เพดานตามปีภาษี 2569 · ใช้วางแผนเท่านั้น ตรวจกับกรมสรรพากรก่อนยื่นจริง</p>');
  }

  /* ---------- ค้นหา ---------- */
  let sq = '';
  function openSearch() {
    sheet('lfSearch', 'ค้นหา', false, '<label class="lf-sbox">' + ICO.search + '<input id="lfQ" type="search" placeholder="ค้นหางาน รายจ่าย เอกสาร…" autocomplete="off" aria-label="ค้นหา" value="' + esc(sq) + '"></label><div id="lfRes"></div>');
    renderResults(); setTimeout(() => { const i = $('#lfQ'); if (i) i.focus(); }, 60);
  }
  function renderResults() {
    const el = $('#lfRes'); if (!el) return; const k = sq.trim().toLowerCase();
    if (!k) { el.innerHTML = '<p class="lf-note">ค้นได้ทั้งงานใน To Do List, งาน MEA, ประวัติเอกสาร, รายจ่าย, รายรับ, ของที่ต้องซื้อ และรายการต่ออายุ</p>'; return; }
    const res = []; const has = (...xs) => xs.some((x) => String(x || '').toLowerCase().includes(k));
    if (window.TODO && window.TODO.ready()) window.TODO.search(k).forEach((r) => res.push({ g: r.g, c: r.g === 'To Do List' ? LIME : r.g === 'งาน MEA' ? MEA : BLUE, t: r.t, s: r.s, r: r.r, rc: r.late ? LATE : '#8D9298', act: r.task ? 'open-task' : 'open-job', v: r.task || r.job }));
    if (X.isLoaded()) {
      const snap = X.snapshot(); const cats = X.cats();
      snap.expenses.filter((e) => has(e.note, e.sub, (cats.find((c) => c.id === e.cat) || {}).name, e.from, e.to)).sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 30).forEach((e) => res.push({ g: 'รายจ่าย', c: GOLD, t: e.note || e.sub || 'รายจ่าย', s: dmyY(e.date) + ' · ' + ((cats.find((c) => c.id === e.cat) || {}).name || ''), r: '฿' + fmtB(e.amount), rc: GOLD, act: 'open-exp', v: e.id }));
      snap.incomes.filter((e) => has(e.payer, e.note)).slice(0, 15).forEach((e) => res.push({ g: 'รายรับ', c: '#73C394', t: e.payer || e.note || 'รายรับ', s: dmyY(e.date), r: '฿' + fmtB(e.amount), rc: '#73C394', act: 'go-income', v: '' }));
    }
    L.shop.filter((x) => has(x.t)).forEach((x) => res.push({ g: 'ซื้อของ', c: GOLD, t: x.t, s: x.done ? 'ซื้อแล้ว ' + dmy(x.doneAt) : 'ยังไม่ซื้อ', r: x.price ? '฿' + fmtB(x.price) : '', rc: '#8D9298', act: 'shop', v: '' }));
    L.renew.filter((x) => has(x.t, x.org)).forEach((x) => res.push({ g: 'ต่ออายุ', c: LIME, t: x.t, s: 'หมด ' + dmyY(x.exp), r: '', rc: '#8D9298', act: 'renew', v: '' }));
    if (!res.length) { el.innerHTML = '<div class="lf-empty">ไม่พบ “' + esc(sq) + '”</div>'; return; }
    const groups = []; res.forEach((r) => { let g = groups.find((x) => x.g === r.g); if (!g) { g = { g: r.g, c: r.c, rows: [] }; groups.push(g); } g.rows.push(r); });
    el.innerHTML = groups.map((g) => '<div class="lf-sec-h"><b style="color:' + g.c + '">' + g.g + '</b><span>' + g.rows.length + ' รายการ</span></div><div class="panel lf-res">' + g.rows.map((r) => '<button type="button" data-lf="' + r.act + '" data-v="' + esc(r.v) + '"><span><b>' + esc(r.t) + '</b><small>' + esc(r.s) + '</small></span><em style="color:' + r.rc + '">' + esc(r.r) + '</em></button>').join('') + '</div>').join('');
  }

  /* ---------- ตั้งค่า ---------- */
  function openSet() {
    const s = S(); const n = s.notify; const sw = (key, on, label) => '<button type="button" role="switch" class="td-switch" data-lf="' + key + '" aria-checked="' + !!on + '" aria-label="' + label + '"><i></i></button>';
    const chip = (key, v, on, t) => '<button type="button" class="chip" data-lf="' + key + '" data-v="' + v + '" aria-pressed="' + !!on + '">' + t + '</button>';
    sheet('lfSet', 'ตั้งค่า', false,
      '<div class="lf-sec-h"><b>เปิดแอปแล้วไปหน้าไหน</b></div>' +
      [['home', 'หน้าแรก (แนะนำ)', 'เห็นภาพรวมทั้ง 3 โหมด แล้วเลือกว่าจะไปทางไหน'], ['last', 'โหมดล่าสุดที่ใช้', 'ปิดแอปตอนอยู่โหมดไหน เปิดมาก็อยู่โหมดนั้น'], ['fixed', 'เปิดโหมดเดิมเสมอ', 'เลือกโหมดที่ใช้บ่อยที่สุดไว้']].map(([v, t, d]) => '<button type="button" class="lf-radio" data-lf="set-start" data-v="' + v + '" aria-pressed="' + (s.start === v) + '"><i></i><span><b>' + t + '</b><small>' + d + '</small></span></button>').join('') +
      (s.start === 'fixed' ? '<div class="lf-seg3 wide">' + ['money', 'todo', 'body'].map((k) => '<button type="button" data-lf="set-fixed" data-v="' + k + '" aria-pressed="' + (s.fixed === k) + '">' + MODES[k].name + '</button>').join('') + '</div>' : '') +
      '<div class="panel lf-sw"><span><b>ปุ่มเพิ่มด่วนบนหน้าแรก</b><small>+ รายจ่าย, + งาน, + ซื้อของ, + อาหาร</small></span>' + sw('set-quick', s.quick, 'ปุ่มเพิ่มด่วน') + '</div>' +
      '<div class="lf-sec-h"><b>แจ้งเตือน</b><span>ทำงานใน Google ของคุณ ไม่ต้องเปิดแอป</span></div>' +
      '<div class="panel lf-nt"><div class="lf-sw"><span><b>ส่งกำหนดส่งเข้า Google Calendar</b><small>ลงปฏิทินแยกชื่อ “iN&amp;Ex งาน” · iPhone เตือนเองจากปฏิทิน</small></span>' + sw('nt-cal', n.cal.on, 'ส่งเข้า Google Calendar') + '</div>' +
      (n.cal.on ? '<small>ส่งอะไรบ้าง</small><div class="chips">' + chip('nt-cw', 'due', n.cal.due, 'กำหนดส่งงาน') + chip('nt-cw', 'follow', n.cal.follow, 'วันตามเอกสาร') + chip('nt-cw', 'contract', n.cal.contract, 'งวดงาน / ครบสัญญา') + chip('nt-cw', 'renew', n.cal.renew, 'วันหมดอายุ') + chip('nt-cw', 'impOnly', n.cal.impOnly, 'เฉพาะงานติดธง') + '</div>' +
        '<small>เตือนเมื่อ</small><div class="chips">' + chip('nt-cn', 'm0730', n.cal.m0730, 'เช้าวันนั้น 07:30') + chip('nt-cn', 'd1', n.cal.d1, 'ก่อน 1 วัน 17:00') + '</div>' : '') + '</div>' +
      '<div class="panel lf-nt"><div class="lf-sw"><span><b>สรุปเช้าเข้า Gmail</b><small>ส่งเข้าอีเมลบัญชีเดียวกับ Google Sheet</small></span>' + sw('nt-mail', n.mail.on, 'สรุปเช้าเข้า Gmail') + '</div>' +
      (n.mail.on ? '<div class="row2"><label class="field"><span>เวลา (ชั่วโมง)</span><select id="ntTime">' + ['05:00', '06:00', '07:00', '08:00', '09:00'].map((t) => '<option' + (n.mail.time === t ? ' selected' : '') + '>' + t + '</option>').join('') + '</select></label><label class="field"><span>วัน</span><select id="ntDays"><option value="weekdays"' + (n.mail.days === 'weekdays' ? ' selected' : '') + '>จันทร์–ศุกร์</option><option value="all"' + (n.mail.days === 'all' ? ' selected' : '') + '>ทุกวัน</option></select></label></div>' +
        '<small>ในสรุปมี</small><div class="chips">' + chip('nt-mw', 'today', n.mail.today, 'งานวันนี้ + เลยกำหนด') + chip('nt-mw', 'follow', n.mail.follow, 'เอกสารที่ต้องตาม') + chip('nt-mw', 'contract', n.mail.contract, 'สัญญา/งวด/ต่ออายุ') + chip('nt-mw', 'money', n.mail.money, 'ใช้เงินเมื่อวาน + เดือนนี้') + chip('nt-mw', 'kcal', n.mail.kcal, 'แคลอรี่เมื่อวาน') + '</div>' +
        '<button type="button" class="btn" data-lf="nt-test">ส่งอีเมลทดสอบตอนนี้</button>' : '') + '</div>' +
      '<p class="lf-note">ปฏิทินและอีเมลต้องใช้ Code.gs v3 ใน Google Sheet (ดูวิธีใน README) · ปฏิทินอัปเดตภายในประมาณ 10 นาทีหลังแก้งาน</p>' +
      '<button type="button" class="btn wide" data-lf="go-sync">ซิงก์ สำรองข้อมูล และกู้คืน ›</button>');
  }
  function setNotify(path, val) { const s = S(); const n = clone(s.notify); const [a, b] = path; n[a][b] = val; saveSettings({ notify: n }); openSet(); }

  /* ---------- sheets ---------- */
  let armed = '', armT = null;
  function sheet(id, title, withSave, body) {
    let d = $('#' + id);
    if (!d) {
      d = document.createElement('div'); d.id = id; d.className = 'sheet td-sheet lf-sheet'; d.hidden = true;
      d.setAttribute('role', 'dialog'); d.setAttribute('aria-modal', 'true'); d.setAttribute('aria-labelledby', id + 'T');
      d.innerHTML = '<div class="sheet-head"><button class="ghost" type="button" data-lf="close" data-v="' + id + '">' + (withSave ? 'ยกเลิก' : 'ปิด') + '</button><h2 id="' + id + 'T"></h2>' + (withSave ? '<button class="save b-save" type="button" data-lf="save" data-v="' + id + '">บันทึก</button>' : '<span class="spacer"></span>') + '</div><div class="sheet-body"></div>';
      document.body.appendChild(d);
    }
    $('#' + id + 'T').textContent = title; d.querySelector('.sheet-body').innerHTML = body; d.hidden = false;
  }
  function closeSheet(id) { const d = $('#' + id); if (d) d.hidden = true; if (id === 'lfRenewEdit') rf = null; if (id === 'lfShop') shopOpen = ''; armed = ''; }

  /* ---------- events ---------- */
  function act(a, v, el) {
    switch (a) {
      case 'mode': setMode(v); return;
      case 'chip': openSwitch(); return;
      case 'sw-close': closeSwitch(); return;
      case 'q-expense': setMode('money'); X.quick('expense'); return;
      case 'q-transit': setMode('money'); X.quick('transit'); return;
      case 'q-task': window.TODO.openTask(null); return;
      case 'q-mea': window.TODO.openTask(null, { area: 'mea' }); return;
      case 'q-shop': openShop(true); return;
      case 'q-food': if (window.BODY && window.BODY.openQuick) window.BODY.openQuick(''); return;
      case 'q-weight': setMode('body'); if (window.BODY && window.BODY.openQuick) window.BODY.openQuick('', 'weight'); return;
      case 'open-task': window.TODO.openTask(v); return;
      case 'open-job': window.TODO.openJob(v); return;
      case 'open-exp': closeSheet('lfSearch'); setMode('money'); X.openExpense(v); return;
      case 'go-bills': setMode('money', { tab: 'bills' }); return;
      case 'go-income': closeSheet('lfSearch'); setMode('money', { tab: 'income' }); return;
      case 'go-sync': closeSheet('lfSet'); setMode('money'); X.openSync(); return;
      case 'sync': if (X.syncConnected()) { const d = $('#syncDot'); if (d) d.click(); setTimeout(() => renderHome(false), 1500); } else { setMode('money'); X.openSync(); } return;
      case 'search': openSearch(); return;
      case 'renew': openRenew(); return;
      case 'shop': openShop(); return;
      case 'tax': openTax(); return;
      case 'stats': window.TODO.openStats(); return;
      case 'settings': openSet(); return;
      case 'close': closeSheet(v); if (v === 'lfRenewEdit') openRenew(); return;
      case 'save': if (v === 'lfRenewEdit') saveRenew(); return;
      // renew form
      case 'renew-new': openRenewEdit(null); return;
      case 'renew-edit': openRenewEdit(v); return;
      case 'rn-pick': readRenew(); rf.t = v; renderRenewEdit(); return;
      case 'rn-warn': { readRenew(); const w = Number(v); rf.warn = rf.warn.includes(w) ? rf.warn.filter((x) => x !== w) : rf.warn.concat([w]); if (!rf.warn.length) rf.warn = [30]; renderRenewEdit(); return; }
      case 'rn-del': if (armed !== 'rn') { armed = 'rn'; readRenew(); renderRenewEdit(); clearTimeout(armT); armT = setTimeout(() => { if (armed === 'rn') { armed = ''; if (rf) { readRenew(); renderRenewEdit(); } } }, 3500); return; }
        removeItem(rf.id); closeSheet('lfRenewEdit'); openRenew(); refresh(); X.toast('ลบแล้ว'); return;
      // shop
      case 'sh-add': addShop(); return;
      case 'sh-pick': shopOpen = shopOpen === v ? '' : v; openShop(); setTimeout(() => { const a = $('#shAmt'); if (a && !a.value) a.focus(); }, 40); return;
      case 'sh-acct': { const x = L.shop.find((s) => s.id === shopOpen); if (!x) return; const amt = $('#shAmt') ? $('#shAmt').value : ''; x.acct = v; openShop(); if ($('#shAmt')) $('#shAmt').value = amt; return; }
      case 'sh-cat': { const x = L.shop.find((s) => s.id === shopOpen); if (!x) return; const amt = $('#shAmt') ? $('#shAmt').value : ''; x.cat = v; x.sub = ''; openShop(); if ($('#shAmt')) $('#shAmt').value = amt; return; }
      case 'sh-buy': buyShop(v, true); return;
      case 'sh-only': buyShop(v, false); return;
      case 'sh-del': removeItem(v); openShop(); refresh(); return;
      case 'sh-undo': { const x = L.shop.find((s) => s.id === v); if (!x) return; const it = clone(x); it.done = false; it.doneAt = ''; upsert(it); openShop(); refresh(); X.toast(it.price ? 'กลับมาอยู่ในรายการแล้ว · รายจ่ายที่ลงไว้ยังอยู่ ลบได้ในโหมดเงิน' : 'กลับมาอยู่ในรายการแล้ว'); return; }
      case 'sh-clear': L.shop.filter((x) => x.done && x.doneAt !== today()).forEach((x) => removeItem(x.id)); openShop(); return;
      // tax
      case 'tx-tag': { const [id, tag] = v.split('|'); const t = Object.assign({}, S().taxTags); if (tag) t[id] = tag; else delete t[id]; saveSettings({ taxTags: t }); openTax(); return; }
      case 'tx-k': taxForm.amt = $('#txAmt') ? $('#txAmt').value : ''; taxForm.note = $('#txNote') ? $('#txNote').value : ''; taxForm.k = v; openTax(); return;
      case 'tx-add': { const amt = num($('#txAmt') ? $('#txAmt').value : ''); if (!(amt > 0)) { X.toast('ใส่จำนวนเงิน'); return; } upsert({ id: nid('x'), y: today().slice(0, 4), k: taxForm.k, amt, note: ($('#txNote') ? $('#txNote').value : '').trim() }); taxForm = { k: taxForm.k, amt: '', note: '' }; openTax(); refresh(); return; }
      case 'tx-del': removeItem(v); openTax(); refresh(); return;
      // settings
      case 'set-start': saveSettings({ start: v }); openSet(); return;
      case 'set-fixed': saveSettings({ fixed: v }); openSet(); return;
      case 'set-quick': saveSettings({ quick: !S().quick }); openSet(); renderHome(false); return;
      case 'nt-cal': setNotify(['cal', 'on'], !S().notify.cal.on); return;
      case 'nt-mail': setNotify(['mail', 'on'], !S().notify.mail.on); return;
      case 'nt-cw': case 'nt-cn': setNotify(['cal', v], !S().notify.cal[v]); return;
      case 'nt-mw': setNotify(['mail', v], !S().notify.mail[v]); return;
      case 'nt-test': testMail(el); return;
      default:
    }
  }
  async function testMail(btn) {
    if (!X.syncConnected()) { X.toast('ต้องเชื่อม Google Sheet ก่อน'); return; }
    btn.disabled = true; btn.textContent = 'กำลังส่ง…';
    try { await X.api({ action: 'digest' }); X.toast('ส่งแล้ว ลองเปิด Gmail ดู'); }
    catch (e) { const m = String((e && e.message) || e); X.toast(/unknown action/.test(m) ? 'ต้องอัปเดต Code.gs เป็น v3 ก่อน (ดูวิธีใน README)' : 'ส่งไม่สำเร็จ: ' + m); }
    finally { btn.disabled = false; btn.textContent = 'ส่งอีเมลทดสอบตอนนี้'; }
  }
  document.addEventListener('click', (ev) => {
    if (ev.target.id === 'lfSwitch') { closeSwitch(); return; }
    const b = ev.target.closest('[data-lf]'); if (!b) return;
    ev.preventDefault();
    act(b.dataset.lf, b.dataset.v || '', b);
  });
  document.addEventListener('input', (ev) => { if (ev.target.id === 'lfQ') { sq = ev.target.value; renderResults(); } });
  document.addEventListener('change', (ev) => {
    const t = ev.target;
    if (t.id === 'ntTime') { const n = clone(S().notify); n.mail.time = t.value; saveSettings({ notify: n }); }
    if (t.id === 'ntDays') { const n = clone(S().notify); n.mail.days = t.value; saveSettings({ notify: n }); }
  });
  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter' && ev.target && ev.target.id === 'shNew') { ev.preventDefault(); addShop(); return; }
    if (ev.key !== 'Escape') return;
    if ($('#lfSwitch') && !$('#lfSwitch').hidden) { closeSwitch(); return; }
    for (const id of ['lfRenewEdit', 'lfSet', 'lfTax', 'lfShop', 'lfRenew', 'lfSearch']) { const s = $('#' + id); if (s && !s.hidden) { closeSheet(id); return; } }
  });

  /* ---------- mount ---------- */
  function mount() {
    const top = $('.top');
    if (top) {
      const chip = document.createElement('button'); chip.type = 'button'; chip.id = 'modeChip'; chip.className = 'lf-modechip'; chip.dataset.lf = 'chip';
      top.insertBefore(chip, top.firstChild);
      const sb = document.createElement('button'); sb.type = 'button'; sb.className = 'lf-hsearch'; sb.dataset.lf = 'search'; sb.setAttribute('aria-label', 'ค้นหา'); sb.innerHTML = ICO.search;
      const tr = top.querySelector('.top-r'); if (tr) tr.appendChild(sb);
    }
    const h = document.createElement('div'); h.id = 'lfHome'; h.hidden = true; h.setAttribute('aria-label', 'หน้าแรก');
    h.innerHTML = '<span id="lfSafe" aria-hidden="true"></span><div class="lf-scroll"><span class="lf-snap0" aria-hidden="true"></span><span class="lf-snap1" aria-hidden="true"></span>' +
      '<div class="lf-deck"><div class="lf-deckbg"></div><div class="lf-head"></div>' +
      '<button type="button" class="lf-search" data-lf="search">' + ICO.search + '<span>ค้นหางาน รายจ่าย เอกสาร…</span></button>' +
      '<div class="lf-cards"></div><div class="lf-chips"></div>' +
      '<div class="lf-hint" aria-hidden="true">' + ICO.up + '<span>ปัดขึ้น ดูวันนี้ของฉัน</span></div></div>' +
      '<div class="lf-flow"><div class="lf-flow-in"></div></div></div>';
    document.body.appendChild(h);
    h.querySelector('.lf-scroll').addEventListener('scroll', onScroll, { passive: true });
    const sw = document.createElement('div'); sw.id = 'lfSwitch'; sw.hidden = true; sw.setAttribute('role', 'dialog'); sw.setAttribute('aria-modal', 'true'); sw.setAttribute('aria-label', 'เลือกโหมด');
    sw.innerHTML = '<div class="lf-sheet-in"></div>';
    document.body.appendChild(sw);
    const shade = document.createElement('div'); shade.id = 'lfDragShade'; shade.setAttribute('aria-hidden', 'true');
    document.body.appendChild(shade);
    window.addEventListener('resize', () => { if (!home().hidden) measure(); });
    new MutationObserver(updateChip).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  }
  function startMode() {
    const h = (location.hash || '').replace('#', '');
    if (h === 'todo' || h === 'task') return { m: 'todo' };
    if (h === 'todo-add') return { m: 'todo', add: true };
    if (h === 'kcal' || h === 'body' || h === 'kcal-add' || h === 'weight') return { m: 'body', hash: true };
    if (h === 'home') return { m: 'home' };
    const st = lsGet('inex-start', 'home');
    if (st === 'last') { const l = lsGet('inex-last', 'money'); return { m: MODES[l] ? l : 'money' }; }
    if (st === 'fixed') { const f = lsGet('inex-start-fixed', 'todo'); return { m: MODES[f] ? f : 'todo' }; }
    return { m: 'home' };
  }
  window.addEventListener('hashchange', () => {
    const h = (location.hash || '').replace('#', '');
    if (h === 'home') setMode('home');
    else if (h === 'todo' || h === 'task') setMode('todo');
    else if (h === 'todo-add') { setMode('todo'); window.TODO.openTask(null); }
    else if (h === 'kcal' || h === 'body') { document.body.classList.remove('mode-home'); home().hidden = true; updateChip(); }
  });

  /* ---------- swipe from the left edge = back (close the top sheet, else go to the home screen) ---------- */
  const EDGE = 28;
  let sw = null;
  const visible = (el) => !el.hidden && getComputedStyle(el).display !== 'none';
  function topSheet() { const list = $$('.sheet').filter(visible); return list.length ? list[list.length - 1] : null; }
  function movers() { return $$('.app, nav.tabs, #fab, #lfDragShade').filter((el) => el.id === 'lfDragShade' || visible(el)); }
  function beginDrag() {
    if (sw.sheet) { sw.sheet.style.transition = 'none'; sw.sheet.classList.add('lf-sdrag'); return; }
    document.documentElement.classList.add('lf-drag-root'); document.body.classList.add('lf-drag');
    const h = home(); h.hidden = false; renderHome(true);
    h.style.transition = 'none'; h.style.transform = 'translate3d(-30%,0,0)';
    sw.els = movers(); sw.els.forEach((el) => { el.style.transition = 'none'; el.style.willChange = 'transform'; });
  }
  function dragTo(dx) {
    const W = window.innerWidth;
    if (sw.sheet) { sw.sheet.style.transform = 'translate3d(' + dx + 'px,0,0)'; return; }
    sw.els.forEach((el) => { el.style.transform = 'translate3d(' + dx + 'px,0,0)'; });
    const k = Math.min(1, dx / W);
    home().style.transform = 'translate3d(' + (-30 * (1 - k)).toFixed(2) + '%,0,0)';
    home().style.setProperty('--lf-dim', (0.45 * (1 - k)).toFixed(3));
  }
  function finishDrag(commit) {
    const W = window.innerWidth; const ms = 230; const tr = 'transform ' + ms + 'ms cubic-bezier(.2,.8,.2,1)';
    const st = sw;
    if (st.sheet) {
      const sh = st.sheet; sh.style.transition = tr; sh.style.transform = 'translate3d(' + (commit ? W : 0) + 'px,0,0)';
      setTimeout(() => {
        if (commit) { const btn = sh.querySelector('.sheet-head button'); if (btn) btn.click(); }
        sh.style.transition = 'none'; sh.style.transform = ''; sh.classList.remove('lf-sdrag');
        requestAnimationFrame(() => { sh.style.transition = ''; });
      }, ms);
      return;
    }
    const h = home();
    st.els.forEach((el) => { el.style.transition = tr; el.style.transform = 'translate3d(' + (commit ? W : 0) + 'px,0,0)'; });
    h.style.transition = tr + ', --lf-dim ' + ms + 'ms'; h.style.transform = commit ? 'translate3d(0,0,0)' : 'translate3d(-30%,0,0)'; h.style.setProperty('--lf-dim', commit ? '0' : '0.45');
    setTimeout(() => {
      st.els.forEach((el) => { el.style.transition = ''; el.style.transform = ''; el.style.willChange = ''; });
      h.style.transition = ''; h.style.transform = ''; h.style.removeProperty('--lf-dim');
      document.body.classList.remove('lf-drag'); document.documentElement.classList.remove('lf-drag-root');
      if (commit) setMode('home'); else h.hidden = true;
    }, ms + 10);
  }
  document.addEventListener('touchstart', (e) => {
    sw = null;
    if (e.touches.length !== 1) return;
    const t = e.touches[0]; if (t.clientX > EDGE) return;
    if ($('#lfSwitch') && !$('#lfSwitch').hidden) return;
    if ($('#qmenu') && !$('#qmenu').hidden) return;
    const sheet = topSheet();
    if (!sheet && curMode() === 'home') return;
    sw = { x0: t.clientX, y0: t.clientY, dx: 0, on: false, sheet, lastX: t.clientX, lastT: Date.now(), v: 0 };
  }, { passive: true });
  document.addEventListener('touchmove', (e) => {
    if (!sw) return;
    const t = e.touches[0]; const dx = t.clientX - sw.x0, dy = t.clientY - sw.y0;
    if (!sw.on) {
      if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) { sw = null; return; }
      if (dx < 10) return;
      sw.on = true; beginDrag();
    }
    if (e.cancelable) e.preventDefault();
    const now = Date.now(); const v = (t.clientX - sw.lastX) / Math.max(1, now - sw.lastT);
    sw.v = sw.v * 0.4 + v * 0.6; sw.lastX = t.clientX; sw.lastT = now;
    sw.dx = Math.max(0, dx); dragTo(sw.dx);
  }, { passive: false });
  const endSwipe = () => {
    if (!sw) return;
    if (sw.on) { const W = window.innerWidth; finishDrag(sw.dx > W * 0.35 || (sw.v > 0.45 && sw.dx > 40)); }
    sw = null;
  };
  document.addEventListener('touchend', endSwipe, { passive: true });
  document.addEventListener('touchcancel', () => { if (sw && sw.on) finishDrag(false); sw = null; }, { passive: true });

  window.LIFE = { applyRemote, enqueueAll, exportData, importData, refresh, setMode, mode: curMode, openSearch };

  mount();
  const st = startMode();
  if (!st.hash) setMode(st.m); else { document.body.classList.remove('mode-home'); updateChip(); }
  if (window.TODO && window.TODO.onChange) window.TODO.onChange(refresh);
  X.ready().then(async () => {
    const v = await X.kvGet('life');
    if (v && typeof v === 'object') L = { renew: Array.isArray(v.renew) ? v.renew : [], shop: Array.isArray(v.shop) ? v.shop : [], tax: Array.isArray(v.tax) ? v.tax : [], settings: v.settings || null };
    ready = true;
    pending.splice(0).forEach(applyRemote);
    if (L.settings) { lsSet('inex-start', L.settings.start || 'home'); lsSet('inex-start-fixed', L.settings.fixed || 'todo'); }
    if (st.add) window.TODO.openTask(null);
    updateChip(); renderHome(false); autoRenewTasks();
    setTimeout(() => { renderHome(false); autoRenewTasks(); }, 600);
  });
})();
