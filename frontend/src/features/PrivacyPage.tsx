import { useNavigate } from 'react-router-dom'
import { ChevronLeft } from 'lucide-react'
import { useT } from '@/components/ui'

/** ⚠️ Change this to the address that will actually answer a deletion request.
 *  Under PDPA a stated contact that nobody monitors is worse than none. */
const CONTACT_EMAIL = 'psompong.biz@gmail.com'
const UPDATED = '2026-07-29'

const TH = [
  {
    h: 'ผู้เก็บรวบรวมข้อมูล',
    p: [
      `แอป “AI คัดผลดี” ติดต่อได้ที่ ${CONTACT_EMAIL}`,
      'เอกสารนี้จัดทำตามพระราชบัญญัติคุ้มครองข้อมูลส่วนบุคคล พ.ศ. 2562 (PDPA)',
    ],
  },
  {
    h: 'ข้อมูลที่เก็บ',
    p: [
      'ชื่อ-นามสกุล · เบอร์โทรศัพท์ · จังหวัด · ชื่อสวน (ถ้ากรอก)',
      'ภาพถ่ายผลไม้บนแผ่นสอบเทียบ และผลการวัดที่ได้จากภาพนั้น',
      'เราไม่เก็บพิกัด GPS ไม่เข้าถึงรายชื่อผู้ติดต่อ และไม่เก็บภาพอื่นในเครื่อง',
    ],
  },
  {
    h: 'วัตถุประสงค์',
    p: [
      'ระบุที่มาของผลการวัด เพื่อให้ย้อนกลับไปตรวจสอบได้ว่าผลนี้มาจากสวนใด',
      'ติดต่อกลับเมื่อระบบวัดผิดพลาดหรือมีปัญหาการใช้งาน',
      'พัฒนาความแม่นยำของระบบ โดยใช้ภาพถ่ายเป็นข้อมูลฝึกสอนแบบจำลอง',
    ],
  },
  {
    h: 'ฐานทางกฎหมาย',
    p: [
      'เราเก็บข้อมูลบนฐาน “ความยินยอม” เท่านั้น หากไม่กดยินยอม ระบบจะไม่ส่งข้อมูลส่วนบุคคลใด ๆ ออกจากเครื่องของท่าน',
      'ท่านถอนความยินยอมได้ทุกเมื่อ โดยไม่กระทบการใช้งานที่ผ่านมา',
    ],
  },
  {
    h: 'ระยะเวลาเก็บรักษา',
    p: [
      'ข้อมูลผู้ใช้และภาพถ่ายเก็บไว้ตราบเท่าที่ยังใช้พัฒนาระบบ หรือจนกว่าท่านจะขอให้ลบ',
      'ประวัติการวัดในเครื่องของท่านเก็บอยู่ในมือถือ ลบได้เองทุกเมื่อจากหน้าประวัติ',
    ],
  },
  {
    h: 'การเปิดเผยต่อบุคคลภายนอก',
    p: [
      'เราไม่ขาย ไม่แลกเปลี่ยน และไม่เปิดเผยข้อมูลส่วนบุคคลของท่านต่อบุคคลภายนอก',
      'ผลการวัดจะถูกส่งให้ผู้รับซื้อก็ต่อเมื่อท่านเป็นผู้กดส่งเองเท่านั้น',
    ],
  },
  {
    h: 'สิทธิของท่าน',
    p: [
      'ขอเข้าถึงและขอสำเนาข้อมูลของท่าน',
      'ขอแก้ไขข้อมูลให้ถูกต้อง',
      'ขอให้ลบข้อมูล หรือถอนความยินยอม',
      'ขอให้ระงับการใช้ข้อมูล และขอคัดค้านการเก็บรวบรวม',
      `ใช้สิทธิได้โดยติดต่อ ${CONTACT_EMAIL} เราจะดำเนินการภายใน 30 วัน`,
    ],
  },
  {
    h: 'ความปลอดภัย',
    p: [
      'เบอร์โทรศัพท์ถูกแปลงเป็นรหัสอ้างอิงแบบทางเดียว (hash) สำหรับใช้เชื่อมโยงข้อมูล จึงค้นหาและจัดกลุ่มได้โดยไม่ต้องเปิดอ่านเบอร์จริง',
      'ข้อมูลรับส่งผ่านการเชื่อมต่อที่เข้ารหัส (HTTPS)',
    ],
  },
]

const EN = [
  { h: 'Who collects this data', p: [`The “AI Kat Pon Dee” app. Contact: ${CONTACT_EMAIL}`, 'Written to meet Thailand’s Personal Data Protection Act B.E. 2562 (PDPA).'] },
  { h: 'What we collect', p: ['Name · phone number · province · orchard name (if given)', 'Photos of fruit on the calibration sheet, and the measurements derived from them', 'No GPS location, no contacts, no other photos on your device'] },
  { h: 'Why', p: ['To attribute a measurement to an orchard so it can be traced back', 'To contact you if a measurement is wrong or something breaks', 'To improve accuracy — photos are training data for the vision model'] },
  { h: 'Legal basis', p: ['Consent only. Without consent, no personal data leaves your device.', 'You may withdraw consent at any time.'] },
  { h: 'How long we keep it', p: ['For as long as it is used to improve the system, or until you ask us to delete it', 'History on your phone stays on your phone and can be deleted at any time'] },
  { h: 'Sharing', p: ['We do not sell, trade or disclose your personal data to third parties.', 'Results reach a buyer only when you choose to send them.'] },
  { h: 'Your rights', p: ['Access and obtain a copy', 'Correct inaccurate data', 'Erase your data or withdraw consent', 'Restrict or object to processing', `Contact ${CONTACT_EMAIL} — we respond within 30 days`] },
  { h: 'Security', p: ['Phone numbers are stored as a one-way hash used as a reference id, so records can be grouped without reading the number itself.', 'All traffic is encrypted (HTTPS).'] },
]

export default function PrivacyPage() {
  const { t, locale } = useT()
  const nav = useNavigate()
  const sections = locale === 'en' ? EN : TH

  return (
    <div className="px-5 pt-4 pb-10">
      <button
        onClick={() => nav(-1)}
        className="press -ml-2 mb-2 flex items-center gap-1 p-2 text-[14px] font-medium text-muted"
      >
        <ChevronLeft size={18} /> {t('common.back')}
      </button>

      <h1 className="text-[26px] font-bold tracking-tight">
        {locale === 'en' ? 'Privacy Policy' : 'นโยบายความเป็นส่วนตัว'}
      </h1>
      <p className="num mt-1 text-[12px] text-muted">
        {locale === 'en' ? 'Last updated' : 'ปรับปรุงล่าสุด'} {UPDATED}
      </p>

      <div className="mt-6 space-y-5">
        {sections.map((s) => (
          <section key={s.h} className="card p-5">
            <h2 className="text-[16px] font-bold">{s.h}</h2>
            <ul className="mt-2.5 space-y-2">
              {s.p.map((line) => (
                <li
                  key={line}
                  className="flex gap-2 text-[14px] leading-relaxed text-muted"
                >
                  <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-accent" />
                  <span className="min-w-0">{line}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  )
}
