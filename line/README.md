# LINE — rich menu และค่าที่ต้องใช้

## รูป rich menu

| ไฟล์ | ใช้ตอนไหน |
|---|---|
| `richmenu.jpg` | **อัปโหลดตัวนี้** — 2500 × 1686 px, 98 KB (LINE จำกัด 1 MB) |
| `richmenu.png` | ต้นฉบับ ถ้าจะแก้สี/ข้อความ |
| `richmenu.html` | ที่มาของรูป แก้แล้วเรนเดอร์ใหม่ได้ |

เรนเดอร์ใหม่:

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless \
  --window-size=2500,1686 --screenshot=line/richmenu.png \
  "file://$PWD/line/richmenu.html"
```

## พิกัดพื้นที่กด

ตั้งใน **LINE OA Manager → ริชเมนู → กำหนดเอง** แบ่ง 4 ช่อง
พิกัดนับจากมุมซ้ายบน หน่วยพิกเซล บนภาพ 2500 × 1686

| ช่อง | ปุ่ม | x | y | กว้าง | สูง | Action |
|---|---|---|---|---|---|---|
| A | เริ่มใช้งาน | 0 | 0 | 2500 | **1010** | `https://liff.line.me/2010888329-xpoKW4da/capture` |
| B | ประวัติ | 0 | **1010** | 833 | **676** | `https://liff.line.me/2010888329-xpoKW4da/history` |
| C | โหลดแผ่น | 833 | **1010** | 834 | **676** | `https://kat-pon-dee.vercel.app/mats/calibration-mat-500x500mm.pdf` |
| D | วิธีใช้ | 1667 | **1010** | 833 | **676** | `https://liff.line.me/2010888329-xpoKW4da/welcome` |

ปุ่มหลักสูง 1010 px ไม่ใช่ 843 เหมือนเวอร์ชันแรก — ชาวสวนส่วนใหญ่จะกดแค่ปุ่มนี้
ปุ่มเดียว จึงให้พื้นที่มันมากที่สุด และตัวอักษรใหญ่พอที่จะอ่านออกกลางแดด

> ช่อง C ต้องมี URL ของไฟล์ PDF ที่เข้าถึงได้จากอินเทอร์เน็ต — ตอนนี้ไฟล์อยู่ใน
> `AI Longan Measure/export/` ซึ่งยังไม่ได้อัปขึ้นที่ไหน ต้องอัปก่อนถึงจะใช้ได้

## ลำดับการตั้งค่า

1. **Provider** — developers.line.biz → Create provider
2. **LINE Login channel** → แท็บ LIFF → Add
   Endpoint `https://kat-pon-dee.vercel.app` · Size **Full** · Scopes `profile`, `openid`
   เปิด **shareTargetPicker** (ใช้ส่งผลเข้าแชทผู้รับซื้อ)
3. **Messaging API channel** — ⚠️ **ต้องอยู่ provider เดียวกับข้อ 2**
   `userId` ของ LINE ผูกกับ provider ถ้าคนละ provider จะเชื่อมคนเดียวกันไม่ได้ และแก้ทีหลังยาก
4. **manager.line.biz** → ริชเมนู → อัปโหลด `richmenu.jpg` → ใส่พิกัดตามตาราง
5. ตั้งเป็น "แสดงผล" → เอา QR ให้ชาวสวนแอด

## ค่าที่ต้องส่งกลับมา

| ค่า | เอาไปทำอะไร |
|---|---|
| **LIFF ID** (`2001234567-AbCdEfGh`) | ใส่เป็น `VITE_LIFF_ID` ใน Vercel |
| Privacy policy URL | `https://kat-pon-dee.vercel.app/privacy` — **ทำเสร็จแล้ว** |
