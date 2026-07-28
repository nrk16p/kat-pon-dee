import type { FruitProfile } from './types'

/**
 * ⚠️ THRESHOLDS ARE PROVISIONAL.
 *
 * The bands below follow size classes commonly used in the Thai fresh-fruit
 * trade, but they have NOT been checked against the current มกอช. / TAS text or
 * against a specific buyer's contract. Confirm before anyone grades fruit they
 * intend to sell, and keep `grading.source` truthful — a farmer needs to trace a
 * grade back to a standard to argue it with a buyer.
 *
 * Buyers routinely use their own bands. GradeScheme is data, so a farmer can be
 * given a buyer-specific scheme without a release.
 */

const GREEN = '#16A34A'
const LIME = '#65A30D'
const AMBER = '#D97706'
const STONE = '#78716C'

export const FRUITS: FruitProfile[] = [
  {
    id: 'longan',
    name: { th: 'ลำไย', en: 'Longan' },
    scientific: 'Dimocarpus longan',
    emoji: '🟤',
    color: '#8B6B4A',
    // near-spherical: the silhouette is a circle from any angle, so a single
    // diameter is the correct measurement
    metric: 'diameter',
    size: { min: 15, max: 40, typical: 28.4 },
    recommendedMat: 'full',
    enabled: true,
    grading: {
      id: 'longan-th-size',
      label: { th: 'เกรดตามขนาดผล', en: 'Size grade' },
      source: {
        th: 'ร่าง — อ้างอิงขนาดที่ใช้ทั่วไปในการค้า ยังไม่ยืนยันกับ มกอช.',
        en: 'Draft — common trade sizes, not yet confirmed against TAS',
      },
      rules: [
        { id: 'AA', label: { th: 'AA', en: 'AA' }, minDiameter: 28.0, color: GREEN },
        { id: 'A', label: { th: 'A', en: 'A' }, minDiameter: 25.0, color: LIME },
        { id: 'B', label: { th: 'B', en: 'B' }, minDiameter: 22.0, color: AMBER },
        { id: 'C', label: { th: 'C', en: 'C' }, minDiameter: 0, color: STONE },
      ],
    },
  },
  {
    id: 'mango',
    name: { th: 'มะม่วง', en: 'Mango' },
    scientific: 'Mangifera indica',
    emoji: '🥭',
    color: '#D97706',
    // elongated: one "diameter" is meaningless. The vision service returns the
    // major axis and the UI labels it as length, not diameter.
    metric: 'length',
    size: { min: 60, max: 200, typical: 118 },
    recommendedMat: 'full',
    enabled: true,
    grading: {
      id: 'mango-th-size',
      label: { th: 'เกรดตามความยาวผล', en: 'Length grade' },
      source: {
        th: 'ร่าง — มะม่วงส่วนใหญ่คัดตามน้ำหนัก การวัดความยาวเป็นค่าประมาณ ต้องยืนยันกับผู้รับซื้อก่อนใช้จริง',
        en: 'Draft — mango is normally graded by weight; length is a proxy. Confirm with the buyer before real use.',
      },
      rules: [
        { id: 'AA', label: { th: 'AA', en: 'AA' }, minDiameter: 130.0, color: GREEN },
        { id: 'A', label: { th: 'A', en: 'A' }, minDiameter: 115.0, color: LIME },
        { id: 'B', label: { th: 'B', en: 'B' }, minDiameter: 100.0, color: AMBER },
        { id: 'C', label: { th: 'C', en: 'C' }, minDiameter: 0, color: STONE },
      ],
    },
  },
]

export const FRUIT_BY_ID = new Map(FRUITS.map((f) => [f.id, f]))

export const ENABLED_FRUITS = FRUITS.filter((f) => f.enabled)

export function getFruit(id: string): FruitProfile {
  return FRUIT_BY_ID.get(id) ?? FRUITS[0]
}
