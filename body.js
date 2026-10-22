/* iN&Ex · kcal mode (In = Intake, Ex = Expenditure)
   - Data lives in its own IndexedDB key "body" — money data (c:*, settings, outbox, sync) is never written here.
   - Syncs through the existing Google Sheet backend as meta docs "body:*" (no Apps Script change needed).
   - Linked food expenses go through the same store.add('expenses') path as the expense form; nothing here deletes or edits money data. */
(function () {
  'use strict';
  const E = window.BodyEngine, X = window.INEX;
  if (!E || !X) return;

  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));
  const esc = X.esc;
  const pad = (n) => String(n).padStart(2, '0');
  const iso = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const parseD = (s) => { const p = String(s || '').split('-').map(Number); return new Date(p[0], (p[1] || 1) - 1, p[2] || 1); };
  const addDays = (s, n) => { const d = parseD(s); d.setDate(d.getDate() + n); return iso(d); };
  const TH_M = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
  const TH_MS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  const TH_D = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสฯ', 'ศุกร์', 'เสาร์'];
  const fmt = (n) => Math.round(Number(n) || 0).toLocaleString('th-TH');
  const fmt1 = (n) => (Math.round((Number(n) || 0) * 10) / 10).toFixed(1);
  const num = (v) => { const s = String(v == null ? '' : v).replace(/,/g, '').trim(); if (!s) return null; const n = Number(s); return isNaN(n) ? NaN : n; };
  const shortD = (s) => { const d = parseD(s); return d.getDate() + ' ' + TH_MS[d.getMonth()]; };
  const MEALS = ['เช้า', 'กลางวัน', 'เย็น', 'ของว่าง'];
  const LOGGED_MIN = 1000; // a day counts toward the real TDEE once ≥ this many kcal are logged
  const SRC_URL = {
    S: 'https://www.si.mahidol.ac.th/th/division/hph/admin/news_files/531_49_1.pdf',
    W: 'https://www.wongnai.com/articles/carolies-per-meal',
    T: 'https://www.trueplookpanya.com/infographic/detail/20/',
    U: 'https://fdc.nal.usda.gov/',
    F: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC10660127',
  };

  /* ---------- state & storage ---------- */
  let B = { profile: null, w: [], f: [], x: [] };
  let ready = false;
  const pending = [];
  let mode = 'money', btab = 'today', day = X.todayISO(), trendRange = 28, fq = '';
  let q = null, bx = null, gform = null, delArmed = false, delT = null;

  const prof = () => Object.assign({}, E.DEFAULT_PROFILE, B.profile || {});
  const save = () => X.kvSet('body', B);
  const nid = (p) => p + ':' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  function pushItem(item) { const doc = Object.assign({}, item, { _t: Date.now() }); delete doc.id; X.enqueue('meta', 'body:' + item.id, 'put', doc); }
  function upsert(kind, item) { const a = B[kind]; const i = a.findIndex((x) => x.id === item.id); if (i >= 0) a[i] = item; else a.push(item); save(); pushItem(item); render(); }
  function removeItem(kind, id) { B[kind] = B[kind].filter((x) => x.id !== id); save(); X.enqueue('meta', 'body:' + id, 'del', null); render(); }
  function saveProfile(p) { B.profile = Object.assign({}, p, { _t: Date.now() }); save(); X.enqueue('meta', 'body:profile', 'put', B.profile); render(); }

  function applyRemote(r) {
    if (!ready) { pending.push(r); return; }
    const id = String(r.id).slice(5);
    if (id === 'profile') { if (!r.deleted && r.doc) B.profile = Object.assign({}, r.doc); }
    else {
      const k = id.split(':')[0];
      if (!['w', 'f', 'x'].includes(k)) return;
      const i = B[k].findIndex((x) => x.id === id);
      if (r.deleted) { if (i >= 0) B[k].splice(i, 1); }
      else if (r.doc) { const row = Object.assign({}, r.doc, { id }); if (i >= 0) B[k][i] = row; else B[k].push(row); }
    }
    save(); render();
  }
  function enqueueAll() {
    if (B.profile) X.enqueue('meta', 'body:profile', 'put', B.profile);
    ['w', 'f', 'x'].forEach((k) => B[k].forEach(pushItem));
  }
  function exportData() { return JSON.parse(JSON.stringify(B)); }
  async function importData(j) {
    let n = 0;
    if (j && j.profile) { B.profile = j.profile; n++; }
    ['w', 'f', 'x'].forEach((k) => (Array.isArray(j && j[k]) ? j[k] : []).forEach((it) => {
      if (!it || !it.id) return; const i = B[k].findIndex((x) => x.id === it.id); if (i >= 0) B[k][i] = it; else B[k].push(it); n++;
    }));
    await save(); enqueueAll(); render(); return n;
  }

  /* ---------- derived numbers ---------- */
  const sum = (a, f) => a.reduce((s, x) => s + f(x), 0);
  const foodsOn = (d) => B.f.filter((x) => x.d === d).sort((a, b) => (a.t || '').localeCompare(b.t || ''));
  const exOn = (d) => B.x.filter((x) => x.d === d);
  const kcalOn = (d) => sum(foodsOn(d), (x) => Number(x.kcal) || 0);
  const weightOn = (d) => { const w = B.w.find((x) => x.d === d); return w ? Number(w.kg) : null; };
  function avg7(d) { const v = []; for (let i = 0; i < 7; i++) { const k = weightOn(addDays(d, -i)); if (k != null) v.push(k); } return v.length ? sum(v, (x) => x) / v.length : null; }
  const lastW = () => B.w.slice().sort((a, b) => b.d.localeCompare(a.d))[0] || null;
  function curKg() { const l = lastW(); if (!l) return Number(prof().kg); const a = avg7(l.d); return a != null ? a : Number(l.kg); }
  function windowDays(end, n) { const out = []; for (let i = n - 1; i >= 0; i--) { const d = addDays(end, -i); const k = kcalOn(d); out.push({ date: d, kcal: k, complete: k >= LOGGED_MIN, kg: weightOn(d) }); } return out; }
  function calc(d) {
    const p = prof();
    const profile = { sex: p.sex, age: Number(p.age), cm: Number(p.cm), kg: curKg(), activity: Number(p.activity) || 1.2 };
    const days = windowDays(addDays(d, -1), 28); // the day itself is still in progress
    const ex = sum(exOn(d), (x) => Number(x.kcal) || 0);
    const b = E.budget({ profile, days, deficit: Number(p.deficit) || 500, eaten: kcalOn(d), exercise: ex, exerciseCredit: Number(p.exerciseCredit) || 0 });
    b.exercise = ex; b.logged = days.filter((x) => x.complete).length; b.kgNow = profile.kg;
    return b;
  }
  function weeklyRate() {
    const end = X.todayISO();
    const pts = B.w.filter((w) => w.d > addDays(end, -28) && w.d <= end).map((w) => ({ date: w.d, kg: Number(w.kg) }));
    if (pts.length < 4) return null;
    const s = E.weightSlope(pts); return s == null ? null : s * 7;
  }

  /* ---------- exercise parsing ---------- */
  const EX = [['วิ่ง', 9.8, 'run'], ['เดินเร็ว', 4.3, 'walk'], ['เดิน', 3.5, 'walk'], ['ปั่นจักรยาน', 7.5], ['ปั่น', 7.5], ['ว่ายน้ำ', 7], ['เล่นเวท', 5], ['เวท', 5], ['ยิม', 5], ['ฟิตเนส', 5], ['แบดมินตัน', 5.5], ['แบด', 5.5], ['ฟุตบอล', 7], ['บอล', 7], ['บาส', 6.5], ['โยคะ', 2.5], ['hiit', 8], ['กระโดดเชือก', 11]];
  function exParse(text, kg) {
    const t = String(text || '').toLowerCase();
    const hit = EX.find((e) => t.includes(e[0]));
    if (!hit) return null;
    const km = t.match(/(\d+(?:\.\d+)?)\s*(?:km|กม\.?|กิโลเมตร|โล)/);
    const mn = t.match(/(\d+(?:\.\d+)?)\s*(?:นาที|min)/);
    const hr = t.match(/(\d+(?:\.\d+)?)\s*(?:ชม\.?|ชั่วโมง|hr)/);
    const minutes = (mn ? Number(mn[1]) : 0) + (hr ? Number(hr[1]) * 60 : 0);
    let kcal = null, how = '';
    if (km && hit[2] === 'run') { kcal = kg * Number(km[1]); how = 'วิ่ง ≈ น้ำหนัก × ระยะทาง (' + fmt1(kg) + ' × ' + km[1] + ' กม.)'; }
    else if (km && hit[2] === 'walk') { kcal = 0.5 * kg * Number(km[1]); how = 'เดิน ≈ 0.5 × น้ำหนัก × ระยะทาง'; }
    else if (minutes) { kcal = (hit[1] - 1) * kg * minutes / 60; how = 'MET ' + hit[1] + ' (หักส่วนที่ร่างกายใช้อยู่แล้ว) × ' + fmt1(kg) + ' กก. × ' + Math.round(minutes) + ' นาที'; }
    return { name: hit[0], kcal: kcal == null ? null : Math.round(kcal), how };
  }

  /* ---------- mode & tabs ---------- */
  function setMode(m) {
    if (m === 'body' && window.TODO) window.TODO.leave(true);
    mode = m;
    document.body.classList.toggle('mode-body', m === 'body');
    $('#bodyMain').hidden = m !== 'body';
    $('#bodyTabs').hidden = m !== 'body';
    const mb = $('#modeBtn'); if (mb) { mb.dataset.modesw = m === 'body' ? 'money' : 'body'; mb.textContent = m === 'body' ? '฿' : 'kcal'; mb.setAttribute('aria-label', m === 'body' ? 'กลับไปโหมดการเงิน' : 'สลับไปโหมดแคลอรี่'); }
    try { localStorage.setItem('inex-mode', m); } catch (e) { /* private mode */ }
    if (m === 'body') { render(); window.scrollTo(0, 0); }
  }
  function setBTab(t) {
    btab = t; if (t === 'goal') gform = null;
    $$('[data-btab]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.btab === t)));
    ['today', 'trend', 'food', 'goal'].forEach((v) => { $('#bview-' + v).hidden = v !== t; });
    render(); window.scrollTo(0, 0);
  }
  function render() {
    if (mode !== 'body') return;
    const el = $('#bview-' + btab);
    if (!ready) { el.innerHTML = '<div class="empty"><b>กำลังโหลด…</b></div>'; return; }
    const ae = document.activeElement;
    if (ae && /^(INPUT|SELECT|TEXTAREA)$/.test(ae.tagName) && el.contains(ae)) return;
    if (btab === 'today') renderToday(el); else if (btab === 'trend') renderTrend(el); else if (btab === 'food') renderFood(el); else renderGoal(el);
  }

  /* ---------- today ---------- */
  function ring(eaten, target) {
    const r = 58, C = 2 * Math.PI * r, frac = target > 0 ? Math.min(1, eaten / target) : 0, over = eaten > target;
    const rem = target - eaten;
    return '<svg class="b-ring" viewBox="0 0 140 140" role="img" aria-label="กินแล้ว ' + fmt(eaten) + ' จาก ' + fmt(target) + ' kcal">' +
      '<circle cx="70" cy="70" r="' + r + '" fill="none" stroke="#24292E" stroke-width="11"/>' +
      '<circle cx="70" cy="70" r="' + r + '" fill="none" stroke="' + (over ? 'var(--loss)' : 'var(--lime)') + '" stroke-width="11" stroke-linecap="round" stroke-dasharray="' + (frac * C).toFixed(1) + ' ' + C.toFixed(1) + '" transform="rotate(-90 70 70)"/>' +
      '<text x="70" y="70" text-anchor="middle" fill="' + (over ? 'var(--loss)' : 'var(--ink)') + '" font-size="28">' + fmt(Math.abs(rem)) + '</text>' +
      '<text x="70" y="92" text-anchor="middle" fill="var(--muted)" font-size="12" style="font-family:var(--f-body)">' + (over ? 'kcal เกินงบ' : 'kcal เหลือ') + '</text></svg>';
  }
  function renderToday(el) {
    const d = day, isT = d === X.todayISO(), b = calc(d), p = prof();
    const target = b.target + b.bonus, dt = parseD(d);
    const a7 = avg7(d), a7p = avg7(addDays(d, -7)), wk = a7 != null && a7p != null ? a7 - a7p : null;
    let h = '<div class="b-dnav"><button type="button" data-bday="-1" aria-label="วันก่อนหน้า">‹</button><div><b>' + (isT ? 'วันนี้' : TH_D[dt.getDay()]) + ' ' + dt.getDate() + ' ' + TH_MS[dt.getMonth()] + '</b></div><button type="button" data-bday="1" aria-label="วันถัดไป"' + (isT ? ' disabled' : '') + '>›</button></div>';
    h += '<div class="b-hero">' + ring(b.eaten, target) + '<div class="kv2">' +
      '<div><span>งบวันนี้</span><b>' + fmt(b.target) + (b.bonus ? ' <small class="b-lime">+' + fmt(b.bonus) + '</small>' : '') + '</b></div>' +
      '<div><span>กินแล้ว</span><b>' + fmt(b.eaten) + '</b></div>' +
      '<div><span>ออกกำลังกาย' + (Number(p.exerciseCredit) ? ' (นับคืนครึ่งเดียว)' : ' (โบนัส ไม่นับคืน)') + '</span><b>' + (b.exercise ? '+' + fmt(b.exercise) : '0') + '</b></div></div></div>';
    h += '<div class="grid b-grid">' +
      '<div><span class="label">เฉลี่ย 7 วัน</span><b>' + (a7 != null ? fmt1(a7) : '–') + '</b><small>' + (wk != null ? (wk <= 0 ? '−' : '+') + fmt1(Math.abs(wk)) + ' กก./สัปดาห์' : 'กก.') + '</small></div>' +
      '<div><span class="label">TDEE</span><b>' + fmt(b.tdee) + '</b><small>' + (b.tdeeAdaptive != null ? 'จากข้อมูลจริง ' + b.logged + ' วัน' : 'สูตร · อีก ' + Math.max(0, 14 - b.logged) + ' วันใช้ค่าจริง') + '</small></div>' +
      '<div><span class="label">ขาดดุล</span><b>−' + fmt(p.deficit) + '</b><small>≈ ' + b.kgPerWeek + ' กก./สัปดาห์</small></div></div>';
    const w = weightOn(d);
    if (w == null) {
      h += '<div class="b-card lime" style="margin-top:12px"><b>ชั่งน้ำหนัก' + (isT ? 'วันนี้' : 'วันนี้ (' + shortD(d) + ')') + '</b><div class="b-src">ชั่งตอนเช้าหลังเข้าห้องน้ำ ก่อนกินอะไร จะเทียบกันได้แม่นที่สุด</div>' +
        '<div class="b-wrow"><input id="bwQuick" inputmode="decimal" placeholder="เช่น 92.4" aria-label="น้ำหนัก (กก.)"><button type="button" id="bwQuickSave">บันทึก</button></div></div>';
    } else {
      h += '<button class="b-item" type="button" data-bw="' + esc(d) + '" style="margin-top:6px"><span><b>น้ำหนัก ' + fmt1(w) + ' กก.</b><small>' + (isT ? 'วันนี้' : shortD(d)) + ' · แตะเพื่อแก้</small></span><b>›</b></button>';
    }
    const foods = foodsOn(d);
    h += '<div class="h2">อาหาร<span>' + fmt(b.eaten) + ' kcal</span></div>';
    if (!foods.length) h += '<div class="empty"><b>ยังไม่มีอาหาร</b>แตะ + แล้วพิมพ์ เช่น “กะเพราหมูกรอบ ไข่ดาว 65” ระบบจะคิดแคลอรี่และลงรายจ่ายให้ในครั้งเดียว</div>';
    else {
      h += '<div class="b-meal">' + MEALS.map((m) => {
        const items = foods.filter((x) => (x.meal || 'ของว่าง') === m); if (!items.length) return '';
        return '<h4>' + m + '<b>' + fmt(sum(items, (x) => Number(x.kcal) || 0)) + '</b></h4>' + items.map((x) => {
          const e = x.exp ? X.expenseById(x.exp) : null;
          return '<button class="b-item" type="button" data-bf="' + esc(x.id) + '"><span><b>' + esc(x.name) + '</b><small>' + esc(x.t || '') + (e ? ' · ลงรายจ่าย ฿' + X.fmtB(e.amount) : '') + '</small></span><b>' + fmt(x.kcal) + '</b></button>';
        }).join('');
      }).join('') + '</div>';
    }
    const exs = exOn(d);
    if (exs.length) {
      h += '<div class="h2">ออกกำลังกาย<span>+' + fmt(b.exercise) + ' kcal</span></div>' + exs.map((x) => '<button class="b-item" type="button" data-bxe="' + esc(x.id) + '"><span><b>' + esc(x.name) + '</b><small>' + esc(x.t || '') + '</small></span><b class="b-lime">+' + fmt(x.kcal) + '</b></button>').join('');
    }
    h += '<p class="insight">ตัวเลขแคลอรี่ของอาหารเป็นค่าประมาณ ไม่ต้องแม่นทุกจาน เมื่อบันทึกอาหารและน้ำหนักครบ 14 วัน แอปจะคำนวณ TDEE จริงของคุณจากข้อมูล แล้วปรับงบให้เอง</p>';
    el.innerHTML = h;
  }

  /* ---------- trend ---------- */
  function chart(range) {
    const end = X.todayISO();
    let pts = B.w.slice().sort((a, b) => a.d.localeCompare(b.d));
    if (range) pts = pts.filter((w) => w.d > addDays(end, -range));
    if (pts.length < 2) return '<div class="empty"><b>ยังมีข้อมูลน้ำหนักไม่พอ</b>ชั่งน้ำหนักทุกเช้าอย่างน้อย 2 วัน แล้วกราฟจะขึ้นที่นี่</div>';
    const start = range ? addDays(end, -(range - 1)) : pts[0].d;
    const span = Math.max(1, Math.round((parseD(end) - parseD(start)) / 864e5));
    const ks = pts.map((w) => Number(w.kg)); const g = Number(prof().goalKg);
    let lo = Math.floor(Math.min(...ks) - 0.5), hi = Math.ceil(Math.max(...ks) + 0.5);
    const W = 340, H = 170, X0 = 30, X1 = 332, Y0 = 10, Y1 = 146;
    const xOf = (d) => X0 + (X1 - X0) * Math.round((parseD(d) - parseD(start)) / 864e5) / span;
    const yOf = (k) => Y1 - (k - lo) / (hi - lo) * (Y1 - Y0);
    const step = (hi - lo) > 8 ? 2 : 1; let grid = '', labels = '';
    for (let v = lo; v <= hi; v += step) { const y = yOf(v).toFixed(1); grid += '<line x1="' + X0 + '" y1="' + y + '" x2="' + X1 + '" y2="' + y + '" stroke="var(--line)"/>'; labels += '<text x="0" y="' + (Number(y) + 3) + '">' + v + '</text>'; }
    const dots = pts.map((w) => '<circle cx="' + xOf(w.d).toFixed(1) + '" cy="' + yOf(Number(w.kg)).toFixed(1) + '" r="2.6" fill="var(--faint)"/>').join('');
    const avg = pts.map((w) => { const a = avg7(w.d); return a == null ? null : xOf(w.d).toFixed(1) + ' ' + yOf(a).toFixed(1); }).filter(Boolean);
    const goal = g >= lo && g <= hi ? '<line x1="' + X0 + '" y1="' + yOf(g).toFixed(1) + '" x2="' + X1 + '" y2="' + yOf(g).toFixed(1) + '" stroke="var(--lime)" stroke-dasharray="4 4" opacity=".6"/>' : '';
    return '<svg class="b-chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="น้ำหนักรายวันและเส้นค่าเฉลี่ย 7 วัน">' + grid + labels + goal + dots +
      '<path d="M' + avg.join(' L') + '" fill="none" stroke="var(--lime)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>' +
      '<text x="' + X0 + '" y="164">' + shortD(start) + '</text><text x="' + (X1 - 40) + '" y="164">' + shortD(end) + '</text></svg>' +
      '<div class="b-legend"><span><i></i>ชั่งรายวัน</span><span><i class="l"></i>เฉลี่ย 7 วัน</span>' + (goal ? '<span>- - เป้า ' + fmt1(g) + '</span>' : '') + '</div>';
  }
  function renderTrend(el) {
    const p = prof(), b = calc(X.todayISO()), cur = curKg(), rate = weeklyRate();
    const first = B.w.slice().sort((a, c) => a.d.localeCompare(c.d))[0];
    const startKg = first ? Number(first.kg) : Number(p.kg);
    const goal = Number(p.goalKg);
    const useRate = rate != null && rate < -0.05 ? -rate : b.kgPerWeek;
    const weeks = cur > goal && useRate > 0 ? (cur - goal) / useRate : 0;
    const eta = new Date(); eta.setDate(eta.getDate() + Math.round(weeks * 7));
    let h = '<div class="b-seg" style="margin-top:6px">' + [[28, '4 สัปดาห์'], [84, '12 สัปดาห์'], [0, 'ทั้งหมด']].map((r) => '<button type="button" data-brange="' + r[0] + '" aria-pressed="' + (trendRange === r[0]) + '">' + r[1] + '</button>').join('') + '</div>';
    h += '<div class="panel" style="margin-top:12px">' + chart(trendRange) + '</div>';
    h += '<div class="grid b-grid" style="margin-top:12px">' +
      '<div><span class="label">ตอนนี้ (เฉลี่ย)</span><b>' + fmt1(cur) + '</b><small>กก.</small></div>' +
      '<div><span class="label">ลดไปแล้ว</span><b>' + fmt1(Math.max(0, startKg - cur)) + '</b><small>จาก ' + fmt1(startKg) + '</small></div>' +
      '<div><span class="label">ความเร็วจริง</span><b>' + (rate == null ? '–' : (rate <= 0 ? '−' : '+') + fmt1(Math.abs(rate))) + '</b><small>กก./สัปดาห์</small></div></div>';
    h += '<div class="b-card" style="margin-top:12px">' + (cur <= goal ? '<b class="b-lime">ถึงเป้า ' + fmt1(goal) + ' กก. แล้ว</b>' :
      '<span class="label">ถึงเป้า ' + fmt1(goal) + ' กก. (อีก ' + fmt1(cur - goal) + ' กก.)</span><div style="font-size:16px;font-weight:500;margin-top:2px">ประมาณ ' + TH_M[eta.getMonth()] + ' ' + (eta.getFullYear() + 543) + '</div><div class="b-src">' + (rate != null && rate < -0.05 ? 'คิดจากความเร็วจริง 4 สัปดาห์ล่าสุด' : 'คิดจากขาดดุลที่ตั้งไว้ (ยังมีข้อมูลน้ำหนักไม่พอ)') + ' · ราว ' + Math.round(weeks) + ' สัปดาห์</div>') + '</div>';
    h += '<div class="h2">TDEE<span>ปรับตามข้อมูลจริงอัตโนมัติ</span></div><div class="panel"><div class="ledger">' +
      '<div><span>BMR (Mifflin-St Jeor) ที่ ' + fmt1(b.kgNow) + ' กก.</span><b>' + fmt(b.bmr) + '</b></div>' +
      '<div><span>TDEE จากสูตร (×' + p.activity + ')</span><b>' + fmt(b.tdeeFormula) + '</b></div>' +
      '<div><span>TDEE จากข้อมูลจริง</span><b>' + (b.tdeeAdaptive != null ? fmt(b.tdeeAdaptive) : 'อีก ' + Math.max(0, 14 - b.logged) + ' วัน') + '</b></div>' +
      '<div class="total"><span>ใช้คำนวณ</span><b>' + fmt(b.tdee) + '</b></div></div>' +
      '<p class="b-src" style="margin:10px 0 0">TDEE จริง = แคลอรี่ที่กินเฉลี่ย + (น้ำหนักที่ลดต่อวัน × 7,700) ใช้เฉพาะวันที่บันทึกอาหารรวม ≥ ' + fmt(LOGGED_MIN) + ' kcal ใน 28 วันล่าสุด (ตอนนี้มี ' + b.logged + ' วัน) · 14–28 วันผสมกับสูตร · ครบ 28 วันใช้ค่าจริงทั้งหมด</p></div>';
    // weekly blocks
    const rows = []; const today = X.todayISO();
    for (let wk = 0; wk < 8; wk++) {
      const e = addDays(today, -7 * wk), s = addDays(e, -6); const ds = []; for (let i = 0; i < 7; i++) ds.push(addDays(s, i));
      const logged = ds.filter((d) => kcalOn(d) >= LOGGED_MIN); const ws = ds.map(weightOn).filter((x) => x != null);
      if (!logged.length && !ws.length) continue;
      rows.push('<div><span>' + shortD(s) + ' – ' + shortD(e) + '<small style="display:block">' + logged.length + ' วันบันทึกครบ</small></span><b>' + (logged.length ? fmt(sum(logged, kcalOn) / logged.length) + ' kcal' : '–') + ' · ' + (ws.length ? fmt1(sum(ws, (x) => x) / ws.length) + ' กก.' : '–') + '</b></div>');
    }
    if (rows.length) h += '<div class="h2">รายสัปดาห์<span>กินเฉลี่ย/วัน · น้ำหนักเฉลี่ย</span></div><div class="panel"><div class="ledger">' + rows.join('') + '</div></div>';
    el.innerHTML = h;
  }

  /* ---------- food database ---------- */
  function freqFoods() {
    const g = {}; B.f.forEach((x) => { const k = String(x.name || '').trim(); if (!k) return; g[k] = g[k] || { n: 0, kcal: x.kcal, last: '' }; g[k].n++; if ((x.d || '') >= g[k].last) { g[k].last = x.d || ''; g[k].kcal = x.kcal; } });
    return Object.keys(g).map((k) => ({ name: k, n: g[k].n, kcal: g[k].kcal })).sort((a, b) => b.n - a.n).slice(0, 8);
  }
  function foodListHTML() {
    const t = E.norm(fq);
    const list = E.DISHES.filter((d) => !t || E.norm(d.n).includes(t) || d.a.some((a) => E.norm(a).includes(t)));
    if (!list.length) return '<div class="empty"><b>ไม่พบในฐานข้อมูล</b>แตะ + แล้วพิมพ์วัตถุดิบกับวิธีปรุงแทนได้ เช่น “อกไก่ทอด 150g”</div>';
    return list.map((d) => '<button class="b-item" type="button" data-bqtext="' + esc(d.n.replace(/\s*\(.*?\)/g, '')) + '"><span><b>' + esc(d.n) + '</b><small>' + esc(d.s) + ' · ' + esc(d.src) + '</small></span><b>' + fmt(d.k) + '</b></button>').join('');
  }
  function renderFood(el) {
    const fav = freqFoods();
    let h = '<div class="field" style="margin-top:6px"><input id="bfSearch" placeholder="ค้นหาเมนู เช่น ข้าวผัด" value="' + esc(fq) + '" autocomplete="off" aria-label="ค้นหาเมนู"></div>';
    if (fav.length) h += '<div class="h2">กินบ่อย<span>แตะเพื่อบันทึก</span></div><div class="recent">' + fav.map((x) => '<button type="button" class="rchip" data-bqtext="' + esc(x.name) + '"><span><b>' + esc(x.name) + '</b><small>' + fmt(x.kcal) + ' kcal · ' + x.n + ' ครั้ง</small></span></button>').join('') + '</div>';
    h += '<div class="h2">เมนูสำเร็จ<span>kcal ต่อ 1 ที่</span></div><div class="b-db" id="bfList">' + foodListHTML() + '</div>';
    h += '<div class="h2">วัตถุดิบ<span>kcal ต่อ 100 g</span></div><div class="panel"><div class="ledger">' + E.INGREDIENTS.map((i) => '<div><span>' + esc(i.n) + '<small style="display:block">ค่าเริ่มต้น ' + i.g + ' g ต่อที่ · ' + esc(i.src) + '</small></span><b>' + i.k + '</b></div>').join('') + '</div></div>';
    h += '<div class="h2">วิธีปรุง<span>บวกเพิ่มจากวัตถุดิบ</span></div><div class="panel"><div class="ledger">' + E.METHODS.map((m) => '<div><span>' + esc(m.n) + '<small style="display:block">' + esc(m.note) + '</small></span><b>' + (m.perServing != null ? '+' + m.perServing + '/ที่' : '+' + m.per100g + '/100 g') + '</b></div>').join('') + '</div></div>';
    h += '<div class="h2">แหล่งข้อมูล</div><div class="b-src">' + Object.keys(E.SRC).map((k) => '<div>' + k + ' = ' + (SRC_URL[k] ? '<a href="' + SRC_URL[k] + '" target="_blank" rel="noopener">' + esc(E.SRC[k]) + '</a>' : esc(E.SRC[k])) + '</div>').join('') + '<div style="margin-top:6px">ทุกค่าเป็นค่าประมาณ ร้านจริงอาจต่างได้ ±20–30%</div></div>';
    el.innerHTML = h;
  }

  /* ---------- goal ---------- */
  function readGoal() {
    if (!gform) return;
    ['age', 'cm', 'kg', 'goalKg'].forEach((k) => { const i = $('#bg-' + k); if (i) gform[k] = i.value; });
  }
  function renderGoal(el) {
    if (!gform) gform = Object.assign({}, prof());
    const g = gform;
    const pv = { sex: g.sex, age: Number(g.age) || 0, cm: Number(g.cm) || 0, kg: B.w.length ? curKg() : (Number(g.kg) || 0), activity: Number(g.activity) || 1.2 };
    const ok = pv.age > 0 && pv.cm > 0 && pv.kg > 0;
    const days = windowDays(addDays(X.todayISO(), -1), 28);
    const b = ok ? E.budget({ profile: pv, days, deficit: Number(g.deficit) || 500, eaten: 0 }) : null;
    const seg = (key, opts) => '<div class="b-seg">' + opts.map((o) => '<button type="button" data-bg="' + key + '|' + o[0] + '" aria-pressed="' + (String(g[key]) === String(o[0])) + '">' + o[1] + (o[2] ? '<small>' + o[2] + '</small>' : '') + '</button>').join('') + '</div>';
    const rate = (d) => (Math.round(d * 7 / 7700 * 100) / 100).toFixed(2);
    let h = '<div class="sheet-body" style="padding:6px 0 0;gap:16px">';
    h += '<div class="field"><span>เพศ</span>' + seg('sex', [['male', 'ชาย'], ['female', 'หญิง']]) + '</div>';
    h += '<div class="row2"><label class="field"><span>อายุ (ปี)</span><input id="bg-age" inputmode="numeric" value="' + esc(g.age) + '"></label><label class="field"><span>ส่วนสูง (ซม.)</span><input id="bg-cm" inputmode="decimal" value="' + esc(g.cm) + '"></label></div>';
    h += '<div class="row2"><label class="field"><span>น้ำหนักเริ่มต้น (กก.)</span><input id="bg-kg" inputmode="decimal" value="' + esc(g.kg) + '"></label><label class="field"><span>เป้าหมาย (กก.)</span><input id="bg-goalKg" inputmode="decimal" value="' + esc(g.goalKg) + '"></label></div>';
    if (B.w.length) h += '<div class="hint" style="margin-top:-6px">คำนวณ BMR จากน้ำหนักเฉลี่ยล่าสุด ' + fmt1(curKg()) + ' กก. (ไม่ใช่น้ำหนักเริ่มต้น)</div>';
    h += '<div class="field"><span>กิจกรรมในวันปกติ (ไม่รวมออกกำลังกาย)</span>' + seg('activity', [[1.2, 'นั่งทั้งวัน', '×1.2'], [1.3, 'นั่งสลับเดิน', '×1.3'], [1.375, 'เดินเยอะ', '×1.375']]) + '</div>';
    h += '<div class="field"><span>ขาดดุลต่อวัน</span>' + seg('deficit', [[300, '−300', rate(300) + ' กก./สัปดาห์'], [500, '−500', rate(500) + ' กก./สัปดาห์'], [750, '−750', rate(750) + ' กก./สัปดาห์']]) + '</div>';
    h += '<div class="field"><span>แคลอรี่จากการออกกำลังกาย</span>' + seg('exerciseCredit', [[0, 'ไม่นับคืน', 'เป็นโบนัส'], [0.5, 'นับคืนครึ่งเดียว', 'กินเพิ่มได้']]) + '</div>';
    if (b) {
      h += '<div class="panel"><div class="ledger">' +
        '<div><span>BMR (Mifflin-St Jeor)</span><b>' + fmt(b.bmr) + '</b></div>' +
        '<div><span>TDEE จากสูตร (×' + pv.activity + ')</span><b>' + fmt(b.tdeeFormula) + '</b></div>' +
        (b.tdeeAdaptive != null ? '<div><span>TDEE จากข้อมูลจริง</span><b>' + fmt(b.tdeeAdaptive) + '</b></div>' : '') +
        '<div><span>− ขาดดุล</span><b>' + fmt(g.deficit) + '</b></div>' +
        '<div class="total"><span>เป้ากินต่อวัน' + (b.floored ? ' (ขั้นต่ำ)' : '') + '</span><b class="b-lime">' + fmt(b.target) + '</b></div></div>' +
        '<p class="b-src" style="margin:10px 0 0">ไม่ให้เป้าต่ำกว่า ' + (pv.sex === 'female' ? '1,200' : '1,500') + ' kcal/วัน · ลดได้ราว ' + b.kgPerWeek + ' กก./สัปดาห์</p></div>';
    }
    h += '<button class="b-btn wide" id="bgSave" type="button" style="padding:14px">บันทึกเป้าหมาย</button></div>';
    el.innerHTML = h;
  }
  function saveGoal() {
    readGoal(); const g = gform; const n = (k) => num(g[k]);
    if (!(n('age') > 0) || !(n('cm') > 0) || !(n('kg') > 0) || !(n('goalKg') > 0)) { X.toast('ใส่อายุ ส่วนสูง น้ำหนัก และเป้าหมายให้ครบ'); return; }
    saveProfile({ sex: g.sex, age: n('age'), cm: n('cm'), kg: n('kg'), goalKg: n('goalKg'), activity: Number(g.activity), deficit: Number(g.deficit), exerciseCredit: Number(g.exerciseCredit) });
    gform = null; render(); X.toast('บันทึกเป้าหมายแล้ว');
  }

  /* ---------- quick add ---------- */
  function openQuick(text, kind) {
    if (!ready) { X.toast('กำลังโหลดข้อมูล ลองอีกครั้ง'); return; }
    q = { kind: kind || 'food', text: text || '', kcal: '', meal: null, date: mode === 'body' && btab === 'today' ? day : X.todayISO(), time: X.nowHM(), money: null, amount: '', amountManual: false, acct: X.defaultFoodAcct() };
    $('#bq-body').innerHTML = quickShellHTML();
    $('#bqsheet').hidden = false; document.body.style.overflow = 'hidden'; $('#bqsheet').scrollTop = 0;
    updateQuick();
    setTimeout(() => { const i = $('#bqText'); if (i) i.focus(); }, 60);
  }
  function closeQuickSheet() { $('#bqsheet').hidden = true; document.body.style.overflow = ''; q = null; }
  function quickShellHTML() {
    const kinds = [['food', 'อาหาร'], ['weight', 'น้ำหนัก'], ['ex', 'ออกกำลังกาย']];
    let h = '<div class="b-seg" id="bqKinds">' + kinds.map((k) => '<button type="button" data-bqkind="' + k[0] + '" aria-pressed="' + (q.kind === k[0]) + '">' + k[1] + '</button>').join('') + '</div>';
    if (q.kind === 'weight') {
      h += '<label class="field"><span>น้ำหนัก (กก.)</span><input id="bqKg" class="b-input" inputmode="decimal" placeholder="เช่น 92.4" value="' + esc(weightOn(q.date) != null ? weightOn(q.date) : '') + '"></label>';
      h += '<label class="field"><span>วันที่</span><input type="date" id="bqDate" value="' + esc(q.date) + '"></label>';
      return h;
    }
    const ph = q.kind === 'ex' ? 'เช่น วิ่ง 5 km หรือ เวท 45 นาที' : 'เช่น กะเพราหมูกรอบ ไข่ดาว 65';
    h += '<input id="bqText" class="b-input" placeholder="' + ph + '" autocomplete="off" autocorrect="off" value="' + esc(q.text) + '" aria-label="พิมพ์รายการ">';
    h += '<div id="bqSugg" class="b-sugg"></div><div id="bqPrev"></div>';
    h += '<label class="field"><span>แก้ kcal เอง (ไม่ใส่ = ใช้ค่าที่คำนวณ)</span><input id="bqKcal" inputmode="numeric" placeholder="" value="' + esc(q.kcal) + '"></label>';
    if (q.kind === 'food') h += '<div class="field"><span>มื้อ</span><div class="chips" id="bqMeals"></div></div>';
    h += '<div class="row2"><label class="field"><span>วันที่</span><input type="date" id="bqDate" value="' + esc(q.date) + '"></label><label class="field"><span>เวลา</span><input type="time" id="bqTime" value="' + esc(q.time) + '"></label></div>';
    if (q.kind === 'food') {
      const accts = X.accounts();
      h += '<div class="b-card" id="bqMoney"><label class="check"><input type="checkbox" id="bqMoneyOn"> ลงรายจ่ายใน iN&amp;Ex ด้วย</label>' +
        '<div id="bqMoneyMore" style="display:flex;flex-direction:column;gap:12px;margin-top:12px">' +
        '<div class="amount-row"><span class="baht">฿</span><input id="bqAmount" inputmode="decimal" placeholder="0" autocomplete="off" aria-label="จำนวนเงิน (บาท)"></div>' +
        (accts.length ? '<div class="field"><span>จ่ายด้วย</span><div class="chips" id="bqAccts">' + accts.map((a) => '<button type="button" class="chip" data-bqacct="' + esc(a.id) + '" style="--c:' + a.color + '" aria-pressed="' + (q.acct === a.id) + '"><i></i>' + esc(a.name) + '</button>').join('') + '</div></div>' : '') +
        '<div class="b-src" id="bqCat"></div></div></div>';
    }
    return h;
  }
  function analyse() {
    if (!q || q.kind === 'weight') return null;
    if (q.kind === 'ex') { const r = exParse(q.text, curKg()); return { ex: r }; }
    const at = new Date(); if (q.time) { const p = q.time.split(':'); at.setHours(+p[0] || 0, +p[1] || 0); }
    const r = E.match(q.text, { time: at });
    return { food: r };
  }
  const subFor = (r, name) => {
    const subs = X.foodSubs(); let s = r.kind === 'drink' ? 'กาแฟ/เครื่องดื่ม' : r.kind === 'dessert' ? 'ขนม/ของว่าง' : '';
    if (!s) { const g = X.guess(name); s = g && g.cat === 'food' && g.sub ? g.sub : 'มื้อหลัก'; }
    return subs.includes(s) ? s : '';
  };
  const cleanName = (t) => String(t || '').replace(/(?:฿\s*)?\d+(?:\.\d+)?\s*(?:บาท|บ\.?|฿)?\s*$/, '').trim() || String(t || '').trim();
  function updateQuick() {
    if (!q || q.kind === 'weight') return;
    const a = analyse();
    const sg = $('#bqSugg'), pv = $('#bqPrev');
    if (q.kind === 'food') {
      const r = a.food;
      const list = q.text.trim() ? E.suggest(q.text.replace(/\d.*$/, ''), 4).filter((d) => !r || r.mode !== 'dish' || !r.lines[0] || !r.lines[0].label.startsWith(d.n)) : freqFoods().slice(0, 6).map((x) => ({ n: x.name, k: x.kcal }));
      sg.innerHTML = list.map((d) => '<button type="button" class="chip b-chip" data-bqtext="' + esc(d.n.replace(/\s*\(.*?\)/g, '')) + '">' + esc(d.n) + ' · ' + fmt(d.k) + '</button>').join('');
      if (!q.text.trim()) pv.innerHTML = '';
      else if (r.mode === 'none') pv.innerHTML = '<div class="b-prev"><div class="ln"><span>ไม่รู้จักเมนูนี้</span><span class="b-tag none">ใส่ kcal เอง</span></div><div class="b-src">ลองพิมพ์วัตถุดิบ + วิธีปรุง เช่น “หมูทอด”, “อกไก่ต้ม 150g” หรือใส่ตัวเลขในช่องแก้ kcal ด้านล่าง</div></div>';
      else pv.innerHTML = '<div class="b-prev"><div class="ln"><span style="color:var(--muted);font-size:12px">' + (r.mode === 'dish' ? 'จับได้ · เมนูสำเร็จ' : 'ประกอบจากวัตถุดิบ + วิธีปรุง') + '</span><span class="b-tag' + (r.mode === 'dish' ? '' : ' mid') + '">' + (r.mode === 'dish' ? 'แม่นยำสูง' : 'ประมาณการ') + '</span></div>' +
        r.lines.map((l) => '<div class="ln"><span>' + esc(l.label) + (l.src ? '<em>' + esc(l.src) + '</em>' : '') + '</span><b>' + (l.kcal > 0 && !l.base ? '+' : '') + fmt(l.kcal) + '</b></div>').join('') +
        '<div class="ln tot"><span>รวม</span><b>' + fmt(r.kcal) + ' kcal</b></div></div>';
      $('#bqKcal').placeholder = r.mode === 'none' ? 'จำเป็น' : String(r.kcal);
      // meal chips
      const meal = q.meal || r.meal;
      $('#bqMeals').innerHTML = MEALS.map((m) => '<button type="button" class="chip b-chip" data-bqmeal="' + m + '" aria-pressed="' + (meal === m) + '">' + m + (m === r.meal && !q.meal ? ' · อัตโนมัติ' : '') + '</button>').join('');
      // money block: on when a price was typed (unless the person switched it)
      const on = q.money != null ? q.money : r.price != null;
      $('#bqMoneyOn').checked = on; $('#bqMoneyMore').hidden = !on;
      if (!q.amountManual) $('#bqAmount').value = r.price != null ? String(r.price) : '';
      const sub = subFor(r, cleanName(q.text));
      $('#bqCat').textContent = 'หมวด: อาหาร/เครื่องดื่ม' + (sub ? ' › ' + sub : '') + ' · เลือกให้อัตโนมัติจากคำที่พิมพ์';
      $('#bqSave').textContent = 'บันทึก' + (r.kcal || num(q.kcal) ? ' · ' + fmt(num(q.kcal) || r.kcal) + ' kcal' : '');
    } else {
      sg.innerHTML = EX.filter((e, i, arr) => arr.findIndex((z) => z[1] === e[1] && z[2] === e[2]) === i).slice(0, 8).map((e) => '<button type="button" class="chip b-chip" data-bqtext="' + esc(e[0]) + ' ">' + esc(e[0]) + '</button>').join('');
      const r = a.ex;
      pv.innerHTML = !q.text.trim() ? '' : !r ? '<div class="b-prev"><div class="ln"><span>ไม่รู้จักกิจกรรมนี้</span><span class="b-tag none">ใส่ kcal เอง</span></div></div>' :
        r.kcal == null ? '<div class="b-prev"><div class="ln"><span>' + esc(r.name) + '</span><span class="b-tag mid">ใส่ระยะหรือเวลา</span></div><div class="b-src">เช่น “' + esc(r.name) + ' 5 km” หรือ “' + esc(r.name) + ' 30 นาที”</div></div>' :
          '<div class="b-prev"><div class="ln"><span>' + esc(r.how) + '</span></div><div class="ln tot"><span>เผาผลาญ</span><b>' + fmt(r.kcal) + ' kcal</b></div></div>';
      $('#bqKcal').placeholder = r && r.kcal != null ? String(r.kcal) : 'จำเป็น';
      $('#bqSave').textContent = 'บันทึก';
    }
  }
  async function saveQuick() {
    if (!q) return;
    const btn = $('#bqSave');
    if (q.kind === 'weight') {
      const kg = num($('#bqKg').value), d = $('#bqDate').value || X.todayISO();
      if (!(kg > 20 && kg < 400)) { X.toast('ใส่น้ำหนักเป็นกิโลกรัม เช่น 92.4'); return; }
      upsert('w', { id: 'w:' + d, d, kg }); closeQuickSheet(); X.toast('บันทึกน้ำหนัก ' + fmt1(kg) + ' กก.'); return;
    }
    q.text = $('#bqText').value; q.kcal = $('#bqKcal').value; q.date = $('#bqDate').value || X.todayISO(); q.time = $('#bqTime').value || '';
    const a = analyse(); const over = num(q.kcal);
    if (Number.isNaN(over) || (over != null && over < 0)) { X.toast('kcal ต้องเป็นตัวเลข'); return; }
    if (!q.text.trim()) { X.toast('พิมพ์ชื่ออาหารหรือกิจกรรมก่อน'); return; }
    if (q.kind === 'ex') {
      const r = a.ex; const kcal = over != null ? over : r && r.kcal;
      if (!(kcal > 0)) { X.toast('ใส่ kcal หรือระยะ/เวลา เช่น วิ่ง 5 km'); return; }
      upsert('x', { id: nid('x'), d: q.date, t: q.time, name: q.text.trim(), kcal: Math.round(kcal) });
      closeQuickSheet(); X.toast('บันทึกออกกำลังกาย +' + fmt(kcal) + ' kcal'); return;
    }
    const r = a.food; const kcal = over != null ? over : r.kcal;
    if (!(kcal > 0) && r.mode === 'none') { X.toast('ไม่รู้จักเมนูนี้ ใส่ kcal เอง'); $('#bqKcal').focus(); return; }
    const name = cleanName(q.text);
    const item = { id: nid('f'), d: q.date, t: q.time, name, kcal: Math.round(kcal), meal: q.meal || r.meal, src: over != null ? 'manual' : r.mode, lines: r.lines.map((l) => [l.label, l.kcal, l.src || '']) };
    const moneyOn = $('#bqMoneyOn') && $('#bqMoneyOn').checked;
    let paid = null;
    if (moneyOn) {
      const amt = num($('#bqAmount').value);
      if (Number.isNaN(amt) || amt == null || amt <= 0) { X.toast('ใส่จำนวนเงิน หรือเอาเครื่องหมายลงรายจ่ายออก'); $('#bqAmount').focus(); return; }
      btn.disabled = true;
      try {
        const sub = subFor(r, name);
        item.exp = await X.addExpense({ date: q.date, time: q.time, amount: amt, note: name, sub, acct: q.acct });
        paid = amt;
      } catch (e) { btn.disabled = false; X.toast('ลงรายจ่ายไม่สำเร็จ ยังไม่ได้บันทึกอะไร'); return; }
      btn.disabled = false;
    }
    upsert('f', item); closeQuickSheet();
    X.toast('บันทึก ' + fmt(item.kcal) + ' kcal' + (paid != null ? ' + รายจ่าย ฿' + X.fmtB(paid) : ''));
  }

  /* ---------- edit sheet (food / weight / exercise) ---------- */
  function openEdit(kind, id) {
    const it = kind === 'w' ? B.w.find((x) => x.d === id) : B[kind].find((x) => x.id === id);
    if (!it) return;
    bx = { kind, it: Object.assign({}, it) }; delArmed = false;
    $('#bxTitle').textContent = kind === 'w' ? 'น้ำหนัก' : kind === 'x' ? 'ออกกำลังกาย' : 'อาหาร';
    let h = '';
    if (kind === 'w') h += '<label class="field"><span>น้ำหนัก (กก.)</span><input id="bxKg" class="b-input" inputmode="decimal" value="' + esc(it.kg) + '"></label><div class="hint">วันที่ ' + shortD(it.d) + '</div>';
    else {
      h += '<label class="field"><span>ชื่อ</span><input id="bxName" value="' + esc(it.name) + '"></label><label class="field"><span>kcal</span><input id="bxKcal" inputmode="numeric" value="' + esc(it.kcal) + '"></label>';
      if (kind === 'f') h += '<div class="field"><span>มื้อ</span><div class="chips">' + MEALS.map((m) => '<button type="button" class="chip b-chip" data-bxmeal="' + m + '" aria-pressed="' + (it.meal === m) + '">' + m + '</button>').join('') + '</div></div>';
      h += '<div class="row2"><label class="field"><span>วันที่</span><input type="date" id="bxDate" value="' + esc(it.d) + '"></label><label class="field"><span>เวลา</span><input type="time" id="bxTime" value="' + esc(it.t || '') + '"></label></div>';
      if (kind === 'f' && Array.isArray(it.lines) && it.lines.length) h += '<div class="b-prev">' + it.lines.map((l) => '<div class="ln"><span>' + esc(l[0]) + (l[2] ? '<em>' + esc(l[2]) + '</em>' : '') + '</span><b>' + fmt(l[1]) + '</b></div>').join('') + '</div>';
      if (kind === 'f' && it.exp) { const e = X.expenseById(it.exp); h += '<div class="b-src">' + (e ? 'ลิงก์กับรายจ่าย ฿' + X.fmtB(e.amount) + ' (' + esc(e.note || '') + ') · การลบตรงนี้ไม่ลบรายจ่าย ถ้าต้องการลบรายจ่ายให้ลบที่โหมด ฿' : 'รายจ่ายที่เคยลิงก์ไว้ถูกลบไปแล้ว') + '</div>'; }
    }
    h += '<button id="bxDel" class="danger" type="button">ลบรายการนี้</button>';
    $('#bx-body').innerHTML = h; $('#bxsheet').hidden = false; document.body.style.overflow = 'hidden';
  }
  function closeEdit() { $('#bxsheet').hidden = true; document.body.style.overflow = ''; bx = null; }
  function saveEdit() {
    if (!bx) return; const { kind, it } = bx;
    if (kind === 'w') { const kg = num($('#bxKg').value); if (!(kg > 20 && kg < 400)) { X.toast('ใส่น้ำหนักเป็นกิโลกรัม'); return; } upsert('w', Object.assign({}, it, { kg })); closeEdit(); X.toast('แก้แล้ว'); return; }
    const kcal = num($('#bxKcal').value); if (!(kcal >= 0)) { X.toast('kcal ต้องเป็นตัวเลข'); return; }
    const row = Object.assign({}, it, { name: $('#bxName').value.trim() || it.name, kcal: Math.round(kcal), d: $('#bxDate').value || it.d, t: $('#bxTime').value || '' });
    if (kcal !== Number(it.kcal)) row.src = 'manual';
    upsert(kind, row); closeEdit(); X.toast('แก้แล้ว');
  }
  function deleteEdit(btn) {
    if (!bx) return;
    if (!delArmed) { delArmed = true; btn.classList.add('armed'); btn.textContent = 'แตะอีกครั้งเพื่อยืนยันการลบ'; clearTimeout(delT); delT = setTimeout(() => { delArmed = false; if (btn.isConnected) { btn.classList.remove('armed'); btn.textContent = 'ลบรายการนี้'; } }, 3500); return; }
    const { kind, it } = bx; removeItem(kind, it.id); closeEdit(); X.toast('ลบแล้ว');
  }

  /* ---------- events ---------- */
  document.addEventListener('click', (ev) => {
    const t = ev.target.closest('button'); if (!t) return; const ds = t.dataset;
    if (ds.modesw) { setMode(ds.modesw); return; }
    if (ds.bodyquick) { X.closeQuick(); openQuick(''); return; }
    if (ds.btab) { setBTab(ds.btab); return; }
    if (t.id === 'bAdd') { openQuick(''); return; }
    if (ds.bday) { const n = addDays(day, Number(ds.bday)); if (n <= X.todayISO()) { day = n; render(); } return; }
    if (t.id === 'bwQuickSave') { const kg = num($('#bwQuick').value); if (!(kg > 20 && kg < 400)) { X.toast('ใส่น้ำหนักเป็นกิโลกรัม เช่น 92.4'); return; } $('#bwQuick').blur(); upsert('w', { id: 'w:' + day, d: day, kg }); X.toast('บันทึกน้ำหนัก ' + fmt1(kg) + ' กก.'); return; }
    if (ds.bw) { openEdit('w', ds.bw); return; }
    if (ds.bf) { openEdit('f', ds.bf); return; }
    if (ds.bxe) { openEdit('x', ds.bxe); return; }
    if (ds.brange != null) { trendRange = Number(ds.brange); render(); return; }
    if (ds.bg) { readGoal(); const [k, v] = ds.bg.split('|'); gform[k] = k === 'sex' ? v : Number(v); renderGoal($('#bview-goal')); return; }
    if (t.id === 'bgSave') { saveGoal(); return; }
    // quick add sheet
    if (t.id === 'bqCancel') { closeQuickSheet(); return; }
    if (t.id === 'bqSave') { saveQuick(); return; }
    if (ds.bqkind && q) { q.text = $('#bqText') ? $('#bqText').value : q.text; q.kind = ds.bqkind; q.money = null; $('#bq-body').innerHTML = quickShellHTML(); updateQuick(); return; }
    if (ds.bqtext != null) {
      if (!q) { openQuick(ds.bqtext); return; }
      const i = $('#bqText'); if (!i) return; i.value = ds.bqtext; q.text = ds.bqtext; updateQuick(); i.focus(); return;
    }
    if (ds.bqmeal && q) { q.meal = ds.bqmeal; updateQuick(); return; }
    if (ds.bqacct && q) { q.acct = ds.bqacct; $$('[data-bqacct]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.bqacct === q.acct))); return; }
    // edit sheet
    if (t.id === 'bxCancel') { closeEdit(); return; }
    if (t.id === 'bxSave') { saveEdit(); return; }
    if (t.id === 'bxDel') { deleteEdit(t); return; }
    if (ds.bxmeal && bx) { bx.it.meal = ds.bxmeal; $$('[data-bxmeal]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.bxmeal === ds.bxmeal))); return; }
  });
  document.addEventListener('input', (ev) => {
    const t = ev.target;
    if (t.id === 'bqText' && q) { q.text = t.value; updateQuick(); return; }
    if (t.id === 'bqKcal' && q) { q.kcal = t.value; updateQuick(); return; }
    if (t.id === 'bqAmount' && q) { q.amountManual = true; return; }
    if (t.id === 'bfSearch') { fq = t.value; const l = $('#bfList'); if (l) l.innerHTML = foodListHTML(); return; }
  });
  document.addEventListener('change', (ev) => {
    const t = ev.target;
    if (t.id === 'bqMoneyOn' && q) { q.money = t.checked; $('#bqMoneyMore').hidden = !t.checked; return; }
    if (t.id === 'bqTime' && q) { q.time = t.value; updateQuick(); return; }
    if (t.id === 'bqDate' && q) { q.date = t.value; return; }
  });
  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') { if (!$('#bqsheet').hidden) closeQuickSheet(); else if (!$('#bxsheet').hidden) closeEdit(); }
    if (ev.key === 'Enter' && ev.target && ev.target.id === 'bwQuick') { ev.preventDefault(); $('#bwQuickSave').click(); }
  });
  function handleHash() {
    const h = (location.hash || '').replace('#', '');
    if (h === 'kcal' || h === 'body') { setMode('body'); return; }
    if (h === 'kcal-add') { setMode('body'); openQuick(''); return; }
    if (h === 'weight') { setMode('body'); openQuick('', 'weight'); }
  }
  window.addEventListener('hashchange', handleHash);

  window.BODY = {
    applyRemote, enqueueAll, exportData, importData, openQuick, setMode,
    active: () => { try { return localStorage.getItem('inex-mode') === 'body'; } catch (e) { return false; } },
  };

  // show the right mode immediately, then load data once the money store is open
  if (window.BODY.active()) setMode('body');
  X.ready().then(async () => {
    const v = await X.kvGet('body');
    if (v && typeof v === 'object') B = { profile: v.profile || null, w: Array.isArray(v.w) ? v.w : [], f: Array.isArray(v.f) ? v.f : [], x: Array.isArray(v.x) ? v.x : [] };
    ready = true;
    pending.splice(0).forEach(applyRemote);
    render(); handleHash();
  });
})();
