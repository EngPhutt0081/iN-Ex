/**
 * iN&Ex — Google Sheet backend
 * วิธีใช้: วางโค้ดนี้ใน Extensions > Apps Script ของ Google Sheet เปล่า
 * 1) เลือกฟังก์ชัน setup แล้วกด Run (อนุญาตสิทธิ์ครั้งแรก)
 * 2) Deploy > New deployment > Web app > Execute as: Me, Who has access: Anyone > Deploy
 * 3) คัดลอก Web app URL และรหัสลับจากแท็บ "ตั้งค่า" ไปใส่ในแอป
 * 4) (สำรองทุกคืน) เลือกฟังก์ชัน setupBackup แล้วกด Run ครั้งเดียว — ทุกคืนหลังเที่ยงคืน Google จะอัปเดต
 *    ไฟล์สำรองของเดือนนั้นในโฟลเดอร์ "iN&Ex Backup" บน Drive (เดือนละ 1 ไฟล์ เช่น "iN&Ex สำรอง 2026-10")
 * v2: แท็บ "งาน" และ "ประวัติเอกสาร" (โหมด To Do) + สำรองไป Drive
 * v3: ส่งกำหนดส่งเข้า Google Calendar + อีเมลสรุปเช้า (ตั้งค่าในแอป → ตั้งค่า → แจ้งเตือน)
 *     หลังวางโค้ดใหม่ ให้รันฟังก์ชัน setupAll ครั้งเดียว แล้ว Deploy → Manage deployments → New version
 */

/* Run ONCE from the editor after pasting this code (asks for Drive, Calendar, Gmail and trigger permissions):
   nightly backup 00:00–01:00, calendar check every 10 minutes, morning email at the hour set in the app. */
