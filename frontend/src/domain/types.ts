/** Core domain types. The platform is fruit-agnostic: everything specific to a
 *  crop lives in a FruitProfile, everything specific to a printed sheet lives in
 *  a MatVariant. Adding a fruit is a data change, not a code change. */

export type Locale = 'th' | 'en'

export interface I18nText {
  th: string
  en: string
}

/* ------------------------------------------------------------------ mats -- */

export type MatVariantId = 'full' | 'a3' | 'a4'

/** Mirrors tools/gen_mat.py in the measurement project. These numbers are the
 *  contract with the printed sheet — if they drift, every measurement is wrong. */
export interface MatVariant {
  id: MatVariantId
  label: I18nText
  sheet: string
  /** mat side, mm */
  mat: number
  /** ArUco side incl. border, mm */
  marker: number
  /** marker-centre spacing, mm — the scale reference */
  baseline: number
  /** measurement area side, mm */
  area: number
  /** print-ready PDF, served by the app itself — no external host, and cached
   *  by the service worker so it downloads with no signal */
  pdf: string
}

/* ---------------------------------------------------------------- grading -- */

/** One grade band. Rules are evaluated in order, first match wins, so they must
 *  be sorted from largest minDiameter down. `minDiameter` is inclusive. */
export interface GradeRule {
  id: string
  label: I18nText
  /** mm, inclusive lower bound */
  minDiameter: number
  color: string
}

export interface GradeScheme {
  id: string
  label: I18nText
  /** where the thresholds came from — shown in the UI, because a grade the
   *  farmer cannot trace is a grade they cannot argue with a buyer */
  source: I18nText
  rules: GradeRule[]
}

/* ----------------------------------------------------------------- fruits -- */

/** What the vision service actually reports for this crop. Round fruit get a
 *  true diameter; elongated fruit get the major axis, which must never be
 *  labelled "diameter" in the UI. */
export type SizeMetric = 'diameter' | 'length'

/** Where a crop is in its rollout. `development` still appears in the picker so
 *  growers can see what is coming, but cannot be selected — the pipeline has not
 *  been validated for it, and a number it cannot stand behind is worse than none. */
export type FruitStatus = 'available' | 'development'

export interface FruitProfile {
  id: string
  name: I18nText
  scientific: string
  emoji: string
  color: string
  metric: SizeMetric
  /** plausible size window, mm — used to reject nonsense detections */
  size: { min: number; max: number; typical: number }
  /** which printed sheet suits this fruit's size */
  recommendedMat: MatVariantId
  grading: GradeScheme
  status: FruitStatus
}

/* ----------------------------------------------------------- measurement -- */

/** Skin colour in CIE L*a*b*, corrected against the mat's printed strip. */
export interface FruitColor {
  L: number
  a: number
  b: number
  chroma: number
  hue: number
  /** spread of L* across the skin — blemishes and spotting raise it */
  uniformity: number
}

export interface FruitMeasurement {
  /** index within the capture */
  i: number
  /** centre in mat millimetres */
  x: number
  y: number
  /** diameter, mm */
  d: number
  /** 0..1 — segmentation confidence */
  confidence: number
  /** true when the outline is clipped by a neighbour, so d under-reads */
  occluded: boolean
  /** resolved grade id, null when not measurable */
  grade: string | null
  color?: FruitColor | null
}

export interface GradeTally {
  gradeId: string
  count: number
  share: number
}

export interface MeasurementResult {
  fruitId: string
  matId: MatVariantId
  /** every fruit the model found */
  counted: number
  /** subset actually measured — occluded fruit are counted, not measured */
  measured: number
  meanDiameter: number
  minDiameter: number
  maxDiameter: number
  stdDiameter: number
  /** mm/px derived from the marker baseline */
  scale: number
  /** camera height above the mat, mm — from solvePnP. Needed for the sphere
   *  height correction; null means the correction could not be applied. */
  cameraHeight: number | null
  heightCorrected: boolean
  markersFound: number
  processingMs: number
  fruits: FruitMeasurement[]
  tally: GradeTally[]

  /** colour is only comparable across photos when the strip was read */
  colorCalibrated?: boolean
  colorNote?: string | null
  meanL?: number | null
  meanChroma?: number | null
  meanUniformity?: number | null

  /** 3x3 row-major, mat mm -> pixels in the uploaded photo. Lets the client
   *  draw detections back onto the farmer's own image. */
  homography?: number[] | null
  sharpness?: number | null
  intrinsicsSource?: string | null
  reprojectionErrorPx?: number | null
  warnings?: string[]
}

export type CaptureStatus = 'queued' | 'uploading' | 'done' | 'failed'

export interface Capture {
  id?: number
  uuid: string
  createdAt: number
  fruitId: string
  matId: MatVariantId
  /** original JPEG, kept for retraining */
  blob: Blob
  thumb?: Blob
  status: CaptureStatus
  error?: string
  result?: MeasurementResult
  note?: string
}
