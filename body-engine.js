/* =====================================================================
   iN&Ex · Body engine
   ฐานข้อมูลแคลอรี่ + ตัวจับคำ (matcher) + สูตรคำนวณงบแคลอรี่
   ใช้ได้ทั้งในเบราว์เซอร์ (window.BodyEngine) และ Node (module.exports)

   แหล่งข้อมูล (ฟิลด์ src ของแต่ละรายการ):
     S = ศิริราช (หน่วยโภชนวิทยา) รายการอาหารแลกเปลี่ยน
         ข้าว-แป้ง 1 ส่วน 80 · เนื้อสัตว์ 55/75/100 · ผัก 25 · ผลไม้ 60 · ไขมัน 1 ช้อนชา 45 kcal
     W = Wongnai "แคลอรี่อาหารแต่ละมื้อ"
     T = TrueplookPanya อินโฟกราฟิก "แคลอรี่ข้างทาง"
     U = ค่าวัตถุดิบดิบต่อ 100 g อ้างอิง USDA FoodData Central (ค่าปัดเลข)
     F = งานทบทวนการดูดซับน้ำมันจากการทอด (PMC10660127): น่องไก่ 2%→18%, ปลา 1%→10.5% ของน้ำหนัก
     E = ประมาณการ คำนวณจากวัตถุดิบ + วิธีปรุงด้วยค่าข้างบน (แก้ไขได้)
   ทุกค่าคือค่าประมาณ ร้านจริงอาจต่างได้ ±20–30%
   ===================================================================== */