function setupAll() {
  var keep = ['nightlyBackup', 'calTick', 'digestTick'];
  ScriptApp.getProjectTriggers().forEach(function (t) { if (keep.indexOf(t.getHandlerFunction()) >= 0) ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('nightlyBackup').timeBased().everyDays(1).atHour(0).nearMinute(15).inTimezone('Asia/Bangkok').create();
  ScriptApp.newTrigger('calTick').timeBased().everyMinutes(10).create();
  var ss = SpreadsheetApp.getActive();
  var d = ss.getSheetByName(DATA);
  var rows = d ? readAll(d) : [];
  if (d) writeTodo(ss, rows);
  var set = notifySettings(rows);
  rescheduleDigest(set);
  var r = backupNow(false);
  var c = syncCalendar();
  Logger.log('สำรองทุกคืน: ตั้งแล้ว · ไฟล์เดือนนี้ ' + r.name + ' · โฟลเดอร์ ' + r.folderUrl);
  Logger.log('ปฏิทิน: ' + (set.cal.on ? 'ส่ง ' + c.count + ' รายการเข้าปฏิทิน “' + CAL_NAME + '”' : 'ปิดอยู่ (เปิดได้ในแอป → ตั้งค่า → แจ้งเตือน)'));
  Logger.log('อีเมลสรุปเช้า: ' + (set.mail.on ? 'ทุก' + (set.mail.days === 'all' ? 'วัน' : 'วันจันทร์–ศุกร์') + ' ประมาณ ' + set.mail.time + ' น. ส่งถึง ' + Session.getEffectiveUser().getEmail() : 'ปิดอยู่'));
}
function setupBackup() { setupAll(); }

var DATA = '_data';
var ACC = 'บัญชี';
var SET = 'ตั้งค่า';
var TASKS = 'งาน';
var DOCLOG = 'ประวัติเอกสาร';
var BACKUP_PREFIX = 'iN&Ex สำรอง ';
var BACKUP_LOG = 'บันทึกการสำรอง';
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
    if (body.action === 'backup') { var b = backupNow(false); b.ok = true; return out(b); }
    if (body.action === 'digest') { var m = sendDigest(true); m.ok = true; return out(m); }
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
  var todo = false, life = false, lifeSet = false;
  ops.forEach(function (o) {
    if (!o || COLLS.indexOf(o.c) < 0 || !o.id) return;
    if (o.c === 'meta' && String(o.id).indexOf('todo:') === 0) todo = true;
    if (o.c === 'meta' && String(o.id).indexOf('life:') === 0) { life = true; if (o.id === 'life:settings') lifeSet = true; }
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
  if (todo || life) PropertiesService.getScriptProperties().setProperty('CAL_DIRTY', '1');
  if (lifeSet) { try { rescheduleDigest(notifySettings(rows)); } catch (err) {} }
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
var LOGK = {send: 'ส่งเอกสาร', back: 'ได้เอกสารคืน', step: 'เสร็จขั้น', open: 'เปิดงาน', close: 'ปิดงาน', reopen: 'เปิดงานอีกครั้ง', pay: 'งวดงาน'};
function nextPayText(j) {
  var ps = j.pays || [];
  for (var i = 0; i < ps.length; i++) if (!ps[i].pd) return (ps[i].n || ('งวด ' + (i + 1))) + (ps[i].due ? ' · ' + ps[i].due : '') + (ps[i].dl ? (ps[i].ac ? ' · รอเบิกจ่าย' : ' · รอตรวจรับ') : '');
  return ps.length ? 'ครบทุกงวด' : '';
}

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
  out.push(padRow(['งาน MEA', 'เลขที่', 'ขั้นปัจจุบัน', 'ความคืบหน้า', 'เอกสารอยู่ที่', 'ตามงานวันที่', 'สถานะ', 'ผู้รับจ้าง', 'สิ้นสุดสัญญา', 'งวดถัดไป']));
  T.j.slice().sort(function (a, b) { return (a.closed ? 1 : 0) - (b.closed ? 1 : 0) || (a.created || 0) - (b.created || 0); }).forEach(function (j) {
    var steps = j.steps || [];
    var done = j.closed ? steps.length : Math.min(Number(j.cur) || 0, steps.length);
    out.push(padRow([j.name || '', j.ref || '', steps.length ? (Number(j.cur) + 1) + '. ' + stepOf(j, j.cur) : '', done + '/' + steps.length,
      j.wait ? (j.holder || '') : 'เรา', j.wait ? (j.follow || '') : '', j.closed ? 'ปิดแล้ว ' + j.closed : 'เปิดอยู่',
      (j.ct && j.ct.contractor) || '', (j.ct && j.ct.end) || '', nextPayText(j)]));
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
  sh.getRange(jobHead + 1, 1, 1, 10).setFontWeight('bold');
  sh.getRange(taskHead + 1, 1, 1, W).setFontWeight('bold');
  sh.autoResizeColumns(1, W);

  var L = [['วันที่', 'เวลา', 'งาน MEA', 'ขั้นตอน', 'เหตุการณ์', 'จาก', 'ถึง', 'หมายเหตุ']];
  T.l.slice().sort(function (a, b) { return String((b.d || '') + (b.tm || '')).localeCompare(String((a.d || '') + (a.tm || ''))); }).forEach(function (l) {
    var j = job[l.job];
    L.push([l.d || '', l.tm || '', j ? j.name : '(ลบงานแล้ว)', j ? stepOf(j, l.step) : '', LOGK[l.kind] || l.kind || '', l.from || '', l.to || '', l.text || l.what || '']);
  });
  var lg = sheetFresh(ss, DOCLOG);
  lg.getRange(1, 1, L.length, 8).setNumberFormat('@');
  lg.getRange(1, 1, L.length, 8).setValues(L);
  lg.getRange(1, 1, 1, 8).setFontWeight('bold');
  lg.setFrozenRows(1);
  lg.autoResizeColumns(1, 8);
}

/* ---------- nightly backup: Drive folder "iN&Ex Backup" → ONE Google Sheet per month ("iN&Ex สำรอง 2026-10"),
   refreshed every night with that month's tab, account balances, To Do tabs and the full raw data (_data, hidden),
   plus one row per backup in the tab "บันทึกการสำรอง". Nothing is ever deleted except leftover daily copies from v2.0. */
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

function monthFile(folder, name) {
  var it = folder.getFilesByName(name);
  while (it.hasNext()) {
    var f = it.next();
    if (!f.isTrashed() && f.getMimeType() === MimeType.GOOGLE_SHEETS) return SpreadsheetApp.openById(f.getId());
  }
  var bk = SpreadsheetApp.create(name);
  DriveApp.getFileById(bk.getId()).moveTo(folder);
  return bk;
}

/* nightly = true: runs just after midnight, so it files into YESTERDAY's month (the 1st of a month closes the previous month's file) */
function backupNow(nightly) {
  var ss = SpreadsheetApp.getActive();
  var folder = backupFolder();
  var now = new Date();
  var at = Utilities.formatDate(now, 'Asia/Bangkok', 'yyyy-MM-dd HH:mm');
  var month = Utilities.formatDate(nightly ? new Date(now.getTime() - 12 * 3600e3) : now, 'Asia/Bangkok', 'yyyy-MM');
  var name = BACKUP_PREFIX + month;
  var bk = monthFile(folder, name);

  [month, ACC, TASKS, DOCLOG, DATA].forEach(function (n) {
    var src = ss.getSheetByName(n);
    if (!src) return;
    var tmp = bk.getSheetByName(n + ' (เก่า)');
    if (tmp) bk.deleteSheet(tmp);
    var old = bk.getSheetByName(n);
    if (old) old.setName(n + ' (เก่า)');
    var c = src.copyTo(bk);
    if (old) bk.deleteSheet(old);
    c.setName(n);
    if (n === DATA) c.hideSheet();
  });
  var first = bk.getSheetByName(month) || bk.getSheetByName(ACC);
  if (first) { bk.setActiveSheet(first); bk.moveActiveSheet(1); }
  ['Sheet1', 'ชีต1', 'แผ่นงาน1'].forEach(function (n) {
    var x = bk.getSheetByName(n);
    if (x && bk.getSheets().length > 1 && x.getLastRow() === 0) bk.deleteSheet(x);
  });

  var rows = readAll(ss.getSheetByName(DATA));
  var total = 0, inMonth = 0;
  rows.forEach(function (r) {
    if (r[3]) return;
    total++;
    try { var d = JSON.parse(r[4] || '{}'); if (String(d.date || '').slice(0, 7) === month) inMonth++; } catch (err) {}
  });
  var lg = bk.getSheetByName(BACKUP_LOG) || bk.insertSheet(BACKUP_LOG);
  if (lg.getLastRow() === 0) { lg.appendRow(['เวลาที่สำรอง', 'แบบ', 'รายการทั้งหมดในระบบ', 'รายการลงวันที่เดือนนี้']); lg.getRange(1, 1, 1, 4).setFontWeight('bold'); }
  lg.appendRow([at, nightly ? 'อัตโนมัติทุกคืน' : 'กดเอง', total, inMonth]);

  // leftovers from v2.0, which made one full copy per day
  var removed = 0;
  var it = folder.getFiles();
  while (it.hasNext()) {
    var f = it.next();
    if (/^iN&Ex สำรอง \d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(f.getName())) { f.setTrashed(true); removed++; }
  }
  PropertiesService.getScriptProperties().setProperty('LAST_BACKUP', at);
  return {name: name, url: bk.getUrl(), at: at, folderUrl: folder.getUrl(), removed: removed};
}

function nightlyBackup() {
  var lock = LockService.getScriptLock();
  lock.waitLock(60000);
  try { backupNow(true); } finally { lock.releaseLock(); }
}



/* ---------- v3: notifications (Google Calendar + morning email), settings come from the app as meta "life:settings" ---------- */
var CAL_NAME = 'iN&Ex งาน';
var CAL_MAP = '_cal';
var TZ = 'Asia/Bangkok';

function notifySettings(rows) {
  var def = {cal: {on: true, due: true, follow: true, contract: true, renew: true, impOnly: false, m0730: true, d1: true},
    mail: {on: true, time: '07:00', days: 'weekdays', today: true, follow: true, contract: true, money: true, kcal: false}};
  for (var i = 0; i < rows.length; i++) {
    if (rows[i][0] === 'meta' && String(rows[i][1]) === 'life:settings' && !rows[i][3]) {
      try {
        var s = JSON.parse(rows[i][4]) || {}; var n = s.notify || {};
        Object.keys(n.cal || {}).forEach(function (k) { def.cal[k] = n.cal[k]; });
        Object.keys(n.mail || {}).forEach(function (k) { def.mail[k] = n.mail[k]; });
      } catch (err) {}
    }
  }
  return def;
}

function collectMeta(rows, prefix) {
  var out = {};
  rows.forEach(function (r) {
    if (r[0] !== 'meta' || r[3]) return;
    var id = String(r[1]); if (id.indexOf(prefix) !== 0) return;
    id = id.slice(prefix.length); var k = id.split(':')[0];
    try { var d = JSON.parse(r[4]); d.id = id; (out[k] = out[k] || []).push(d); } catch (err) {}
  });
  return out;
}

function ymd(d) { return Utilities.formatDate(d, TZ, 'yyyy-MM-dd'); }
function addDaysStr(s, n) { var d = Utilities.parseDate(s + ' 12:00', TZ, 'yyyy-MM-dd HH:mm'); return ymd(new Date(d.getTime() + n * 864e5)); }
function daysBetween(a, b) { return Math.round((Utilities.parseDate(b + ' 12:00', TZ, 'yyyy-MM-dd HH:mm') - Utilities.parseDate(a + ' 12:00', TZ, 'yyyy-MM-dd HH:mm')) / 864e5); }
function addMonthsStr(s, n) { var p = s.split('-').map(Number); var d = new Date(Date.UTC(p[0], p[1] - 1 + n, 1)); var last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate(); return d.getUTCFullYear() + '-' + ('0' + (d.getUTCMonth() + 1)).slice(-2) + '-' + ('0' + Math.min(p[2], last)).slice(-2); }
function warrantyEndStr(j) {
  var wy = Number(j.ct && j.ct.wy) || 0; var ps = j.pays || []; var last = ps.length ? ps[ps.length - 1] : null;
  return wy && last && last.dl ? addMonthsStr(last.dl, 12 * wy) : '';
}

function calItems(rows, set) {
  var T = collectMeta(rows, 'todo:'); var Lf = collectMeta(rows, 'life:');
  var today = ymd(new Date()); var min = addDaysStr(today, -1), max = addDaysStr(today, 400);
  var ok = function (d) { return d && d >= min && d <= max; };
  var items = [];
  var jobs = {}; (T.j || []).forEach(function (j) { jobs[j.id] = j; });
  if (set.due) (T.t || []).forEach(function (t) {
    if (t.done || !ok(t.due) || (set.impOnly && !t.imp)) return;
    var j = t.job && jobs[t.job];
    items.push({key: 't:' + t.id, title: (t.area === 'mea' ? '[MEA] ' : '') + t.title, date: t.due, time: t.time || '', desc: (j ? 'งาน MEA: ' + j.name + '\n' : '') + (t.note || '')});
  });
  (T.j || []).forEach(function (j) {
    if (j.closed) return;
    if (set.follow && j.wait && ok(j.follow)) items.push({key: 'f:' + j.id + ':' + j.follow, title: 'ตามเอกสาร: รอ' + (j.holder || '') + ' · ' + j.name, date: j.follow, time: ''});
    if (!set.contract) return;
    (j.pays || []).forEach(function (p, i) { if (!p.dl && ok(p.due)) items.push({key: 'p:' + j.id + ':' + i, title: 'งวดงาน: ' + (p.n || 'งวด ' + (i + 1)) + ' · ' + j.name, date: p.due, time: ''}); });
    if (j.ct && ok(j.ct.end)) items.push({key: 'e:' + j.id, title: 'ครบสัญญา: ' + j.name, date: j.ct.end, time: '', early: 7});
  });
  if (set.contract) (T.j || []).forEach(function (j) { var we = warrantyEndStr(j); if (ok(we)) items.push({key: 'w:' + j.id, title: 'ครบประกันผลงาน: ' + j.name, date: we, time: '', early: 7}); });
  if (set.renew) (Lf.r || []).forEach(function (r) { if (ok(r.exp)) items.push({key: 'r:' + r.id + ':' + r.exp, title: 'หมดอายุ: ' + r.t, date: r.exp, time: '', early: 7}); });
  return items;
}

function getCal(create) {
  var props = PropertiesService.getScriptProperties(); var id = props.getProperty('CAL_ID');
  if (id) { try { var c = CalendarApp.getCalendarById(id); if (c) return c; } catch (err) {} }
  if (!create) return null;
  var found = CalendarApp.getCalendarsByName(CAL_NAME);
  var cal = found && found.length ? found[0] : CalendarApp.createCalendar(CAL_NAME, {color: CalendarApp.Color.ORANGE});
  props.setProperty('CAL_ID', cal.getId());
  return cal;
}

function readCalMap(ss) {
  var sh = ss.getSheetByName(CAL_MAP); var map = {};
  if (!sh) return map;
  var n = sh.getLastRow(); if (n < 1) return map;
  sh.getRange(1, 1, n, 3).getValues().forEach(function (r) { if (r[0]) map[String(r[0])] = {id: String(r[1]), h: String(r[2])}; });
  return map;
}
function writeCalMap(ss, map) {
  var sh = ss.getSheetByName(CAL_MAP);
  if (!sh) { sh = ss.insertSheet(CAL_MAP); sh.hideSheet(); }
  sh.clear();
  var keys = Object.keys(map);
  if (keys.length) { sh.getRange(1, 1, keys.length, 3).setNumberFormat('@'); sh.getRange(1, 1, keys.length, 3).setValues(keys.map(function (k) { return [k, map[k].id, map[k].h]; })); }
}

function makeEvent(cal, it, set) {
  var ev;
  var at = function (d, hm) { return Utilities.parseDate(d + ' ' + hm, TZ, 'yyyy-MM-dd HH:mm'); };
  if (it.time) {
    var st = at(it.date, it.time);
    ev = cal.createEvent(it.title, st, new Date(st.getTime() + 30 * 60000), {description: it.desc || ''});
    ev.removeAllReminders();
    if (set.m0730) { var m = Math.round((st - at(it.date, '07:30')) / 60000); if (m > 0) ev.addPopupReminder(m); }
    if (set.d1) ev.addPopupReminder(Math.round((st - at(addDaysStr(it.date, -1), '17:00')) / 60000));
    if (!set.m0730 && !set.d1) ev.addPopupReminder(30);
  } else if (set.m0730) {
    var s2 = at(it.date, '07:30');
    ev = cal.createEvent(it.title, s2, new Date(s2.getTime() + 15 * 60000), {description: it.desc || ''});
    ev.removeAllReminders(); ev.addPopupReminder(0);
    if (set.d1) ev.addPopupReminder(870);
  } else {
    ev = cal.createAllDayEvent(it.title, at(it.date, '12:00'), {description: it.desc || ''});
    ev.removeAllReminders();
    if (set.d1) ev.addPopupReminder(420);
  }
  if (it.early) { try { ev.addPopupReminder(Math.min(40320, it.early * 1440 + (it.time ? 0 : 0))); } catch (err) {} }
  return ev;
}

function syncCalendar() {
  var ss = SpreadsheetApp.getActive(); var d = ss.getSheetByName(DATA); if (!d) return {count: 0};
  var rows = readAll(d); var set = notifySettings(rows).cal;
  var map = readCalMap(ss); var props = PropertiesService.getScriptProperties();
  var cal = getCal(set.on);
  var want = set.on ? calItems(rows, set) : [];
  var seen = {}; var made = 0;
  want.forEach(function (it) {
    var h = JSON.stringify([it.title, it.date, it.time, set.m0730, set.d1, it.early || 0]);
    seen[it.key] = 1;
    if (map[it.key] && map[it.key].h === h) return;
    if (map[it.key] && cal) { try { var old = cal.getEventById(map[it.key].id); if (old) old.deleteEvent(); } catch (err) {} }
    if (!cal) return;
    var ev = makeEvent(cal, it, set); map[it.key] = {id: ev.getId(), h: h}; made++;
  });
  Object.keys(map).forEach(function (k) {
    if (seen[k]) return;
    if (cal) { try { var e = cal.getEventById(map[k].id); if (e) e.deleteEvent(); } catch (err) {} }
    delete map[k];
  });
  writeCalMap(ss, map);
  props.setProperty('CAL_DIRTY', '0'); props.setProperty('CAL_DAY', ymd(new Date()));
  return {count: want.length, changed: made};
}

function calTick() {
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty('CAL_DIRTY') !== '1' && props.getProperty('CAL_DAY') === ymd(new Date())) return;
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return;
  try { syncCalendar(); } finally { lock.releaseLock(); }
}

function rescheduleDigest(set) {
  var props = PropertiesService.getScriptProperties();
  var hour = Number(String(set.mail.time || '07:00').split(':')[0]) || 7;
  var want = set.mail.on ? String(hour) : 'off';
  var has = ScriptApp.getProjectTriggers().filter(function (t) { return t.getHandlerFunction() === 'digestTick'; });
  if (props.getProperty('MAIL_HOUR') === want && (want === 'off' ? !has.length : has.length === 1)) return;
  has.forEach(function (t) { ScriptApp.deleteTrigger(t); });
  if (set.mail.on) ScriptApp.newTrigger('digestTick').timeBased().everyDays(1).atHour(hour).nearMinute(15).inTimezone(TZ).create();
  props.setProperty('MAIL_HOUR', want);
}

function digestTick() {
  var ss = SpreadsheetApp.getActive(); var d = ss.getSheetByName(DATA); if (!d) return;
  var set = notifySettings(readAll(d)).mail;
  if (!set.on) return;
  var dow = Number(Utilities.formatDate(new Date(), TZ, 'u'));
  if (set.days !== 'all' && dow >= 6) return;
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty('LAST_DIGEST') === ymd(new Date())) return;
  sendDigest(false);
}

function sendDigest(test) {
  var ss = SpreadsheetApp.getActive(); var rows = readAll(ss.getSheetByName(DATA));
  var set = notifySettings(rows).mail;
  var T = collectMeta(rows, 'todo:'); var Lf = collectMeta(rows, 'life:'); var B = collectMeta(rows, 'body:');
  var today = ymd(new Date()); var yest = addDaysStr(today, -1); var ym = today.slice(0, 7);
  var TH = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  var DW = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'];
  var dm = function (s) { var p = s.split('-').map(Number); return p[2] + ' ' + TH[p[1] - 1]; };
  var esc = function (x) { return String(x == null ? '' : x).replace(/[&<>"]/g, function (c) { return {'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]; }); };
  var fmt = function (n) { return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ','); };
  var jobs = {}; (T.j || []).forEach(function (j) { jobs[j.id] = j; });
  var open = (T.t || []).filter(function (t) { return !t.done; });
  var over = open.filter(function (t) { return t.due && t.due < today; });
  var due = open.filter(function (t) { return t.due === today; });
  var sections = [];
  var row = function (l, s, r, c) { return '<tr><td style="padding:8px 0;border-bottom:1px solid #eee"><div style="font-size:14px;color:#111">' + esc(l) + '</div>' + (s ? '<div style="font-size:12px;color:#777">' + esc(s) + '</div>' : '') + '</td><td style="padding:8px 0 8px 12px;border-bottom:1px solid #eee;text-align:right;white-space:nowrap;font-size:12px;font-weight:600;color:' + (c || '#555') + '">' + esc(r || '') + '</td></tr>'; };
  var sec = function (h, c, body) { sections.push('<div style="margin:18px 0 4px;font-size:12px;font-weight:700;letter-spacing:.04em;color:' + c + '">' + h + '</div><table style="width:100%;border-collapse:collapse">' + body + '</table>'); };
  var area = {mea: 'MEA', study: 'เรียน', me: 'ส่วนตัว'};
  if (set.today) {
    if (over.length) sec('เลยกำหนด', '#D0453A', over.sort(function (a, b) { return a.due.localeCompare(b.due); }).map(function (t) { var j = t.job && jobs[t.job]; return row(t.title, (area[t.area] || '') + (j ? ' · ' + j.name : ''), 'เลย ' + daysBetween(t.due, today) + ' วัน', '#D0453A'); }).join(''));
    if (due.length) sec('วันนี้', '#111', due.sort(function (a, b) { return (b.imp ? 1 : 0) - (a.imp ? 1 : 0) || String(a.time || '99').localeCompare(String(b.time || '99')); }).map(function (t) { var j = t.job && jobs[t.job]; return row(t.title, (area[t.area] || '') + (j ? ' · ' + j.name : '') + (t.imp ? ' · สำคัญ' : ''), t.time || 'วันนี้'); }).join(''));
  }
  if (set.follow) {
    var fl = (T.j || []).filter(function (j) { return !j.closed && j.wait && j.follow && j.follow <= addDaysStr(today, 1); });
    if (fl.length) sec('ตามเอกสาร', '#2F6FD0', fl.map(function (j) { return row('รอ' + (j.holder || '') + ' · ' + j.name, '', j.follow <= today ? 'ตามวันนี้' : 'พรุ่งนี้', '#2F6FD0'); }).join(''));
  }
  if (set.contract) {
    var cr = [];
    (T.j || []).forEach(function (j) {
      if (j.closed) return;
      (j.pays || []).forEach(function (p, i) { if (!p.dl && p.due && daysBetween(today, p.due) <= 14) cr.push([p.due, row((p.n || 'งวด ' + (i + 1)) + ' · ' + j.name, 'ยังไม่ส่งมอบ', daysBetween(today, p.due) < 0 ? 'เลย ' + (-daysBetween(today, p.due)) + ' วัน' : 'อีก ' + daysBetween(today, p.due) + ' วัน', '#E2701A')]); });
      if (j.ct && j.ct.end && daysBetween(today, j.ct.end) <= 30 && daysBetween(today, j.ct.end) >= -30) cr.push([j.ct.end, row('ครบสัญญา · ' + j.name, dm(j.ct.end), daysBetween(today, j.ct.end) >= 0 ? 'อีก ' + daysBetween(today, j.ct.end) + ' วัน' : 'เลยแล้ว', '#E2701A')]);
      var we = warrantyEndStr(j); if (we && daysBetween(today, we) <= 30 && daysBetween(today, we) >= 0) cr.push([we, row('ครบประกันผลงาน · ' + j.name, dm(we), 'อีก ' + daysBetween(today, we) + ' วัน', '#E2701A')]);
    });
    (Lf.r || []).forEach(function (r) { var w = Math.max.apply(null, (r.warn && r.warn.length ? r.warn : [30])); if (r.exp && daysBetween(today, r.exp) <= w) cr.push([r.exp, row('หมดอายุ · ' + r.t, dm(r.exp), daysBetween(today, r.exp) >= 0 ? 'อีก ' + daysBetween(today, r.exp) + ' วัน' : 'หมดแล้ว', '#5E8F12')]); });
    if (cr.length) sec('สัญญา / งวดงาน / ต่ออายุ', '#E2701A', cr.sort(function (a, b) { return a[0].localeCompare(b[0]); }).map(function (x) { return x[1]; }).join(''));
  }
  if (set.money) {
    var ex = []; rows.forEach(function (r) { if (r[0] === 'expenses' && !r[3]) { try { ex.push(JSON.parse(r[4])); } catch (err) {} } });
    var mine = ex.filter(function (e) { return !e.reimb; });
    var y = mine.filter(function (e) { return e.date === yest; }); var m = mine.filter(function (e) { return String(e.date || '').slice(0, 7) === ym; });
    var reimb = ex.filter(function (e) { return e.reimb && !e.reimbDone; }).reduce(function (s, e) { return s + (Number(e.amount) || 0); }, 0);
    sec('เงิน', '#A57F3E', row('เมื่อวานใช้ ฿' + fmt(y.reduce(function (s, e) { return s + (Number(e.amount) || 0); }, 0)) + ' · ' + y.length + ' รายการ', 'เดือนนี้ ฿' + fmt(m.reduce(function (s, e) { return s + (Number(e.amount) || 0); }, 0)) + (reimb ? ' · สำรองจ่ายรอเบิก ฿' + fmt(reimb) : ''), ''));
  }
  if (set.kcal) {
    var k = (B.f || []).filter(function (f) { return f.d === yest; }).reduce(function (s, f) { return s + (Number(f.kcal) || 0); }, 0);
    sec('แคลอรี่', '#178F7E', row('เมื่อวานกิน ' + fmt(k) + ' kcal', '', ''));
  }
  var p = today.split('-').map(Number); var dow = Number(Utilities.formatDate(new Date(), TZ, 'u')) % 7;
  var subject = 'iN&Ex · เช้านี้ ' + DW[dow] + ' ' + p[2] + ' ' + TH[p[1] - 1] + ' — ค้าง ' + (over.length + due.length) + (over.length ? ' · เลยกำหนด ' + over.length : '') + (test ? ' (ทดสอบ)' : '');
  var html = '<div style="font-family:-apple-system,Segoe UI,Tahoma,sans-serif;max-width:560px;margin:0 auto;padding:8px 4px;color:#111">' +
    '<div style="font-size:20px;font-weight:700">iN&amp;Ex · สรุปเช้า</div><div style="font-size:13px;color:#777">' + DW[dow] + ' ' + p[2] + ' ' + TH[p[1] - 1] + ' ' + (p[0] + 543) + '</div>' +
    (sections.length ? sections.join('') : '<p style="margin-top:18px;font-size:14px;color:#555">วันนี้ว่าง ไม่มีงานค้างหรือเรื่องที่ต้องตาม</p>') +
    '<p style="margin-top:22px;font-size:11px;color:#999">ส่งจาก Apps Script ใน Google Sheet iN&amp;Ex ของคุณ · ปิดหรือเลือกหัวข้อได้ที่ แอป → ตั้งค่า → แจ้งเตือน</p></div>';
  var to = Session.getEffectiveUser().getEmail();
  MailApp.sendEmail({to: to, subject: subject, htmlBody: html, name: 'iN&Ex'});
  if (!test) PropertiesService.getScriptProperties().setProperty('LAST_DIGEST', today);
  return {to: to, subject: subject};
}
