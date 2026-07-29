# สอง repo — ต้นทางกับปลายทาง

| repo | บทบาท |
|---|---|
| **nrk16p/kat-pon-dee** | ต้นทาง แก้โค้ดที่นี่ทั้ง frontend และ backend |
| **nrk16p/be-kat-pon-dee** | สำเนา backend สำหรับ Render deploy เท่านั้น |

## ทำไมยังเก็บ monorepo ไว้

frontend กับ backend ใช้ **สัญญาเดียวกันคือเรขาคณิตของแผ่นสอบเทียบ**
ถ้าตัวเลขใน `backend/app/vision/mats.py` กับ `frontend/src/domain/mats.ts` ไม่ตรงกัน
**ระบบจะไม่พัง แต่จะวัดผิดเงียบ ๆ** ซึ่งเป็นบั๊กประเภทที่แย่ที่สุดในระบบนี้

`tools/check_contract.py` จับ drift แบบนี้ได้ก็ต่อเมื่อทั้งสองฝั่งอยู่ repo เดียวกัน
จึงแก้ที่ monorepo แล้วค่อย mirror ไป be-kat-pon-dee

## ซิงก์ backend ไป Render

หลังแก้อะไรใน `backend/` แล้ว commit ที่ monorepo:

```bash
git push origin main              # ต้นทาง
git subtree push --prefix=backend be main   # ปลายทาง → Render deploy อัตโนมัติ
```

ถ้ายังไม่มี remote `be`:

```bash
git remote add be https://github.com/nrk16p/be-kat-pon-dee.git
```

## ⚠️ อย่าแก้โค้ดที่ be-kat-pon-dee โดยตรง

`git subtree push` จะ push ไม่ผ่านถ้าปลายทางมี commit ที่ต้นทางไม่มี
ถ้าเผลอแก้ไปแล้ว ต้อง merge กลับเข้ามาก่อน:

```bash
git subtree pull --prefix=backend be main --squash
```
