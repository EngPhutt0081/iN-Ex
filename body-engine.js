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

  // ---------- 1) เมนูสำเร็จ (ต่อ 1 ที่) ----------
  // c: food | drink | dessert  → ใช้เลือกหมวดใน iN&Ex
  const DISHES = [
    // ข้าวจานเดียว
    { n: 'ข้าวกะเพราไก่ ไข่ดาว', a: ['กะเพราไก่ไข่ดาว'], k: 630, s: '1 จาน', c: 'food', src: 'T' },
    { n: 'ข้าวกะเพราไก่', a: ['กะเพราไก่'], k: 554, s: '1 จาน', c: 'food', src: 'W' },
    { n: 'ข้าวกะเพราหมูกรอบ', a: ['กะเพราหมูกรอบ'], k: 650, s: '1 จาน', c: 'food', src: 'W' },
    { n: 'ข้าวกะเพราหมูสับ', a: ['กะเพราหมูสับ', 'กะเพราหมู'], k: 600, s: '1 จาน', c: 'food', src: 'E' },
    { n: 'ข้าวมันไก่ต้ม', a: ['ข้าวมันไก่ต้ม', 'ข้าวมันไก่'], k: 585, s: '1 จาน', c: 'food', src: 'W' },
    { n: 'ข้าวมันไก่ทอด', a: ['ข้าวมันไก่ทอด'], k: 695, s: '1 จาน', c: 'food', src: 'W' },
    { n: 'ข้าวขาหมู', a: ['ข้าวขาหมู', 'ขาหมู'], k: 690, s: '1 จาน', c: 'food', src: 'W' },
    { n: 'ข้าวผัดหมู ใส่ไข่', a: ['ข้าวผัดหมู', 'ข้าวผัด'], k: 660, s: '1 จาน', c: 'food', src: 'W' },
    { n: 'ข้าวผัดหมูน้ำพริกเผา', a: ['ข้าวผัดน้ำพริกเผา', 'ข้าวผัดหมูน้ำพริกเผา'], k: 665, s: '1 จาน', c: 'food', src: 'W' },
    { n: 'ข้าวผัดคะน้าหมูกรอบ', a: ['คะน้าหมูกรอบ'], k: 670, s: '1 จาน', c: 'food', src: 'W' },
    { n: 'ข้าวกุ้งทอดกระเทียม', a: ['กุ้งทอดกระเทียม'], k: 495, s: '1 จาน', c: 'food', src: 'W' },
    { n: 'ข้าวไข่เจียว', a: ['ข้าวไข่เจียว'], k: 445, s: '1 จาน', c: 'food', src: 'T' },
    { n: 'ข้าวเหนียวหมูปิ้ง 3 ไม้', a: ['ข้าวเหนียวหมูปิ้ง'], k: 447, s: '3 ไม้ + ข้าวเหนียว', c: 'food', src: 'W', cnt: 3 },
    { n: 'หมูปิ้ง', a: ['หมูปิ้ง'], k: 100, s: '1 ไม้', c: 'food', src: 'E' }, // แยกจากชุด W: (447 − ข้าวเหนียว 146) ÷ 3
    { n: 'ต้มเลือดหมู + ข้าวสวย', a: ['ต้มเลือดหมู'], k: 330, s: '1 ชุด', c: 'food', src: 'W' },
    { n: 'โจ๊กหมูสับ', a: ['โจ๊ก'], k: 210, s: '1 ชาม', c: 'food', src: 'W' },
    { n: 'ขนมจีนแกงเขียวหวานไก่', a: ['ขนมจีนแกงเขียวหวาน'], k: 594, s: '1 จาน', c: 'food', src: 'W' },
    { n: 'ขนมจีนน้ำยา', a: ['ขนมจีนน้ำยา', 'ขนมจีน'], k: 375, s: '1 จาน', c: 'food', src: 'T' },
    // เส้น
    { n: 'ผัดไทย', a: ['ผัดไทย'], k: 565, s: '1 จาน', c: 'food', src: 'T' },
    { n: 'ผัดซีอิ๊ว', a: ['ผัดซีอิ๊ว'], k: 679, s: '1 จาน', c: 'food', src: 'T' },
    { n: 'บะหมี่กรอบราดหน้ารวมมิตร', a: ['ราดหน้ารวมมิตร', 'ราดหน้า'], k: 690, s: '1 จาน', c: 'food', src: 'W' },
    { n: 'บะหมี่กรอบราดหน้าไก่', a: ['ราดหน้าไก่'], k: 660, s: '1 จาน', c: 'food', src: 'W' },
    { n: 'ก๋วยเตี๋ยวหมูน้ำ', a: ['ก๋วยเตี๋ยว', 'เตี๋ยว'], k: 276, s: '1 ชาม', c: 'food', src: 'T' },
    { n: 'บะหมี่หมูแดง', a: ['บะหมี่หมูแดง', 'บะหมี่'], k: 231, s: '1 ชาม', c: 'food', src: 'T' },
    { n: 'ยำวุ้นเส้นหมูสับ', a: ['ยำวุ้นเส้น'], k: 120, s: '1 จาน', c: 'food', src: 'W' },
    // กับข้าว (ไม่รวมข้าว)
    { n: 'แกงเขียวหวานไก่ (ไม่รวมข้าว)', a: ['แกงเขียวหวาน'], k: 195, s: '1 ถ้วย', c: 'food', src: 'S' },
    { n: 'แกงจืดเต้าหู้หมูสับ', a: ['แกงจืด'], k: 110, s: '1 ถ้วย', c: 'food', src: 'W' },
    { n: 'กระเพาะปลา', a: ['กระเพาะปลา'], k: 170, s: '1 ชาม', c: 'food', src: 'T' },
    { n: 'ปลานึ่งมะนาว (ตัวเล็ก)', a: ['ปลานึ่งมะนาว', 'ปลานึ่ง'], k: 155, s: '1 จาน', c: 'food', src: 'W' },
    { n: 'น้ำพริก + ผักสด (เซ็ตเล็ก)', a: ['น้ำพริก'], k: 55, s: '1 ชุด', c: 'food', src: 'W' },
    { n: 'ไก่ทอด 1 น่อง', a: ['ไก่ทอด'], k: 345, s: '1 น่อง', c: 'food', src: 'W', unit: 'น่อง' },
    { n: 'ไข่ตุ๋น', a: ['ไข่ตุ๋น'], k: 75, s: '1 ถ้วย', c: 'food', src: 'W' },
    { n: 'ส้มตำไทย', a: ['ส้มตำ', 'ตำไทย', 'ตำ'], k: 120, s: '1 จาน', c: 'food', src: 'E' },
    // ของกินเล่น / เช้า
    { n: 'แซนด์วิชทูน่า', a: ['แซนด์วิช', 'แซนวิช'], k: 180, s: '1 ชิ้น', c: 'food', src: 'W' },
    { n: 'ไส้กรอก', a: ['ไส้กรอก'], k: 100, s: '1 อัน', c: 'food', src: 'T', unit: 'อัน' },
    { n: 'แฮมเบอร์เกอร์', a: ['แฮมเบอร์เกอร์', 'เบอร์เกอร์'], k: 265, s: '1 ชิ้น', c: 'food', src: 'T' },
    { n: 'ขนมปังปิ้ง', a: ['ขนมปังปิ้ง', 'ขนมปัง'], k: 80, s: '1 แผ่น', c: 'food', src: 'W', unit: 'แผ่น' },
    { n: 'ซุปข้าวโพด', a: ['ซุปข้าวโพด'], k: 140, s: '1 ถ้วย', c: 'food', src: 'W' },
    { n: 'ปาท่องโก๋', a: ['ปาท่องโก๋'], k: 69, s: '1 ชิ้น', c: 'dessert', src: 'W', unit: 'ชิ้น' },
    { n: 'ขนมครก', a: ['ขนมครก'], k: 92, s: '1 คู่', c: 'dessert', src: 'W', unit: 'คู่' },
    { n: 'กุยช่าย', a: ['กุยช่าย'], k: 53, s: '1 ชิ้น', c: 'dessert', src: 'W', unit: 'ชิ้น' },
    { n: 'กล้วยแขก 3 ชิ้น', a: ['กล้วยแขก', 'กล้วยทอด'], k: 255, s: '3 ชิ้น', c: 'dessert', src: 'T', cnt: 3 },
    // ของหวาน
    { n: 'โดนัท', a: ['โดนัท'], k: 270, s: '1 ชิ้น', c: 'dessert', src: 'W' },
    { n: 'บราวนี่', a: ['บราวนี่'], k: 340, s: '1 ชิ้น', c: 'dessert', src: 'W' },
    { n: 'เค้กช็อกโกแลต', a: ['เค้ก'], k: 235, s: '1 ชิ้น', c: 'dessert', src: 'T' },
    { n: 'ไอศกรีมโคน', a: ['ไอติม', 'ไอศกรีม', 'ไอศครีม'], k: 130, s: '1 โคน', c: 'dessert', src: 'T' },
    { n: 'บัวลอย', a: ['บัวลอย'], k: 223, s: '1 ถ้วย', c: 'dessert', src: 'T' },
    { n: 'ลอดช่องน้ำกะทิ', a: ['ลอดช่อง'], k: 210, s: '1 ถ้วย', c: 'dessert', src: 'W' },
    { n: 'เฉาก๊วย', a: ['เฉาก๊วย'], k: 90, s: '1 ถ้วย', c: 'dessert', src: 'W' },
    { n: 'ฝอยทอง', a: ['ฝอยทอง'], k: 146, s: '1 แพ', c: 'dessert', src: 'W' },
    // เครื่องดื่ม
    { n: 'กาแฟเย็น', a: ['กาแฟเย็น', 'กาแฟ', 'คอฟฟี่'], k: 115, s: '1 แก้ว', c: 'drink', src: 'T', sweet: true },
    { n: 'อเมริกาโน่ (ไม่ใส่น้ำตาล)', a: ['อเมริกาโน่', 'อเมริกาโน', 'กาแฟดำ'], k: 10, s: '1 แก้ว', c: 'drink', src: 'E' },
    { n: 'ลาเต้', a: ['ลาเต้', 'ลาเต'], k: 190, s: '1 แก้ว 16 oz', c: 'drink', src: 'E', sweet: true },
    { n: 'ชาดำเย็น', a: ['ชาดำเย็น', 'ชาดำ'], k: 110, s: '1 แก้ว', c: 'drink', src: 'T', sweet: true },
    { n: 'ชาไทยเย็น (ชานม)', a: ['ชาเย็น', 'ชาไทย', 'ชานม'], k: 250, s: '1 แก้ว', c: 'drink', src: 'E', sweet: true },
    { n: 'ชาเขียวไม่หวาน', a: ['ชาเขียวไม่หวาน'], k: 0, s: '1 ขวด', c: 'drink', src: 'E' },
    { n: 'น้ำอัดลม', a: ['น้ำอัดลม', 'โค้ก', 'เป๊ปซี่', 'โคล่า', 'น้ำดำ'], k: 160, s: '1 กระป๋อง', c: 'drink', src: 'T' },
    { n: 'น้ำเปล่า', a: ['น้ำเปล่า', 'น้ำดื่ม'], k: 0, s: '1 ขวด', c: 'drink', src: 'E' },
    { n: 'น้ำส้มคั้น', a: ['น้ำส้ม', 'น้ำผลไม้'], k: 112, s: '250 ml', c: 'drink', src: 'U' },
    { n: 'นมจืด', a: ['นมจืด', 'นมสด', 'นม'], k: 150, s: '1 แก้ว 240 ml', c: 'drink', src: 'S' },
    { n: 'นมพร่องมันเนย', a: ['นมพร่องมันเนย', 'นมพร่อง', 'นมโลว์แฟต'], k: 120, s: '1 แก้ว 240 ml', c: 'drink', src: 'S' },
  ];

  // ---------- 2) วัตถุดิบ (kcal ต่อ 100 g ดิบ) ----------
  // g: น้ำหนักต่อ 1 ที่ ถ้าไม่ได้พิมพ์กรัม · t: protein | carb | veg | fat
  const INGREDIENTS = [
    { n: 'อกไก่', a: ['อกไก่', 'ไก่'], k: 120, g: 100, t: 'protein', src: 'U' },
    { n: 'น่อง/สะโพกไก่ (มีหนัง)', a: ['น่องไก่', 'สะโพกไก่', 'น่อง', 'สะโพก'], k: 220, g: 100, t: 'protein', src: 'U' },
    { n: 'ปีกไก่ (มีหนัง)', a: ['ปีกไก่', 'ปีก'], k: 200, g: 50, t: 'protein', src: 'U' },
    { n: 'หมูเนื้อแดง', a: ['หมูเนื้อแดง', 'สันในหมู', 'สันนอกหมู', 'หมูสันใน', 'หมู'], k: 143, g: 100, t: 'protein', src: 'U' },
    { n: 'หมูสับ', a: ['หมูสับ', 'หมูบด'], k: 263, g: 100, t: 'protein', src: 'U' },
    { n: 'หมูสามชั้น', a: ['หมูสามชั้น', 'สามชั้น'], k: 518, g: 100, t: 'protein', src: 'U' },
    { n: 'หมูกรอบ (สุกแล้ว)', a: ['หมูกรอบ'], k: 500, g: 80, t: 'protein', src: 'E' },
    { n: 'เนื้อวัว (ไม่ติดมัน)', a: ['เนื้อวัว', 'เนื้อสัน', 'สเต็กเนื้อ', 'สเต็ก'], k: 150, g: 100, t: 'protein', src: 'U' },
    { n: 'กุ้ง', a: ['กุ้ง'], k: 85, g: 100, t: 'protein', src: 'U' },
    { n: 'ปลาเนื้อขาว (นิล/ดอลลี่)', a: ['ปลานิล', 'ปลาดอลลี่', 'ดอลลี่', 'ปลา'], k: 96, g: 100, t: 'protein', src: 'U' },
    { n: 'ปลาแซลมอน', a: ['แซลมอน'], k: 208, g: 100, t: 'protein', src: 'U' },
    { n: 'ปลาหมึก', a: ['ปลาหมึก', 'หมึก'], k: 92, g: 100, t: 'protein', src: 'U' },
    { n: 'ไข่ไก่', a: ['ไข่'], k: 143, g: 50, t: 'protein', src: 'U', unitG: 50, unit: 'ฟอง' },
    { n: 'เต้าหู้แข็ง', a: ['เต้าหู้แข็ง', 'เต้าหู้ขาว', 'เต้าหู้'], k: 144, g: 100, t: 'protein', src: 'U' },
    { n: 'ข้าวสวย (สุก)', a: ['ข้าวสวย', 'ข้าว'], k: 130, g: 180, t: 'carb', src: 'U' },
    { n: 'ข้าวกล้อง (สุก)', a: ['ข้าวกล้อง'], k: 123, g: 180, t: 'carb', src: 'U' },
    { n: 'ข้าวเหนียว (สุก)', a: ['ข้าวเหนียว'], k: 97, g: 150, t: 'carb', src: 'U' },
    { n: 'เส้นก๋วยเตี๋ยว (สุก)', a: ['เส้นเล็ก', 'เส้นใหญ่', 'เส้นหมี่', 'เส้น'], k: 108, g: 150, t: 'carb', src: 'U' },
    { n: 'มันฝรั่ง', a: ['มันฝรั่ง', 'เฟรนช์ฟราย', 'เฟรนช์ฟรายส์'], k: 77, g: 100, t: 'carb', src: 'U' },
    { n: 'มันเทศ', a: ['มันเทศ', 'มันหวาน'], k: 86, g: 100, t: 'carb', src: 'U' },
    { n: 'ผักทั่วไป', a: ['ผักบุ้ง', 'คะน้า', 'กะหล่ำ', 'ผักรวม', 'บรอกโคลี', 'ผัก'], k: 25, g: 100, t: 'veg', src: 'S' },
  ];

  // ---------- 3) วิธีปรุง ----------
  // perServing = kcal บวกต่อ 1 ที่ · per100g = kcal บวกต่อ 100 g ของวัตถุดิบหลัก
  const METHODS = [
    { id: 'batterfry', n: 'ชุบแป้งทอด', a: ['ชุบแป้งทอด', 'ชุบแป้ง', 'เทมปุระ', 'คาราอาเกะ', 'ทอดกรอบ'], per100g: 180, src: 'E', note: 'แป้ง + น้ำมันราว 15% ของน้ำหนัก' },
    { id: 'fry', n: 'ทอด', a: ['ทอด'], per100g: 110, src: 'F', note: 'น้ำมันราว 12% ของน้ำหนัก (ช่วงงานวิจัย 10–18%)' },
    { id: 'stirfry', n: 'ผัด', a: ['ผัด'], perServing: 90, src: 'S', note: 'น้ำมัน 2 ช้อนชา × 45 kcal' },
    { id: 'curry', n: 'แกงกะทิ', a: ['แกงกะทิ', 'ต้มข่า', 'กะทิ', 'แกงเผ็ด', 'พะแนง', 'มัสมั่น'], perServing: 200, src: 'E', note: 'กะทิราว 90 ml (≈ 4.5 ช้อนชาไขมัน)' },
    { id: 'yum', n: 'ยำ/ตำ', a: ['ยำ'], perServing: 40, src: 'E', note: 'น้ำตาลในน้ำยำราว 2.5 ช้อนชา' },
    { id: 'grill', n: 'ย่าง/ปิ้ง', a: ['ย่าง', 'ปิ้ง', 'เผา', 'อบ'], per100g: 0, src: 'S', note: 'ไม่เพิ่มน้ำมัน' },
    { id: 'boil', n: 'ต้ม/นึ่ง/ลวก', a: ['ต้ม', 'นึ่ง', 'ลวก', 'ตุ๋น', 'ซุป'], per100g: 0, src: 'S', note: 'ไม่เพิ่มน้ำมัน' },
  ];

  // ---------- 4) ส่วนเสริม / ตัวปรับ ----------
  const ADDONS = [
    { n: 'ไข่ดาว', a: ['ไข่ดาว'], k: 165, src: 'W' },
    { n: 'ไข่เจียว', a: ['ไข่เจียว'], k: 165, src: 'E' },
    { n: 'ไข่ต้ม', a: ['ไข่ต้ม'], k: 76, src: 'W' },
    { n: 'ไข่ข้น/ไข่ยางมะตูม', a: ['ไข่ยางมะตูม', 'ไข่ลวก'], k: 76, src: 'W' },
    { n: 'ข้าวพิเศษ (+1 ทัพพี)', a: ['ข้าวพิเศษ', 'เพิ่มข้าว'], k: 80, src: 'S' },
    { n: 'ไม่ใส่ไข่', a: ['ไม่ใส่ไข่', 'ไม่เอาไข่'], k: -76, src: 'W' },
    { n: 'พิเศษ (เพิ่มเนื้อ)', a: ['พิเศษ'], k: 100, src: 'E' },
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
    const q = s.match(/(?:x|×)\s*(\d+)|(\d+)\s*(?:ไม้|ชิ้น|จาน|ชาม|แก้ว|ถ้วย|ฟอง|อัน|น่อง|ลูก|คู่|แผ่น|ขวด|กระป๋อง|ห่อ|ที่)/i);
    if (q) { out.qty = parseInt(q[1] || q[2], 10); out.qtyGiven = true; s = s.replace(q[0], ' '); }
    const p = s.match(/(?:฿\s*)?(\d+(?:\.\d+)?)\s*(?:บาท|บ\.?|฿)?/);
    if (p) { out.price = parseFloat(p[1]); s = s.replace(p[0], ' '); }
    out.text = s;
    return out;
  }

  // ---------- 6) ตัวจับคำหลัก ----------
  // match('กะเพราหมูกรอบ ไข่ดาว 65') →
  //   { kcal, lines:[{label,kcal,src}], category:'อาหาร', kind:'food', price:65, mode:'dish'|'built'|'none' }
  // ชื่อเมนูเต็มนับเป็นคำค้นด้วย (พิมพ์ "ข้าวกะเพราไก่" ต้องไม่เหลือ "ข้าว" ให้นับซ้ำ)
  const DISH_IDX = DISHES.map((d) => ({ ...d, a: d.a.concat(d.n.replace(/\(.*?\)|\d+.*$/g, '')) }));
  const EGG_ADDONS = ADDONS.filter((x) => x.k > 0 && /ไข่/.test(x.n));
  const CARBS = INGREDIENTS.filter((x) => x.t === 'carb');

  // วัตถุดิบที่คร่อมคำเมนูแต่ไม่ได้อยู่ในคำเมนู เช่น "อกไก่ทอด" (อกไก่ ทับ ไก่ทอด) → ประกอบเอง
  function ingredientOverrides(text, dishAlias, ingAlias) {
    if (dishAlias.includes(ingAlias)) return false;
    const d0 = text.indexOf(dishAlias), d1 = d0 + dishAlias.length;
    const i0 = text.indexOf(ingAlias), i1 = i0 + ingAlias.length;
    return i0 < d1 && d0 < i1;
  }

  function match(input, opts = {}) {
    const nums = readNumbers(input);
    let text = norm(nums.text);
    const lines = [];
    let kind = 'food';
    let mode = 'none';

    // 6.1 เมนูสำเร็จ
    let dish = longestHit(text, DISH_IDX);
    const ingTop = longestHit(text, INGREDIENTS);
    if (dish && (nums.grams || (ingTop && ingredientOverrides(text, dish.alias, ingTop.alias)))) dish = null;

    if (dish) {
      mode = 'dish';
      kind = dish.item.c;
      lines.push({ label: `${dish.item.n} (${dish.item.s})`, kcal: dish.item.k, src: dish.item.src, base: true });
      text = take(text, dish.alias);
      // ของกินคู่ที่พิมพ์ต่อท้าย เช่น "ส้มตำ ข้าวเหนียว"
      const side = allHits(text, CARBS);
      side.hits.forEach((x) => lines.push({ label: `${x.n} ${x.g} g`, kcal: Math.round((x.k * x.g) / 100), src: x.src }));
      text = side.rest;
    } else {
      // 6.2 ประกอบจากวัตถุดิบ + วิธีปรุง
      // จับไข่ดาว/ไข่ต้ม/ไข่เจียวก่อน ไม่ให้ "ต้ม" ถูกอ่านเป็นวิธีปรุง และ "ไข่" เป็นวัตถุดิบ
      const eggs = allHits(text, EGG_ADDONS);
      eggs.hits.forEach((x) => lines.push({ label: x.n, kcal: x.k, src: x.src, base: true }));
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
          lines.push({ label: `${x.n} ${grams} g`, kcal: Math.round((x.k * grams) / 100), src: x.src, base: true });
          if (method && x === main) {
            const m = method.item;
            const add = m.perServing != null ? m.perServing : Math.round((m.per100g * grams) / 100);
            lines.push({ label: `${m.n}: ${m.note}`, kcal: add, src: m.src });
          }
        });
      } else if (method && method.item.perServing && !eggs.hits.length) {
        mode = 'built';
        lines.push({ label: method.item.n, kcal: method.item.perServing, src: method.item.src, base: true });
      }
    }

    // 6.3 ส่วนเสริม (ไข่ดาว, ข้าวพิเศษ, ไม่ใส่ไข่ ...)
    if (mode !== 'none') {
      const add = allHits(text, ADDONS);
      add.hits.forEach((x) => lines.push({ label: x.n, kcal: x.k, src: x.src }));
      text = add.rest;
    }

    // 6.4 ระดับความหวาน (เฉพาะเครื่องดื่มที่มีน้ำตาล)
    let sweetF = 1;
    const sw = longestHit(text, SWEET);
    if (sw && dish && dish.item.sweet) {
      sweetF = sw.item.f;
      const base = lines[0].kcal;
      lines.push({ label: sw.item.n, kcal: Math.round(base * sweetF) - base, src: 'E' });
    }

    let kcal = lines.reduce((a, l) => a + l.kcal, 0);
    // จำนวน: เมนูที่ 1 ที่มีหลายชิ้นอยู่แล้ว (กล้วยแขก 3 ชิ้น) ให้หารด้วยจำนวนชิ้นต่อที่
    const per = dish && dish.item.cnt ? dish.item.cnt : 1;
    const factor = nums.qtyGiven ? nums.qty / per : 1;
    if (factor !== 1) {
      const extra = Math.round(kcal * factor) - kcal;
      lines.push({ label: `× ${nums.qty}${per > 1 ? ` (ที่ละ ${per})` : ''}`, kcal: extra, src: '' });
      kcal += extra;
    }

    // เดาหมวดเครื่องดื่มจากคำทั่วไป แม้ไม่เจอเมนู
    if (mode === 'none' && /กาแฟ|ชา|น้ำ|นม|โกโก้|สมูท|โซดา|เบียร์|ปั่น/.test(norm(input))) kind = 'drink';

    return {
      input,
      mode,
      kcal: Math.max(0, Math.round(kcal)),
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
  const DEFAULT_PROFILE = { sex: 'male', age: 26, cm: 171, kg: 93, activity: 1.3, goalKg: 70, deficit: 750, exerciseCredit: 0 };

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

  const api = { DEFAULT_PROFILE, DISHES, INGREDIENTS, METHODS, ADDONS, SRC, MONEY_CAT, match, suggest, bmr, tdeeFormula, tdeeAdaptive, tdeeUsed, budget, weightSlope, norm };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.BodyEngine = api;
})(typeof window !== 'undefined' ? window : globalThis);
