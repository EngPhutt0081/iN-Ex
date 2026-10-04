# iN&Ex

แอปบันทึกรายรับ-รายจ่าย การเดินทาง การลงทุน และภาษี ใช้บน iPhone/iPad แบบติดตั้งบนหน้าจอโฮม ทำงานออฟไลน์ได้ ข้อมูลซิงก์เข้า Google Sheet ของตัวเอง

## ไฟล์ในโปรเจกต์

| ไฟล์ | ใช้ทำอะไร |
|---|---|
| `index.html` | ตัวแอปทั้งหมด |
| `manifest.webmanifest` | ชื่อ ไอคอน และการเปิดแบบเต็มจอ |
| `sw.js` | ทำให้แอปเปิดได้ตอนออฟไลน์ |
| `icon-*.png`, `apple-touch-icon.png` | ไอคอนแอป |
| `Code.gs` | โค้ดฝั่ง Google Sheet (วางใน Apps Script ไม่ได้ใช้บน GitHub) |

## ขั้นที่ 1: เปิดเว็บแอปด้วย GitHub Pages

1. อัปโหลดไฟล์ทั้งหมดขึ้น repo นี้ (Add file → Upload files)
2. Settings → Pages → Build and deployment → Source: **Deploy from a branch**
3. Branch: **main** / โฟลเดอร์ **/(root)** → Save
4. รอ 1–2 นาที แอปจะอยู่ที่ `https://<username>.github.io/<ชื่อ repo>/`

## ขั้นที่ 2: สร้าง Google Sheet ที่เป็นฐานข้อมูล (ทำบนคอมหรือ iPad สะดวกสุด)

1. เปิด sheets.google.com → สร้างชีตเปล่า ตั้งชื่อ **iN&Ex**
2. เมนู **Extensions → Apps Script**
3. ลบโค้ดเดิมทั้งหมด วางโค้ดจาก `Code.gs` แล้วกดบันทึก (ไอคอนแผ่นดิสก์)
4. ด้านบนเลือกฟังก์ชัน **setup** → กด **Run**
   - ครั้งแรก Google จะขอสิทธิ์: **Review permissions** → เลือกบัญชี → ถ้าขึ้น “Google hasn't verified this app” ให้กด **Advanced** → **Go to … (unsafe)** → **Allow** (เป็นสคริปต์ของคุณเอง)
5. กลับไปที่ชีต จะมีแท็บ **ตั้งค่า** ที่มี **รหัสลับ** อยู่
6. ใน Apps Script กด **Deploy → New deployment** → ไอคอนเฟือง เลือก **Web app**
   - Execute as: **Me**
   - Who has access: **Anyone**
   - กด **Deploy** แล้วคัดลอก **Web app URL** (ลงท้ายด้วย `/exec`)

## ขั้นที่ 3: ติดตั้งบน iPhone/iPad

1. เปิดลิงก์แอปจากขั้นที่ 1 ใน **Safari**
2. ปุ่มแชร์ → **Add to Home Screen** → Add
3. เปิดแอปจากไอคอน → แตะแถบ “ยังไม่ได้เชื่อม Google Sheet” → วาง **Web app URL** และ **รหัสลับ** → **เชื่อมต่อ**
4. ทำขั้นที่ 3 ซ้ำบนอีกเครื่อง ใส่ URL และรหัสลับเดียวกัน ข้อมูลจะซิงก์กัน

## อัปเดตแอปในอนาคต

อัปโหลด `index.html` ไฟล์ใหม่ทับไฟล์เดิมบน GitHub ครั้งต่อไปที่เปิดแอปตอนมีเน็ต จะได้เวอร์ชันใหม่เอง ข้อมูลไม่หาย

ถ้าแก้ `Code.gs` ต้อง **Deploy → Manage deployments → แก้ไข (ดินสอ) → Version: New version → Deploy** URL จะยังเหมือนเดิม

## ความปลอดภัย

- โค้ดใน repo นี้ไม่มีข้อมูลการเงินหรือรหัสลับ
- ข้อมูลทั้งหมดอยู่ใน Google Sheet ส่วนตัวของคุณ และในเครื่องที่ติดตั้งแอป
- อย่าแชร์ Google Sheet หรือรหัสลับกับใคร ถ้าสงสัยว่ารหัสรั่ว ให้ลบค่า `SECRET` ใน Apps Script → Project Settings → Script properties แล้วรัน `setup` ใหม่ จะได้รหัสใหม่
