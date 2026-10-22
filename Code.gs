/**
 * iN&Ex — Google Sheet backend
 * วิธีใช้: วางโค้ดนี้ใน Extensions > Apps Script ของ Google Sheet เปล่า
 * 1) เลือกฟังก์ชัน setup แล้วกด Run (อนุญาตสิทธิ์ครั้งแรก)
 * 2) Deploy > New deployment > Web app > Execute as: Me, Who has access: Anyone > Deploy
 * 3) คัดลอก Web app URL และรหัสลับจากแท็บ "ตั้งค่า" ไปใส่ในแอป
 * 4) (สำรองทุกคืน) เลือกฟังก์ชัน setupBackup แล้วกด Run ครั้งเดียว — Google จะก๊อปทั้ง Sheet
 *    ไปไว้ในโฟลเดอร์ "iN&Ex Backup" บน Drive ทุกคืนหลังเที่ยงคืน เก็บย้อนหลัง 30 วัน
 * v2: แท็บ "งาน" และ "ประวัติเอกสาร" (โหมด To Do) + สำรองไป Drive
 */
var DATA = '_data';
var ACC = 'บัญชี';
var SET = 'ตั้งค่า';
var TASKS = 'งาน';
var DOCLOG = 'ประวัติเอกสาร';
var KEEP_DAYS = 30;
var BACKUP_PREFIX = 'iN&Ex สำรอง ';
var COLLS = ['expenses', 'incomes', 'accounts', 'moves', 'assets', 'trades', 'meta'];

var CAT = {food: 'อาหาร/เครื่องดื่ม', transport: 'เดินทาง', housing: 'ที่พัก', bills: 'บิล/ค่าน้ำไฟ', shopping: 'ของใช้/ช้อปปิ้ง',
  health: 'สุขภาพ', fun: 'บันเทิง/งานอดิเรก', work: 'งาน/การเรียน', family: 'ครอบครัว/ให้', other: 'อื่นๆ'};
var MODE = {bts: 'BTS', mrt: 'MRT', arl: 'Airport Rail Link', red: 'สายสีแดง', bus: 'รถเมล์', win: 'วิน', taxi: 'แท็กซี่',
  app: 'Grab/Bolt', boat: 'เรือ', van: 'รถตู้', train: 'รถไฟ', car: 'รถส่วนตัว', other: 'อื่นๆ'};
var INC = {salary: ['เงินเดือน', '1'], bonus: ['โบนัส', '1'], ot: ['OT / เบี้ยเลี้ยง / ค่าตอบแทน', '1'],
  freelance: ['งานพิเศษ / ฟรีแลนซ์', '2'], engineer: ['วิชาชีพอิสระ (วิศวกรรม)', '6'], contract: ['รับเหมา', '7'],
  rent: ['ค่าเช่า', '5'], interest: ['ดอกเบี้ยเงินฝาก', '4'], dividend: ['เงินปันผล', '4'], royalty: ['ค่าลิขสิทธิ์', '3'],
  business: ['ขายของ / รายได้อื่น', '8'], exempt: ['ไม่ต้องเสียภาษี', 'x']};
var ACT = {bank: 'บัญชีธนาคาร', cash: 'เงินสด', credit: 'บัตรเครดิต', ewallet: 'e-wallet / บัตรเติมเงิน'};
var PROV = {kbank: 'กสิกรไทย', scb: 'ไทยพาณิชย์', bbl: 'กรุงเทพ', ktb: 'กรุงไทย', bay: 'กรุงศรีอยุธยา', ttb: 'ทหารไทยธนชาต',
  gsb: 'ออมสิน', baac: 'ธ.ก.ส.', ghb: 'อาคารสงเคราะห์', uob: 'ยูโอบี', cimb: 'ซีไอเอ็มบี ไทย', kkp: 'เกียรตินาคินภัทร',
  lhb: 'แลนด์ แอนด์ เฮ้าส์', tisco: 'ทิสโก้', icbc: 'ไอซีบีซี (ไทย)', otherbank: 'ธนาคารอื่น', truemoney: 'TrueMoney Wallet',
  rabbit: 'บัตร Rabbit', mrtcard: 'บัตร MRT', shopeepay: 'ShopeePay', linepay: 'Rabbit LINE Pay', otherwallet: 'อื่นๆ',
  ktc: 'KTC', cardx: 'CardX', firstchoice: 'กรุงศรี เฟิร์สช้อยส์', aeon: 'อิออน', spaylater: 'SPayLater', lazpaylater: 'LazPayLater',
  paynext: 'TrueMoney Pay Next', atome: 'Atome', grabpl: 'Grab PayLater', otherpl: 'อื่นๆ'};
