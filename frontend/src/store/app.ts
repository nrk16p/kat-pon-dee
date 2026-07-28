import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Locale, MatVariantId, MeasurementResult } from '@/domain/types'

interface AppState {
  locale: Locale
  fruitId: string
  matId: MatVariantId
  seenLanding: boolean
  /** result being reviewed before it is saved — not persisted */
  draft: { result: MeasurementResult; image: Blob } | null

  setLocale: (l: Locale) => void
  setFruit: (id: string) => void
  setMat: (id: MatVariantId) => void
  setSeenLanding: (v: boolean) => void
  setDraft: (d: AppState['draft']) => void
}

export const useApp = create<AppState>()(
  persist(
    (set) => ({
      locale: 'th',
      fruitId: 'longan',
      matId: 'full',
      seenLanding: false,
      draft: null,

      setLocale: (locale) => set({ locale }),
      setFruit: (fruitId) => set({ fruitId }),
      setMat: (matId) => set({ matId }),
      setSeenLanding: (seenLanding) => set({ seenLanding }),
      setDraft: (draft) => set({ draft }),
    }),
    {
      name: 'kpd-prefs',
      partialize: (s) => ({
        locale: s.locale,
        fruitId: s.fruitId,
        matId: s.matId,
        seenLanding: s.seenLanding,
      }),
    },
  ),
)