(function (root) {
  'use strict';

  // ---------- 1) เมนูสำเร็จ: แยกส่วนประกอบ (food-db.js) ----------
  // แต่ละเมนู = ส่วนประกอบ × กรัม → kcal / โปรตีน / คาร์บ / ไขมัน
  const FDB = root.FoodDB || (typeof require === 'function' ? require('./food-db.js') : { C: {}, D: [] });
  const COMP = FDB.C;
  const r1 = (x) => Math.round(x * 10) / 10;
  function partOf(key, g) {
    const c = COMP[key]; if (!c) return null;
    const f = g / 100;
    return { key, g: Math.round(g), name: c[0], kcal: Math.round(c[1] * f), p: r1(c[2] * f), c: r1(c[3] * f), f: r1(c[4] * f), alt: c[5] || null };
  }
  function sumParts(parts) {
    return parts.reduce((a, x) => ({ kcal: a.kcal + x.kcal, p: a.p + x.p, c: a.c + x.c, f: a.f + x.f }), { kcal: 0, p: 0, c: 0, f: 0 });
  }
  const DISHES = FDB.D.map((d) => {
    const parts = d[4].filter((x) => x[1] > 0).map((x) => partOf(x[0], x[1])).filter(Boolean);
    const t = sumParts(parts); const o = d[5] || {};
    return { n: d[0], a: d[1], s: d[2], c: d[3], parts: d[4].filter((x) => x[1] > 0), k: t.kcal, p: Math.round(t.p), cb: Math.round(t.c), fat: Math.round(t.f), src: 'N', unit: o.unit, cnt: o.cnt, sweet: !!o.sweet };
  });

  // ---------- 2) วัตถุดิบ (kcal ต่อ 100 g ดิบ) ----------
  // g: น้ำหนักต่อ 1 ที่ ถ้าไม่ได้พิมพ์กรัม · t: protein | carb | veg | fat
  const INGREDIENTS = [
    { n: 'อกไก่', a: ['อกไก่', 'ไก่'], k: 120, p: 23, c: 0, f: 2.6, g: 100, t: 'protein', src: 'U' },
    { n: 'น่อง/สะโพกไก่ (มีหนัง)', a: ['น่องไก่', 'สะโพกไก่', 'น่อง', 'สะโพก'], k: 220, p: 17, c: 0, f: 16, g: 100, t: 'protein', src: 'U' },
    { n: 'ปีกไก่ (มีหนัง)', a: ['ปีกไก่', 'ปีก'], k: 200, p: 18, c: 0, f: 15, g: 50, t: 'protein', src: 'U' },
    { n: 'หมูเนื้อแดง', a: ['หมูเนื้อแดง', 'สันในหมู', 'สันนอกหมู', 'หมูสันใน', 'หมู'], k: 143, p: 21, c: 0, f: 6, g: 100, t: 'protein', src: 'U' },
    { n: 'หมูสับ', a: ['หมูสับ', 'หมูบด'], k: 263, p: 17, c: 0, f: 21, g: 100, t: 'protein', src: 'U' },
    { n: 'หมูสามชั้น', a: ['หมูสามชั้น', 'สามชั้น'], k: 518, p: 9, c: 0, f: 53, g: 100, t: 'protein', src: 'U' },
    { n: 'หมูกรอบ (สุกแล้ว)', a: ['หมูกรอบ'], k: 500, p: 20, c: 0, f: 44, g: 80, t: 'protein', src: 'E' },
    { n: 'เนื้อวัว (ไม่ติดมัน)', a: ['เนื้อวัว', 'เนื้อสัน', 'สเต็กเนื้อ', 'สเต็ก'], k: 150, p: 21, c: 0, f: 7, g: 100, t: 'protein', src: 'U' },
    { n: 'กุ้ง', a: ['กุ้ง'], k: 85, p: 20, c: 0.9, f: 0.5, g: 100, t: 'protein', src: 'U' },
    { n: 'ปลาเนื้อขาว (นิล/ดอลลี่)', a: ['ปลานิล', 'ปลาดอลลี่', 'ดอลลี่', 'ปลา'], k: 96, p: 20, c: 0, f: 1.7, g: 100, t: 'protein', src: 'U' },
    { n: 'ปลาแซลมอน', a: ['แซลมอน'], k: 208, p: 20, c: 0, f: 13, g: 100, t: 'protein', src: 'U' },
    { n: 'ปลาหมึก', a: ['ปลาหมึก', 'หมึก'], k: 92, p: 16, c: 3, f: 1.4, g: 100, t: 'protein', src: 'U' },
    { n: 'ไข่ไก่', a: ['ไข่'], k: 143, p: 12.6, c: 0.7, f: 9.5, g: 50, t: 'protein', src: 'U', unitG: 50, unit: 'ฟอง' },
    { n: 'เต้าหู้แข็ง', a: ['เต้าหู้แข็ง', 'เต้าหู้ขาว', 'เต้าหู้'], k: 144, p: 17, c: 3, f: 9, g: 100, t: 'protein', src: 'U' },
    { n: 'ข้าวสวย (สุก)', a: ['ข้าวสวย', 'ข้าว'], k: 130, p: 2.7, c: 28, f: 0.3, g: 180, t: 'carb', src: 'U' },
    { n: 'ข้าวกล้อง (สุก)', a: ['ข้าวกล้อง'], k: 123, p: 2.7, c: 26, f: 1, g: 180, t: 'carb', src: 'U' },
    { n: 'ข้าวเหนียว (สุก)', a: ['ข้าวเหนียว'], k: 97, p: 2, c: 21, f: 0.2, g: 150, t: 'carb', src: 'U' },
    { n: 'เส้นก๋วยเตี๋ยว (สุก)', a: ['เส้นเล็ก', 'เส้นใหญ่', 'เส้นหมี่', 'เส้น'], k: 108, p: 1.8, c: 24, f: 0.2, g: 150, t: 'carb', src: 'U' },
    { n: 'มันฝรั่ง', a: ['มันฝรั่ง', 'เฟรนช์ฟราย', 'เฟรนช์ฟรายส์'], k: 77, p: 2, c: 17, f: 0.1, g: 100, t: 'carb', src: 'U' },
    { n: 'มันเทศ', a: ['มันเทศ', 'มันหวาน'], k: 86, p: 1.6, c: 20, f: 0.1, g: 100, t: 'carb', src: 'U' },
    { n: 'ผักทั่วไป', a: ['ผักบุ้ง', 'คะน้า', 'กะหล่ำ', 'ผักรวม', 'บรอกโคลี', 'ผัก'], k: 25, p: 1.5, c: 4.5, f: 0.3, g: 100, t: 'veg', src: 'S' },
  ];

  // ---------- 3) วิธีปรุง ----------
  // perServing = kcal บวกต่อ 1 ที่ · per100g = kcal บวกต่อ 100 g ของวัตถุดิบหลัก
  const METHODS = [
    { id: 'batterfry', n: 'ชุบแป้งทอด', a: ['ชุบแป้งทอด', 'ชุบแป้ง', 'เทมปุระ', 'คาราอาเกะ', 'ทอดกรอบ'], per100g: 180, mc: 10, mf: 15.5, src: 'E', note: 'แป้ง + น้ำมันราว 15% ของน้ำหนัก' },
    { id: 'fry', n: 'ทอด', a: ['ทอด'], per100g: 110, mf: 12.4, src: 'F', note: 'น้ำมันราว 12% ของน้ำหนัก (ช่วงงานวิจัย 10–18%)' },
    { id: 'stirfry', n: 'ผัด', a: ['ผัด'], perServing: 90, mf: 10, src: 'S', note: 'น้ำมัน 2 ช้อนชา × 45 kcal' },
    { id: 'curry', n: 'แกงกะทิ', a: ['แกงกะทิ', 'ต้มข่า', 'กะทิ', 'แกงเผ็ด', 'พะแนง', 'มัสมั่น'], perServing: 200, mp: 2, mc: 5, mf: 20, src: 'E', note: 'กะทิราว 90 ml (≈ 4.5 ช้อนชาไขมัน)' },
    { id: 'yum', n: 'ยำ/ตำ', a: ['ยำ'], perServing: 40, mc: 10, src: 'E', note: 'น้ำตาลในน้ำยำราว 2.5 ช้อนชา' },
    { id: 'grill', n: 'ย่าง/ปิ้ง', a: ['ย่าง', 'ปิ้ง', 'เผา', 'อบ'], per100g: 0, src: 'S', note: 'ไม่เพิ่มน้ำมัน' },
    { id: 'boil', n: 'ต้ม/นึ่ง/ลวก', a: ['ต้ม', 'นึ่ง', 'ลวก', 'ตุ๋น', 'ซุป'], per100g: 0, src: 'S', note: 'ไม่เพิ่มน้ำมัน' },
  ];

  // ---------- 4) ส่วนเสริม / ตัวปรับ ----------
  const ADDONS = [
    { n: 'ไข่ดาว', a: ['ไข่ดาว'], k: 165, part: 'egg_fried', src: 'W' },
    { n: 'ไข่เจียว', a: ['ไข่เจียว'], k: 165, part: 'egg_omelet', src: 'E' },
    { n: 'ไข่ต้ม', a: ['ไข่ต้ม'], k: 76, part: 'egg', src: 'W' },
    { n: 'ไข่ยางมะตูม/ไข่ลวก', a: ['ไข่ยางมะตูม', 'ไข่ลวก'], k: 76, part: 'egg', src: 'W' },
    { n: 'ข้าวน้อย (−1 ทัพพี)', a: ['ข้าวน้อย', 'ข้าวครึ่ง'], k: -80, src: 'S' },
    { n: 'ข้าวพิเศษ (+1 ทัพพี)', a: ['ข้าวพิเศษ', 'เพิ่มข้าว'], k: 80, src: 'S' },
    { n: 'ไม่ใส่ไข่', a: ['ไม่ใส่ไข่', 'ไม่เอาไข่'], k: -76, src: 'W' },
    { n: 'พิเศษ (เพิ่มเนื้อ)', a: ['พิเศษ'], k: 100, src: 'E' },
    { n: 'น้ำมันน้อย', a: ['น้ำมันน้อย'], k: -45, src: 'S' },
    { n: 'ไม่เอาหนัง', a: ['ไม่เอาหนัง', 'ไม่หนัง', 'ลอกหนัง', 'ไม่มีหนัง'], k: 0, src: 'E' },
  ];
  const SWEET = [
    { n: 'ไม่หวาน', a: ['ไม่หวาน', 'ไม่ใส่น้ำตาล'], f: 0.4 },
    { n: 'หวานน้อย', a: ['หวานน้อย'], f: 0.7 },
  ];

  const SRC = {
    S: 'ศิริราช: รายการอาหารแลกเปลี่ยน',
    W: 'Wongnai: แคลอรี่อาหารแต่ละมื้อ',
    T: 'TrueplookPanya: แคลอรี่ข้างทาง',
    U: 'USDA FoodData Central (ปัดเลข)',
    F: 'PMC10660127: การดูดซับน้ำมันจากการทอด',
    E: 'ประมาณการจากวัตถุดิบ + วิธีปรุง',
    N: 'แยกส่วนประกอบ: กรัม × ค่าต่อ 100 g (USDA FDC / ตารางคุณค่าอาหารไทย ปัดเลข)',
  };

  // ---------- 5) คำ → หมวดรายจ่ายใน iN&Ex ----------
  const MONEY_CAT = { food: 'อาหาร', drink: 'เครื่องดื่ม', dessert: 'ขนม/ของว่าง' };

  // ---------- helpers ----------
  const norm = (s) => String(s || '')
    .toLowerCase()
    .replace(/กระเพรา|กะเพา/g, 'กะเพรา')
    .replace(/ไอติม/g, 'ไอติม')
    .replace(/\s+/g, '');

  // ตัดคำที่จับได้ออก เพื่อไม่ให้นับซ้ำ (ไข่ดาวในชื่อเมนู)
  function take(str, alias) {
    const i = str.indexOf(alias);
    return i < 0 ? str : str.slice(0, i) + '|' + str.slice(i + alias.length);
  }

  function longestHit(text, list) {
    let best = null;
    for (const item of list) {
      for (const al of item.a) {
        const a = norm(al);
        if (a && text.includes(a) && (!best || a.length > best.alias.length)) best = { item, alias: a };
      }
    }
    return best;
  }

  function allHits(text, list) {
    const hits = [];
    let t = text;
    for (;;) {
      const h = longestHit(t, list);
      if (!h) break;
      hits.push(h.item);
      t = take(t, h.alias);
    }
    return { hits, rest: t };
  }

  // ---------- ตัวเลขในข้อความ: ราคา / จำนวน / กรัม ----------
  function readNumbers(raw) {
    let s = String(raw || '');
    const out = { price: null, qty: 1, qtyGiven: false, grams: null };
    const g = s.match(/(\d+(?:\.\d+)?)\s*(?:g|กรัม|ก\.)/i);
    if (g) { out.grams = parseFloat(g[1]); s = s.replace(g[0], ' '); }
    const q = s.match(/(?:x|×)\s*(\d+)|(\d+)\s*(?:ไม้|ชิ้น|จาน|ชาม|แก้ว|ถ้วย|ฟอง|อัน|น่อง|ลูก|คู่|แผ่น|ขวด|กระป๋อง|ห่อ|ซอง|กล่อง|สกู๊ป|ที่)/i);
    if (q) { out.qty = parseInt(q[1] || q[2], 10); out.qtyGiven = true; const u = q[0].match(/[ก-๙]+/); out.unit = u ? u[0] : null; s = s.replace(q[0], ' '); }
    const p = s.match(/(?:฿\s*)?(\d+(?:\.\d+)?)\s*(?:บาท|บ\.?|฿)?/);
    if (p) { out.price = parseFloat(p[1]); s = s.replace(p[0], ' '); }
    out.text = s;
    return out;
  }

  // ---------- 6) ตัวจับคำหลัก ----------
  // match('กะเพราหมูกรอบ ไข่ดาว 65') →
  //   { kcal, lines:[{label,kcal,src}], category:'อาหาร', kind:'food', price:65, mode:'dish'|'built'|'none' }
  // ชื่อเมนูเต็มนับเป็นคำค้นด้วย (พิมพ์ "ข้าวกะเพราไก่" ต้องไม่เหลือ "ข้าว" ให้นับซ้ำ)
  // ข้าวราดแกง: กับข้าวแต่ละอย่าง = ส่วนประกอบเสมือน k0, k1 … (ค่าต่อ 100 g จากสูตร)
  const KG = FDB.KG || { rice: 180, each: [150, 100, 80, 70] };
  const KAENG = (FDB.K || []).map((t, i) => {
    const w = t[2].reduce((a, x) => a + x[1], 0) || 100, tot = sumParts(t[2].map((x) => partOf(x[0], x[1])).filter(Boolean)), key = 'k' + i;
    COMP[key] = [t[0], Math.round(tot.kcal * 100 / w), r1(tot.p * 100 / w), r1(tot.c * 100 / w), r1(tot.f * 100 / w)];
    return { n: t[0], a: t[1].concat(t[0]), key, fixed: t[3] || null };
  });
  (function () {
    const m = KAENG.filter((x) => !x.fixed); const avg = (j) => r1(m.reduce((a, x) => a + COMP[x.key][j], 0) / (m.length || 1));
    COMP.k_avg = ['กับข้าวทั่วไป (เฉลี่ย)', Math.round(avg(1)), avg(2), avg(3), avg(4)];
  })();
  const KAENG_TRIG = ['ข้าวราดแกง', 'ข้าวแกง', 'ราดแกง', 'ข้าวกับข้าว'];
  const DISH_IDX = DISHES.map((d) => ({ ...d, a: d.a.concat(d.n.replace(/\(.*?\)|\d+.*$/g, '')) }));
  const EGG_ADDONS = ADDONS.filter((x) => x.k > 0 && /ไข่/.test(x.n));
  const CARBS = INGREDIENTS.filter((x) => x.t === 'carb');
  const RICE_MODS = ADDONS.filter((x) => /^ข้าว/.test(x.n)); // ข้าวน้อย / ข้าวพิเศษ: ต้องไม่ถูกอ่านเป็นวัตถุดิบ "ข้าว" หรือ "พิเศษ"

  // วัตถุดิบที่คร่อมคำเมนูแต่ไม่ได้อยู่ในคำเมนู เช่น "อกไก่ทอด" (อกไก่ ทับ ไก่ทอด) → ประกอบเอง
  function ingredientOverrides(text, dishAlias, ingAlias) {
    if (dishAlias.includes(ingAlias)) return false;
    const d0 = text.indexOf(dishAlias), d1 = d0 + dishAlias.length;
    const i0 = text.indexOf(ingAlias), i1 = i0 + ingAlias.length;
    return i0 < d1 && d0 < i1;
  }

  // ส่วนประกอบ → บรรทัดแสดงผล
  function linesFromParts(pl) {
    return pl.map((x) => ({ label: x.name + ' ' + x.g + ' g', kcal: x.kcal, p: x.p, c: x.c, f: x.f, src: 'N', base: true, key: x.key, g: x.g, alt: x.alt }));
  }
  const RICE_KEYS = ['rice', 'rice_oil', 'rice_brown', 'sticky', 'congee'];
  const SWEET_KEYS = ['sugar', 'syrup', 'cond_milk', 'juice_sw'];
  const SKIN_SWAP = { chk_boil_skin: 'chk_boil', chk_grill: 'chk_grill_lean' };
  const CARB_COMP = { 'ข้าวสวย (สุก)': 'rice', 'ข้าวกล้อง (สุก)': 'rice_brown', 'ข้าวเหนียว (สุก)': 'sticky', 'เส้นก๋วยเตี๋ยว (สุก)': 'nd_rice', 'มันฝรั่ง': 'potato', 'มันเทศ': 'sweetpotato' };
  const FLAGS = [['noskin', ['ไม่เอาหนัง', 'ไม่หนัง', 'ลอกหนัง', 'ไม่มีหนัง']], ['lessoil', ['น้ำมันน้อย']], ['noegg', ['ไม่ใส่ไข่', 'ไม่เอาไข่']]];

  function match(input, opts = {}) {
    const nums = readNumbers(input);
    let text = norm(nums.text);
    let lines = [];
    let kind = 'food';
    let mode = 'none';
    let parts = null, dishName = '';
    // ตัวปรับที่ต้องดึงออกก่อน ไม่ให้ถูกอ่านเป็นวัตถุดิบ (ข้าวน้อย ≠ ข้าว, ไม่เอาหนัง, น้ำมันน้อย, ไม่ใส่ไข่)
    const riceMods = [];
    RICE_MODS.forEach((m) => { for (const al of m.a) { const a = norm(al); if (text.includes(a)) { text = take(text, a); riceMods.push(m); break; } } });
    const flags = {};
    FLAGS.forEach(([k, al]) => { for (const a0 of al) { const a = norm(a0); if (text.includes(a)) { text = take(text, a); flags[k] = true; break; } } });

    // 6.0 ข้าวราดแกง: ข้าว 1 จาน + กับข้าวตามจำนวนอย่าง (ยิ่งหลายอย่าง ตักอย่างละน้อยลง)
    let kaeng = null;
    const trig = KAENG_TRIG.map(norm).find((a) => text.includes(a));
    if (trig) {
      text = take(text, trig);
      const tp = allHits(text, KAENG); text = tp.rest;
      const n = tp.hits.filter((x) => !x.fixed).length;
      const each = KG.each[Math.min(Math.max(n, 1), KG.each.length) - 1];
      const kp = [['rice', KG.rice]];
      if (!n) kp.push(['k_avg', KG.each[1] * 2]);
      tp.hits.forEach((x) => kp.push([x.key, x.fixed || each]));
      kaeng = { item: { n: 'ข้าวราดแกง' + (tp.hits.length ? ': ' + tp.hits.map((x) => x.n).join(' + ') : ' 2 อย่าง (ยังไม่ระบุกับ)'), c: 'food', parts: kp, unit: 'จาน' }, alias: '' };
    }
    // 6.1 เมนูสำเร็จ (แยกส่วนประกอบ)
    let dish = kaeng || longestHit(text, DISH_IDX);
    const ingTop = longestHit(text, INGREDIENTS);
    if (dish && !kaeng && (nums.grams || (ingTop && ingredientOverrides(text, dish.alias, ingTop.alias)))) dish = null;

    if (dish) {
      mode = 'dish';
      kind = dish.item.c;
      let ps = dish.item.parts.map((x) => [x[0], x[1], 0]);
      const names = [dish.item.n];
      const groups = [dish.item];
      text = take(text, dish.alias);
      // เมนูที่สองที่พิมพ์ต่อกัน เช่น "ไก่ย่าง ส้มตำ" (คำยาว ≥ 3 ตัวอักษร กันจับผิด)
      for (;;) {
        const h = longestHit(text, DISH_IDX);
        if (!h || h.alias.length < 3) break;
        ps = ps.concat(h.item.parts.map((x) => [x[0], x[1], groups.length])); groups.push(h.item); names.push(h.item.n);
        text = take(text, h.alias);
      }
      // ของกินคู่ที่พิมพ์ต่อท้าย เช่น "ส้มตำ ข้าวเหนียว"
      const side = allHits(text, CARBS);
      side.hits.forEach((x) => ps.push([CARB_COMP[x.n] || 'rice', x.g, -1]));
      text = side.rest;
      // ไข่ที่สั่งเพิ่ม
      const eggs = allHits(text, EGG_ADDONS);
      eggs.hits.forEach((x) => ps.push([x.part || 'egg', 50, -1]));
      text = eggs.rest;
      const add = allHits(text, ADDONS); text = add.rest;
      if (flags.noegg) ps = ps.filter((x) => !/^egg/.test(x[0]));
      if (flags.noskin) ps = ps.map((x) => [SKIN_SWAP[x[0]] || x[0], x[1], x[2]]);
      if (flags.lessoil) ps = ps.map((x) => (x[0] === 'oil' ? [x[0], x[1] * 0.5, x[2]] : x));
      riceMods.forEach((m) => {
        const less = m.k < 0;
        if (ps.some((x) => RICE_KEYS.includes(x[0]))) ps = ps.map((x) => (RICE_KEYS.includes(x[0]) ? [x[0], less ? x[1] * 0.6 : x[1] + 100, x[2]] : x));
        else ps.push(['rice', less ? 100 : 150, -1]);
      });
      if (add.hits.some((x) => x.n.startsWith('พิเศษ'))) {
        let bi = -1, bv = 0;
        ps.forEach((x, i) => { const c = COMP[x[0]]; const v = c ? c[2] * x[1] : 0; if (v > bv) { bv = v; bi = i; } });
        if (bi >= 0) ps[bi] = [ps[bi][0], ps[bi][1] * 1.5, ps[bi][2]];
      }
      // ความหวาน: ลดน้ำตาล/น้ำเชื่อม/นมข้น
      const sw = longestHit(text, SWEET);
      if (sw && dish.item.sweet) { const f = sw.item.n === 'ไม่หวาน' ? 0 : 0.5; ps = ps.map((x) => (SWEET_KEYS.includes(x[0]) ? [x[0], x[1] * f, x[2]] : x)); }
      // จำนวน: เมนูที่ 1 ที่มีหลายชิ้นอยู่แล้ว (กล้วยแขก 3 ชิ้น) ให้หารด้วยจำนวนชิ้นต่อที่
      // "หมูปิ้ง 3 ไม้ ข้าวเหนียว" = คูณเฉพาะเมนูที่หน่วยตรงกัน (ไม้) ไม่คูณข้าวเหนียว
      let gi = groups.findIndex((g) => g.unit && nums.unit && g.unit === nums.unit);
      const per = (gi >= 0 ? groups[gi].cnt : dish.item.cnt) || 1;
      const factor = nums.qtyGiven ? nums.qty / per : 1;
      if (factor !== 1) ps = ps.map((x) => (gi < 0 || x[2] === gi ? [x[0], x[1] * factor, x[2]] : x));
      // รวมส่วนประกอบซ้ำ
      const merged = [];
      ps.forEach((x) => { const m = merged.find((y) => y[0] === x[0]); if (m) m[1] += x[1]; else merged.push([x[0], x[1]]); });
      parts = merged.filter((x) => x[1] > 0.5).map((x) => partOf(x[0], x[1])).filter(Boolean);
      lines = linesFromParts(parts);
      dishName = names.join(' + ') + (factor !== 1 ? ' × ' + nums.qty : '');
    } else {
      // 6.2 ประกอบจากวัตถุดิบ + วิธีปรุง
      // จับไข่ดาว/ไข่ต้ม/ไข่เจียวก่อน ไม่ให้ "ต้ม" ถูกอ่านเป็นวิธีปรุง และ "ไข่" เป็นวัตถุดิบ
      const eggs = allHits(text, EGG_ADDONS);
      eggs.hits.forEach((x) => { const e = partOf(x.part || 'egg', 50); lines.push({ label: x.n, kcal: e.kcal, p: e.p, c: e.c, f: e.f, src: x.src, base: true }); });
      text = eggs.rest;
      if (eggs.hits.length) mode = 'built';

      const method = longestHit(text, METHODS);
      if (method) text = take(text, method.alias);
      const ing = allHits(text, INGREDIENTS);
      text = ing.rest;
      if (ing.hits.length) {
        mode = 'built';
        const main = ing.hits.find((x) => x.t === 'protein') || ing.hits.find((x) => x.t !== 'carb') || ing.hits[0];
        ing.hits.forEach((x) => {
          const grams = x === main && nums.grams ? nums.grams : x.g;
          const q = grams / 100;
          lines.push({ label: `${x.n} ${grams} g`, kcal: Math.round(x.k * q), p: r1((x.p || 0) * q), c: r1((x.c || 0) * q), f: r1((x.f || 0) * q), src: x.src, base: true });
          if (method && x === main) {
            const m = method.item;
            const mq = m.perServing != null ? 1 : grams / 100;
            const add = m.perServing != null ? m.perServing : Math.round(m.per100g * mq);
            lines.push({ label: `${m.n}: ${m.note}`, kcal: add, p: r1((m.mp || 0) * mq), c: r1((m.mc || 0) * mq), f: r1((m.mf || 0) * mq), src: m.src });
          }
        });
      } else if (method && method.item.perServing && !eggs.hits.length) {
        mode = 'built';
        const m = method.item;
        lines.push({ label: m.n, kcal: m.perServing, p: m.mp || 0, c: m.mc || 0, f: m.mf || 0, src: m.src, base: true });
      }
      if (mode !== 'none') {
        const add = allHits(text, ADDONS);
        add.hits.forEach((x) => lines.push({ label: x.n, kcal: x.k, p: x.n.startsWith('พิเศษ') ? 10 : 0, c: 0, f: x.k < 0 && /น้ำมัน/.test(x.n) ? -5 : 0, src: x.src }));
        text = add.rest;
        riceMods.forEach((x) => { const r = partOf('rice', x.k < 0 ? 60 : 100); const sg = x.k < 0 ? -1 : 1; lines.push({ label: x.n, kcal: sg * r.kcal, p: sg * r.p, c: sg * r.c, f: sg * r.f, src: x.src }); });
      }
      const factor = nums.qtyGiven ? nums.qty : 1;
      if (factor !== 1) lines = lines.map((l) => Object.assign({}, l, { kcal: Math.round(l.kcal * factor), p: r1(l.p * factor), c: r1(l.c * factor), f: r1(l.f * factor) }));
      if (factor !== 1) lines.push({ label: `× ${nums.qty}`, kcal: 0, p: 0, c: 0, f: 0, src: '' });
    }

    const tot = lines.reduce((a, l) => ({ kcal: a.kcal + (l.kcal || 0), p: a.p + (l.p || 0), c: a.c + (l.c || 0), f: a.f + (l.f || 0) }), { kcal: 0, p: 0, c: 0, f: 0 });

    // เดาหมวดเครื่องดื่มจากคำทั่วไป แม้ไม่เจอเมนู
    if (mode === 'none' && /กาแฟ|ชา|น้ำ|นม|โกโก้|สมูท|โซดา|เบียร์|ปั่น/.test(norm(input))) kind = 'drink';

    return {
      input,
      mode,
      dish: dishName,
      kcal: Math.max(0, Math.round(tot.kcal)),
      p: mode === 'none' ? null : Math.max(0, r1(tot.p)),
      c: mode === 'none' ? null : Math.max(0, r1(tot.c)),
      f: mode === 'none' ? null : Math.max(0, r1(tot.f)),
      parts: parts ? parts.map((x) => [x.key, x.g]) : null,
      lines,
      kind,
      category: MONEY_CAT[kind],
      meal: guessMeal(opts.time || new Date(), kind),
      price: nums.price,
      confidence: mode === 'dish' ? 'high' : mode === 'built' ? 'medium' : 'none',
    };
  }

  // แนะนำเมนูขณะพิมพ์ (autocomplete)
  function suggest(input, limit = 5) {
    const t = norm(input);
    if (!t) return [];
    const pool = DISHES.map((d) => ({ n: d.n, k: d.k, s: d.s, src: d.src }));
    return pool
      .map((d) => ({ d, i: norm(d.n).indexOf(t) }))
      .filter((x) => x.i >= 0)
      .sort((a, b) => a.i - b.i || a.d.n.length - b.d.n.length)
      .slice(0, limit)
      .map((x) => x.d);
  }

  function guessMeal(time, kind) {
    const d = time instanceof Date ? time : new Date(time);
    const h = d.getHours() + d.getMinutes() / 60;
    if (kind !== 'food') return 'ของว่าง';
    if (h >= 5 && h < 10.5) return 'เช้า';
    if (h >= 10.5 && h < 14.5) return 'กลางวัน';
    if (h >= 16.5 && h < 21.5) return 'เย็น';
    return 'ของว่าง';
  }

  // ---------- 7) สูตรคำนวณงบแคลอรี่ ----------
  const KCAL_PER_KG = 7700;

  // Mifflin-St Jeor
  function bmr({ sex = 'male', kg, cm, age }) {
    return 10 * kg + 6.25 * cm - 5 * age + (sex === 'male' ? 5 : -161);
  }

  // TDEE จากสูตร: BMR × ระดับกิจกรรมประจำวัน (ไม่รวมการออกกำลังกาย ซึ่งนับเป็นโบนัสแยก)
  //   1.2 นั่งทั้งวัน · 1.3 นั่งสลับเดิน/ออกหน้างานบ้าง · 1.375 เดินเยอะ
  function tdeeFormula(p) { return bmr(p) * (p.activity || 1.2); }

  // ค่าเริ่มต้นของ Patrick (13 ต.ค. 2026): ชาย 26 ปี 171 cm 93 kg · นั่ง 70% เดิน 30% + ออกหน้างานบางวัน
  const DEFAULT_PROFILE = { sex: 'male', age: 26, cm: 171, kg: 93, activity: 1.3, goalKg: 70, deficit: 750, exerciseCredit: 0, midKg: 80, planStart: '2026-11-18', ifOn: 1, ifStart: '11:30', ifEnd: '19:30' };

  // แนวโน้มน้ำหนัก: ถดถอยเชิงเส้นของน้ำหนักทุกวันในช่วงที่เลือก → กก./วัน
  function weightSlope(weights) {
    const pts = weights.filter((w) => w.kg != null).map((w) => [new Date(w.date).getTime() / 864e5, w.kg]);
    if (pts.length < 2) return null;
    const n = pts.length;
    const mx = pts.reduce((a, p) => a + p[0], 0) / n;
    const my = pts.reduce((a, p) => a + p[1], 0) / n;
    let sxy = 0, sxx = 0;
    pts.forEach(([x, y]) => { sxy += (x - mx) * (y - my); sxx += (x - mx) ** 2; });
    return sxx ? sxy / sxx : null;
  }

  // TDEE จากข้อมูลจริง: กินเฉลี่ย − (น้ำหนักเปลี่ยน/วัน × 7,700)
  // ใช้เฉพาะวันที่บันทึกอาหารครบ (complete: true)
  function tdeeAdaptive(days) {
    const logged = days.filter((d) => d.complete && d.kcal != null);
    if (logged.length < 14) return null;
    const avgIn = logged.reduce((a, d) => a + d.kcal, 0) / logged.length;
    const slope = weightSlope(days.map((d) => ({ date: d.date, kg: d.kg })));
    if (slope == null) return null;
    return { tdee: avgIn - slope * KCAL_PER_KG, avgIn, slopePerWeek: slope * 7, days: logged.length };
  }

  // TDEE ที่ใช้จริง: <14 วันใช้สูตร · 14–28 วันผสม · ≥28 วันใช้ข้อมูลจริง
  function tdeeUsed(profile, days) {
    const f = tdeeFormula(profile);
    const a = tdeeAdaptive(days || []);
    if (!a) return { tdee: f, formula: f, adaptive: null, weight: 0 };
    const w = Math.min(1, Math.max(0, (a.days - 14) / 14) * 0.5 + 0.5);
    return { tdee: f * (1 - w) + a.tdee * w, formula: f, adaptive: a.tdee, weight: w };
  }

  // งบแคลอรี่ต่อวัน
  //   deficit: kcal/วัน (เช่น 500) · exerciseCredit: นับคืนแคลอรี่ออกกำลังกายกี่ส่วน (0 = ไม่นับ, 0.5 = ครึ่งเดียว)
  function budget({ profile, days, deficit = 500, eaten = 0, exercise = 0, exerciseCredit = 0 }) {
    const t = tdeeUsed(profile, days);
    // ขั้นต่ำที่ใช้กันทั่วไป: ชาย 1,500 · หญิง 1,200 kcal/วัน (ไม่ให้เป้าต่ำกว่านี้)
    const floor = profile.sex === 'female' ? 1200 : 1500;
    const raw = t.tdee - deficit;
    const target = Math.round(Math.max(raw, floor));
    const bonus = Math.round(exercise * exerciseCredit);
    return {
      bmr: Math.round(bmr(profile)),
      tdee: Math.round(t.tdee),
      tdeeFormula: Math.round(t.formula),
      tdeeAdaptive: t.adaptive != null ? Math.round(t.adaptive) : null,
      target,
      floored: raw < floor,
      eaten,
      bonus,
      remaining: target + bonus - eaten,
      kgPerWeek: +((Math.min(deficit, t.tdee - floor) * 7) / KCAL_PER_KG).toFixed(2),
    };
  }

  const api = { DEFAULT_PROFILE, DISHES, COMP, KAENG, KG, INGREDIENTS, METHODS, ADDONS, SRC, MONEY_CAT, match, suggest, partOf, sumParts, linesFromParts, bmr, tdeeFormula, tdeeAdaptive, tdeeUsed, budget, weightSlope, norm };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.BodyEngine = api;
})(typeof window !== 'undefined' ? window : globalThis);