function actName(a) { return a.type === 'credit' && a.pl ? 'PayLater' : (ACT[a.type] || ''); }
var TH_M = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];

/* ---------- one-time setup ---------- */
function setup() {
  var ss = SpreadsheetApp.getActive();
  var d = ss.getSheetByName(DATA);
  if (!d) {
    d = ss.insertSheet(DATA);
    d.getRange(1, 1, 1, 5).setValues([['collection', 'id', 'updatedAt', 'deleted', 'json']]);
    d.setFrozenRows(1);
  }
  d.hideSheet();
  var props = PropertiesService.getScriptProperties();
  var key = props.getProperty('SECRET');
  if (!key) {
    key = Utilities.getUuid().replace(/-/g, '').slice(0, 24);
    props.setProperty('SECRET', key);
  }
  var s = ss.getSheetByName(SET);
  if (!s) s = ss.insertSheet(SET);
  s.clear();
  s.getRange(1, 1, 4, 2).setValues([
    ['รหัสลับ (ใส่ในแอป)', key],
    ['ขั้นต่อไป', 'Deploy > New deployment > Web app > Execute as: Me > Who has access: Anyone > Deploy แล้วคัดลอก Web app URL ไปใส่ในแอป'],
    ['คำเตือน', 'อย่าแชร์ไฟล์นี้หรือรหัสลับกับใคร'],
    ['แท็บ _data', 'แท็บซ่อนที่แอปใช้เก็บข้อมูลจริง ห้ามแก้หรือลบ']
  ]);
  s.getRange(1, 1, 4, 1).setFontWeight('bold');
  s.setColumnWidth(1, 200);
  s.setColumnWidth(2, 560);
  if (!ss.getSheetByName(ACC)) ss.insertSheet(ACC, 0);
  ['Sheet1', 'ชีต1', 'แผ่นงาน1'].forEach(function (n) {
    var x = ss.getSheetByName(n);
    if (x && ss.getSheets().length > 1 && x.getLastRow() === 0) ss.deleteSheet(x);
  });
  var all = readAll(d);
  rebuild(ss, all, {}, true);
  writeTodo(ss, all);
  Logger.log('SECRET: ' + key);
}

/* ---------- web app ---------- */
function doGet() {
  return ContentService.createTextOutput('iN&Ex API is running');
}

function doPost(e) {
  var body;
  try { body = JSON.parse(e.postData.contents); } catch (err) { return out({ok: false, error: 'bad request'}); }
  var key = PropertiesService.getScriptProperties().getProperty('SECRET');
  if (!key || body.key !== key) return out({ok: false, error: 'รหัสลับไม่ถูกต้อง'});
  var lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try {
    var ss = SpreadsheetApp.getActive();
    var sh = ss.getSheetByName(DATA);
    if (!sh) return out({ok: false, error: 'ยังไม่ได้รัน setup'});
    if (body.action === 'ping') return out({ok: true, ver: 2, sheetUrl: ss.getUrl(), lastBackup: lastBackup()});
    if (body.action === 'push') return out(push(ss, sh, body.ops || []));
    if (body.action === 'pull') return out(pull(ss, sh, Number(body.since) || 0));
    if (body.action === 'backup') { var b = backupNow(); b.ok = true; return out(b); }
    return out({ok: false, error: 'unknown action'});
  } finally {
    lock.releaseLock();
  }
}

