import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/**
 * Grower profile — device-local, no account.
 *
 * There is no server-side user store yet and nothing in the app needs one, so
 * asking for a phone number and an OTP would be pure friction: a farmer standing
 * in an orchard wants to measure fruit, not receive an SMS. Everything here stays
 * on the phone and is optional; the app is fully usable with all of it blank.
 *
 * When cloud sync arrives, this becomes the payload of a "claim this device"
 * step rather than something to re-collect.
 */
export interface Profile {
  name: string
  orchard: string
  province: string
  phone: string
  /** dismissed the first-run prompt, whether or not they filled anything in */
  onboarded: boolean
  /** PDPA consent — storing a grower's name, phone and province is personal
   *  data under พ.ร.บ.คุ้มครองข้อมูลส่วนบุคคล พ.ศ. 2562, so it needs explicit,
   *  recorded consent rather than an assumption. */
  consent: boolean
  consentAt: number | null
  /** LINE userId — a far better identity than a phone number when we have it:
   *  stable, unique, and it costs the grower no typing. */
  lineUserId: string
  linePicture: string
  /** pseudonymous id issued by the server at registration; the only thing sent
   *  with a capture from then on */
  growerId: string
}

interface ProfileState extends Profile {
  set: (patch: Partial<Profile>) => void
  clear: () => void
}

const EMPTY: Profile = {
  name: '',
  orchard: '',
  province: '',
  phone: '',
  onboarded: false,
  consent: false,
  consentAt: null,
  lineUserId: '',
  linePicture: '',
  growerId: '',
}

export const useProfile = create<ProfileState>()(
  persist(
    (set) => ({
      ...EMPTY,
      set: (patch) => set(patch),
      clear: () => set({ ...EMPTY, onboarded: true }),
    }),
    { name: 'kpd-profile' },
  ),
)

/** Initials for the avatar. Falls back to the orchard name, then a leaf. */
export function initials(p: Pick<Profile, 'name' | 'orchard'>): string {
  const src = (p.name || p.orchard).trim()
  if (!src) return '🌿'
  const parts = src.split(/\s+/).filter(Boolean)
  return (parts.length > 1 ? parts[0][0] + parts[1][0] : src.slice(0, 2)).toUpperCase()
}

export function hasProfile(p: Profile): boolean {
  return !!(p.name || p.orchard || p.province || p.phone)
}

/** Thai mobile/landline, digits only after stripping separators. */
export function validPhone(raw: string): boolean {
  const d = raw.replace(/\D/g, '')
  return d.length >= 9 && d.length <= 10
}

/** Registration is complete only with consent AND a way to identify the grower.
 *
 *  Signed in with LINE, the userId already identifies them, so a phone number is
 *  optional — demanding one anyway would throw away the whole benefit of the
 *  LINE login. Outside LINE we still need the phone as the identity. */
export function isRegistered(p: Profile): boolean {
  if (!p.consent || !p.name.trim() || !p.province) return false
  return p.lineUserId ? true : validPhone(p.phone)
}

export const PROVINCES = [
  'กระบี่','กาญจนบุรี','กาฬสินธุ์','กำแพงเพชร','ขอนแก่น','จันทบุรี','ฉะเชิงเทรา',
  'ชลบุรี','ชัยนาท','ชัยภูมิ','ชุมพร','เชียงราย','เชียงใหม่','ตรัง','ตราด','ตาก',
  'นครนายก','นครปฐม','นครพนม','นครราชสีมา','นครศรีธรรมราช','นครสวรรค์','นนทบุรี',
  'นราธิวาส','น่าน','บึงกาฬ','บุรีรัมย์','ปทุมธานี','ประจวบคีรีขันธ์','ปราจีนบุรี',
  'ปัตตานี','พระนครศรีอยุธยา','พะเยา','พังงา','พัทลุง','พิจิตร','พิษณุโลก','เพชรบุรี',
  'เพชรบูรณ์','แพร่','ภูเก็ต','มหาสารคาม','มุกดาหาร','แม่ฮ่องสอน','ยโสธร','ยะลา',
  'ร้อยเอ็ด','ระนอง','ระยอง','ราชบุรี','ลพบุรี','ลำปาง','ลำพูน','เลย','ศรีสะเกษ',
  'สกลนคร','สงขลา','สตูล','สมุทรปราการ','สมุทรสงคราม','สมุทรสาคร','สระแก้ว','สระบุรี',
  'สิงห์บุรี','สุโขทัย','สุพรรณบุรี','สุราษฎร์ธานี','สุรินทร์','หนองคาย','หนองบัวลำภู',
  'อ่างทอง','อำนาจเจริญ','อุดรธานี','อุตรดิตถ์','อุทัยธานี','อุบลราชธานี','กรุงเทพมหานคร',
] as const