function out(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

function readAll(sh) {
  var n = sh.getLastRow();
  if (n < 2) return [];
  return sh.getRange(2, 1, n - 1, 5).getValues();
}

function push(ss, sh, ops) {
  var rows = readAll(sh);
  var idx = {};
  var last = 0;
  rows.forEach(function (r, i) { idx[r[0] + '|' + r[1]] = i; last = Math.max(last, Number(r[2]) || 0); });
  var now = Math.max(Date.now(), last + 1);
  var months = {};
  var count = 0;
  var todo = false;
  ops.forEach(function (o) {
    if (!o || COLLS.indexOf(o.c) < 0 || !o.id) return;
    if (o.c === 'meta' && String(o.id).indexOf('todo:') === 0) todo = true;
    var k = o.c + '|' + o.id;
    var del = o.op === 'del';
    var json = del ? '' : JSON.stringify(o.doc || {});
    now++;
    if (idx[k] !== undefined) {
      var old = rows[idx[k]];
      try { var od = JSON.parse(old[4] || '{}'); if (od.date) months[String(od.date).slice(0, 7)] = 1; } catch (err) {}
      rows[idx[k]] = [o.c, String(o.id), now, del ? 1 : 0, json];
    } else {
      idx[k] = rows.length;
      rows.push([o.c, String(o.id), now, del ? 1 : 0, json]);
    }
    if (!del && o.doc && o.doc.date) months[String(o.doc.date).slice(0, 7)] = 1;
    count++;
  });
  if (rows.length) {
    sh.getRange(2, 2, rows.length, 1).setNumberFormat('@');
    sh.getRange(2, 1, rows.length, 5).setValues(rows);
  }
  rebuild(ss, rows, months, true);
  if (todo) writeTodo(ss, rows);
  return {ok: true, applied: count, serverTs: now, sheetUrl: ss.getUrl()};
}

function pull(ss, sh, since) {
  var rows = readAll(sh);
  var max = since;
  var docs = [];
  rows.forEach(function (r) {
    var u = Number(r[2]) || 0;
    if (u > max) max = u;
    if (u > since) {
      var doc = null;
      if (!r[3]) { try { doc = JSON.parse(r[4]); } catch (err) {} }
      docs.push({c: r[0], id: String(r[1]), deleted: !!r[3], doc: doc});
    }
  });
  return {ok: true, docs: docs, serverTs: max, sheetUrl: ss.getUrl(), lastBackup: lastBackup()};
}

/* ---------- readable tabs ---------- */
function num(v) { var n = Number(v); return isNaN(n) ? 0 : n; }
function incNet(e) { return num(e.amount) - num(e.wht) - num(e.sso) - num(e.pvd); }

function collect(rows) {
  var D = {expenses: [], incomes: [], accounts: [], moves: [], assets: [], trades: []};
  rows.forEach(function (r) {
    if (r[3] || !D[r[0]]) return;
    try { var d = JSON.parse(r[4]); d.id = String(r[1]); D[r[0]].push(d); } catch (err) {}
  });
  return D;
}

function balances(D) {
  var b = {};
  D.accounts.forEach(function (a) { b[a.id] = 0; });
  function add(id, v) { if (id && b[id] !== undefined) b[id] += v; }
  D.expenses.forEach(function (e) { add(e.acct, -num(e.amount)); if (e.reimbDone && e.reimbAcct) add(e.reimbAcct, num(e.amount)); });
  D.incomes.forEach(function (e) { add(e.acct, incNet(e)); });
  D.trades.forEach(function (t) { add(t.acct, t.type === 'buy' ? -num(t.amount) : num(t.amount)); });
  D.moves.forEach(function (m) {
    if (m.type === 'transfer') { add(m.from, -num(m.amount)); add(m.to, num(m.amount)); }
    else if (m.type === 'adjust') add(m.account, num(m.amount));
  });
  return b;
}

function masked(a) {
  if (a.type === 'credit') return a.last4 ? 'XXXX-XXXX-XXXX-' + a.last4 : '';
  var d = String(a.number || '').replace(/\D/g, '');
  if (!d) return '';
  var k = Math.min(4, d.length);
  var m = new Array(d.length - k + 1).join('X') + d.slice(-k);
  if (m.length === 10) return m.slice(0, 3) + '-' + m[3] + '-' + m.slice(4, 9) + '-' + m[9];
  return m.match(/.{1,4}/g).join('-');
}

function mins(a, b) {
  function tm(t) { var p = String(t || '').split(':'); if (p.length < 2) return null; var h = +p[0], m = +p[1]; return isNaN(h) || isNaN(m) ? null : h * 60 + m; }
  var x = tm(a), y = tm(b);
  return x === null || y === null ? '' : ((y - x) % 1440 + 1440) % 1440;
}

function rebuild(ss, rows, months, accounts) {
  var D = collect(rows);
  if (accounts) writeAccounts(ss, D);
  Object.keys(months).forEach(function (m) { if (/^\d{4}-\d{2}$/.test(m)) writeMonth(ss, D, m); });
}

function writeAccounts(ss, D) {
  var sh = ss.getSheetByName(ACC) || ss.insertSheet(ACC, 0);
  sh.clear();
  var bal = balances(D);
  var out = [['บัญชี', 'ประเภท', 'ธนาคาร/ผู้ให้บริการ', 'เลข (ปิดบางส่วน)', 'ยอดคงเหลือ']];
  var cash = 0, debt = 0;
  D.accounts.forEach(function (a) {
    var v = Math.round((bal[a.id] || 0) * 100) / 100;
    if (a.type === 'credit') debt += -v; else cash += v;
    out.push([a.name || '', actName(a), PROV[a.bank] || '', masked(a), v]);
  });
  out.push(['', '', '', '', '']);
  out.push(['เงินทั้งหมด (ไม่รวมบัตรเครดิต/PayLater)', '', '', '', Math.round(cash * 100) / 100]);
  out.push(['หนี้บัตรเครดิต / PayLater', '', '', '', Math.round(debt * 100) / 100]);
  out.push(['สุทธิ', '', '', '', Math.round((cash - debt) * 100) / 100]);
  out.push(['อัปเดตล่าสุด', Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd HH:mm'), '', '', '']);
  sh.getRange(1, 1, out.length, 5).setValues(out);
  sh.getRange(1, 1, 1, 5).setFontWeight('bold');
  sh.getRange(out.length - 4, 1, 3, 5).setFontWeight('bold');
  sh.getRange(2, 5, out.length - 1, 1).setNumberFormat('#,##0.00');
  sh.setFrozenRows(1);
  sh.autoResizeColumns(1, 5);
}

function writeMonth(ss, D, month) {
  var inm = function (x) { return String(x.date || '').slice(0, 7) === month; };
  var acct = {};
  D.accounts.forEach(function (a) { acct[a.id] = a.name || ''; });
  var asset = {};
  D.assets.forEach(function (a) { asset[a.id] = a; });
  var an = function (id) { return acct[id] || ''; };
  var ex = D.expenses.filter(inm), inc = D.incomes.filter(inm), trd = D.trades.filter(inm), mvs = D.moves.filter(inm);
  var personal = ex.filter(function (e) { return !e.reimb; });
  var spend = 0, incG = 0, incN = 0, wht = 0, buy = 0, reimb = 0;
  personal.forEach(function (e) { spend += num(e.amount); });
  ex.forEach(function (e) { if (e.reimb) reimb += num(e.amount); });
  inc.forEach(function (e) { incG += num(e.amount); incN += incNet(e); wht += num(e.wht); });
  trd.forEach(function (t) { if (t.type === 'buy') buy += num(t.amount); });

  var piv = {}, catTot = {};
  personal.forEach(function (e) {
    var c = CAT[e.cat] || 'อื่นๆ';
    var s = e.cat === 'transport' ? (MODE[e.mode] || 'ไม่ระบุ') : (e.sub || 'ไม่ระบุ');
    var k = c + '\u0001' + s;
    piv[k] = (piv[k] || 0) + num(e.amount);
    catTot[c] = (catTot[c] || 0) + num(e.amount);
  });
  var cats = Object.keys(piv).sort(function (a, b) {
    var ca = a.split('\u0001')[0], cb = b.split('\u0001')[0];
    return (catTot[cb] - catTot[ca]) || (piv[b] - piv[a]);
  });

  var ledger = [];
  ex.forEach(function (e) {
    var tr = e.cat === 'transport';
    ledger.push([e.date || '', e.time || '', e.reimb ? 'รายจ่าย (เบิกได้)' : 'รายจ่าย', CAT[e.cat] || 'อื่นๆ',
      tr ? (MODE[e.mode] || '') : (e.sub || ''), (e.note || '') + (e.plan && e.plan.n > 1 ? ' [ผ่อน ' + e.plan.n + ' งวด × ' + e.plan.monthly + ']' : ''), e.amount === null || e.amount === undefined || e.amount === '' ? '' : -num(e.amount),
      an(e.acct), e.from || '', e.to || '', e.tTrainArr || '', e.tDepart || '', e.tArrive || '', mins(e.tDepart, e.tArrive),
      e.reimb ? (e.reimbDone ? 'เบิกแล้ว ' + e.reimbDone : 'รอเบิก') : '', '', '']);
  });
  inc.forEach(function (e) {
    var t = INC[e.type] || ['รายได้อื่น', '8'];
    ledger.push([e.date || '', '', 'รายรับ', t[0], t[1] === 'x' ? 'ยกเว้นภาษี' : '40(' + t[1] + ')', e.payer || e.note || '', incNet(e),
      an(e.acct), '', '', '', '', '', '', '', num(e.wht) || '', (e.cert ? '50 ทวิ ✓ ' : '') + 'ก่อนหัก ' + num(e.amount)]);
  });
  trd.forEach(function (t) {
    var a = asset[t.assetId] || {};
    var lbl = t.type === 'buy' ? 'ลงทุน (ซื้อ)' : t.type === 'div' ? 'ปันผล' : 'ขาย/ถอน';
    ledger.push([t.date || '', '', lbl, a.kind || '', a.name || '', t.note || '', t.type === 'buy' ? -num(t.amount) : num(t.amount),
      an(t.acct), '', '', '', '', '', '', '', '', t.units ? t.units + ' หน่วย' : '']);
  });
  mvs.forEach(function (m) {
    if (m.type === 'transfer') ledger.push([m.date || '', '', 'โอน', '', '', m.note || '', num(m.amount), an(m.from) + ' → ' + an(m.to), '', '', '', '', '', '', '', '', '']);
    else ledger.push([m.date || '', '', 'ปรับยอด', '', '', m.note || '', num(m.amount), an(m.account), '', '', '', '', '', '', '', '', '']);
  });
  ledger.sort(function (a, b) { return String(a[0] + a[1]).localeCompare(String(b[0] + b[1])); });

  var sh = ss.getSheetByName(month);
  if (!sh) sh = ss.insertSheet(month, 1);
  sh.clear();
  var y = +month.slice(0, 4), mo = +month.slice(5, 7);
  var sum = [
    ['เดือน', TH_M[mo - 1] + ' ' + (y + 543)],
    ['รายจ่ายส่วนตัว', Math.round(spend * 100) / 100],
    ['รายรับก่อนหัก', Math.round(incG * 100) / 100],
    ['รายรับสุทธิ (รับจริง)', Math.round(incN * 100) / 100],
    ['ภาษีถูกหัก ณ ที่จ่าย', Math.round(wht * 100) / 100],
    ['ลงทุน (ซื้อ)', Math.round(buy * 100) / 100],
    ['เหลือหลังจ่าย+ลงทุน', Math.round((incN - spend - buy) * 100) / 100],
    ['สำรองจ่ายงาน (เบิกได้)', Math.round(reimb * 100) / 100],
    ['อัปเดตล่าสุด', Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd HH:mm')]
  ];
  sh.getRange(1, 1, sum.length, 2).setValues(sum);
  sh.getRange(1, 1, sum.length, 1).setFontWeight('bold');
  sh.getRange(2, 2, 7, 1).setNumberFormat('#,##0.00');

  var catRows = [['หมวดหลัก', 'หมวดย่อย', 'ยอดรวม (บาท)', '% ของรายจ่าย']];
  cats.forEach(function (k) {
    var p = k.split('\u0001');
    catRows.push([p[0], p[1], Math.round(piv[k] * 100) / 100, spend ? Math.round(piv[k] / spend * 1000) / 10 : 0]);
  });
  sh.getRange(1, 4, catRows.length, 4).setValues(catRows);
  sh.getRange(1, 4, 1, 4).setFontWeight('bold');
  if (catRows.length > 1) sh.getRange(2, 6, catRows.length - 1, 1).setNumberFormat('#,##0.00');

  var start = Math.max(sum.length, catRows.length) + 3;
  var head = ['วันที่', 'เวลา', 'ประเภท', 'หมวดหลัก', 'หมวดย่อย', 'รายละเอียด', 'จำนวนเงิน (+เข้า / −ออก)', 'บัญชี',
    'ต้นทาง', 'ปลายทาง', 'รถถึงต้นทาง', 'รถออก', 'ถึงปลายทาง', 'นั่ง (นาที)', 'เบิกได้', 'ภาษีหัก', 'หมายเหตุ'];
  sh.getRange(start - 1, 1).setValue('รายการทั้งหมดของเดือน').setFontWeight('bold');
  sh.getRange(start, 1, 1, head.length).setValues([head]).setFontWeight('bold');
  if (ledger.length) {
    sh.getRange(start + 1, 1, ledger.length, 2).setNumberFormat('@');
    sh.getRange(start + 1, 1, ledger.length, head.length).setValues(ledger);
    sh.getRange(start + 1, 7, ledger.length, 1).setNumberFormat('#,##0.00;[Red]-#,##0.00');
  }
  sh.autoResizeColumns(1, head.length);
}

/* ---------- To Do: readable tabs "งาน" and "ประวัติเอกสาร" (built from meta docs todo:*) ---------- */
var AREA = {mea: 'MEA', study: 'เรียน', me: 'ส่วนตัว'};
var REPEAT = {d: 'ทุกวัน', w: 'ทุกสัปดาห์', m: 'ทุกเดือน'};
var LOGK = {send: 'ส่งเอกสาร', back: 'ได้เอกสารคืน', step: 'เสร็จขั้น', open: 'เปิดงาน', close: 'ปิดงาน', reopen: 'เปิดงานอีกครั้ง'};

function collectTodo(rows) {
  var T = {t: [], j: [], l: []};
  rows.forEach(function (r) {
    if (r[0] !== 'meta' || r[3]) return;
    var id = String(r[1]);
    if (id.indexOf('todo:') !== 0) return;
    id = id.slice(5);
    var k = id.split(':')[0];
    if (!T[k]) return;
    try { var d = JSON.parse(r[4]); d.id = id; T[k].push(d); } catch (err) {}
  });
  return T;
}

function sheetFresh(ss, name) {
  var sh = ss.getSheetByName(name) || ss.insertSheet(name);
  sh.clear();
  return sh;
}

function writeTodo(ss, rows) {
  var T = collectTodo(rows);
  if (!T.t.length && !T.j.length && !ss.getSheetByName(TASKS)) return;
  var job = {};
  T.j.forEach(function (j) { job[j.id] = j; });
  var stepOf = function (j, i) { var s = j && j.steps && j.steps[Number(i)]; return s ? s.n : ''; };
  var W = 12;
  var padRow = function (a) { while (a.length < W) a.push(''); return a; };

  var out = [padRow(['อัปเดตล่าสุด', Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd HH:mm')]), padRow([])];
  var jobHead = out.length;
  out.push(padRow(['งาน MEA', 'เลขที่', 'ขั้นปัจจุบัน', 'ความคืบหน้า', 'เอกสารอยู่ที่', 'ตามงานวันที่', 'สถานะ']));
  T.j.slice().sort(function (a, b) { return (a.closed ? 1 : 0) - (b.closed ? 1 : 0) || (a.created || 0) - (b.created || 0); }).forEach(function (j) {
    var steps = j.steps || [];
    var done = j.closed ? steps.length : Math.min(Number(j.cur) || 0, steps.length);
    out.push(padRow([j.name || '', j.ref || '', steps.length ? (Number(j.cur) + 1) + '. ' + stepOf(j, j.cur) : '', done + '/' + steps.length,
      j.wait ? (j.holder || '') : 'เรา', j.wait ? (j.follow || '') : '', j.closed ? 'ปิดแล้ว ' + j.closed : 'เปิดอยู่']));
  });
  out.push(padRow([]));
  var taskHead = out.length;
  out.push(['สถานะ', 'หมวด', 'ชื่องาน', 'งาน MEA', 'ขั้นตอน', 'กำหนดส่ง', 'เวลา', 'สำคัญ', 'ทำซ้ำ', 'งานย่อย', 'หมายเหตุ', 'เสร็จเมื่อ']);
  T.t.slice().sort(function (a, b) {
    if (!!a.done !== !!b.done) return a.done ? 1 : -1;
    if (a.done) return String(b.doneAt || '').localeCompare(String(a.doneAt || ''));
    return String(a.due || '9999').localeCompare(String(b.due || '9999')) || String(a.time || '99').localeCompare(String(b.time || '99'));
  }).forEach(function (t) {
    var j = t.job ? job[t.job] : null;
    var subs = t.subs || [];
    out.push([t.done ? 'เสร็จ' : 'ค้าง', AREA[t.area] || '', t.title || '', j ? j.name : '', j ? stepOf(j, t.step) : '', t.due || '', t.time || '',
      t.imp ? 'สำคัญ' : '', REPEAT[t.rep] || '', subs.length ? subs.filter(function (s) { return s.ok; }).length + '/' + subs.length + ' · ' + subs.map(function (s) { return (s.ok ? '✓ ' : '• ') + s.x; }).join(', ') : '',
      t.note || '', t.doneAt || '']);
  });
  var sh = sheetFresh(ss, TASKS);
  sh.getRange(1, 1, out.length, W).setNumberFormat('@');
  sh.getRange(1, 1, out.length, W).setValues(out);
  sh.getRange(1, 1).setFontWeight('bold');
  sh.getRange(jobHead + 1, 1, 1, 7).setFontWeight('bold');
  sh.getRange(taskHead + 1, 1, 1, W).setFontWeight('bold');
  sh.autoResizeColumns(1, W);

  var L = [['วันที่', 'เวลา', 'งาน MEA', 'ขั้นตอน', 'เหตุการณ์', 'จาก', 'ถึง', 'หมายเหตุ']];
  T.l.slice().sort(function (a, b) { return String((b.d || '') + (b.tm || '')).localeCompare(String((a.d || '') + (a.tm || ''))); }).forEach(function (l) {
    var j = job[l.job];
    L.push([l.d || '', l.tm || '', j ? j.name : '(ลบงานแล้ว)', j ? stepOf(j, l.step) : '', LOGK[l.kind] || l.kind || '', l.from || '', l.to || '', l.text || '']);
  });
  var lg = sheetFresh(ss, DOCLOG);
  lg.getRange(1, 1, L.length, 8).setNumberFormat('@');
  lg.getRange(1, 1, L.length, 8).setValues(L);
  lg.getRange(1, 1, 1, 8).setFontWeight('bold');
  lg.setFrozenRows(1);
  lg.autoResizeColumns(1, 8);
}

/* ---------- nightly backup: copy the whole Sheet into Drive folder "iN&Ex Backup", keep 30 days ---------- */
function lastBackup() { return PropertiesService.getScriptProperties().getProperty('LAST_BACKUP') || ''; }

function backupFolder() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('BACKUP_FOLDER');
  if (id) {
    try { var f = DriveApp.getFolderById(id); if (!f.isTrashed()) return f; } catch (err) {}
  }
  var folder = DriveApp.createFolder('iN&Ex Backup');
  props.setProperty('BACKUP_FOLDER', folder.getId());
  return folder;
}

function backupNow() {
  var ss = SpreadsheetApp.getActive();
  var folder = backupFolder();
  var at = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd HH:mm');
  var name = BACKUP_PREFIX + at;
  var copy = DriveApp.getFileById(ss.getId()).makeCopy(name, folder);
  var cutoff = Date.now() - KEEP_DAYS * 864e5;
  var removed = 0;
  var it = folder.getFiles();
  while (it.hasNext()) {
    var f = it.next();
    if (f.getId() !== copy.getId() && f.getName().indexOf(BACKUP_PREFIX) === 0 && f.getDateCreated().getTime() < cutoff) { f.setTrashed(true); removed++; }
  }
  PropertiesService.getScriptProperties().setProperty('LAST_BACKUP', at);
  return {name: name, url: copy.getUrl(), at: at, folderUrl: folder.getUrl(), removed: removed};
}

function nightlyBackup() {
  var lock = LockService.getScriptLock();
  lock.waitLock(60000);
  try { backupNow(); } finally { lock.releaseLock(); }
}

/* Run once from the editor: schedules nightlyBackup every night 00:00–01:00 Bangkok time and makes the first copy now. */
function setupBackup() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'nightlyBackup') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('nightlyBackup').timeBased().everyDays(1).atHour(0).nearMinute(15).inTimezone('Asia/Bangkok').create();
  var ss = SpreadsheetApp.getActive();
  var d = ss.getSheetByName(DATA);
  if (d) writeTodo(ss, readAll(d));
  var r = backupNow();
  Logger.log('ตั้งเวลาสำรองทุกคืนแล้ว · สำรองครั้งแรก: ' + r.name + ' · โฟลเดอร์: ' + r.folderUrl);
}
