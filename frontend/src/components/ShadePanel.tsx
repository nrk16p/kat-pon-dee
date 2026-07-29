import { Section, useT } from './ui'
import {
  dominantShade,
  shadeSwatch,
  shadesFor,
  tallyShades,
} from '@/domain/shade'
import type { FruitProfile, MeasurementResult } from '@/domain/types'

/** Named skin shades for the lot, with the swatches to check them against. */
export default function ShadePanel({
  result,
  fruit,
}: {
  result: MeasurementResult
  fruit: FruitProfile
}) {
  const { t, tx } = useT()
  const tally = tallyShades(result, fruit)
  const dominant = dominantShade(result, fruit)
  if (!tally.length) return null

  return (
    <Section title={t('result.shade')}>
      <div className="card p-5">
        {dominant && (
          <div className="flex items-center gap-4">
            <span
              className="h-16 w-16 shrink-0 rounded-2xl ring-1 ring-black/10"
              style={{ background: shadeSwatch(dominant.band) }}
            />
            <div className="min-w-0">
              <p className="text-[12px] font-semibold tracking-[0.06em] text-muted uppercase">
                {t('result.shadeDominant')}
              </p>
              <p className="mt-0.5 text-[22px] font-bold">{tx(dominant.band.label)}</p>
              <p className="num text-[13px] text-muted">
                {t('result.shadeCount', { n: dominant.count })} ·{' '}
                {(dominant.share * 100).toFixed(0)}%
              </p>
            </div>
          </div>
        )}

        <div className="mt-5 border-t border-hair pt-4">
          <p className="text-[12px] font-semibold tracking-[0.06em] text-muted uppercase">
            {t('result.shadeScale')}
          </p>

          {/* the whole scale, so a farmer can see where the lot sits in it and
              not just the one band it happened to land in */}
          <div className="mt-3 flex h-3 overflow-hidden rounded-full">
            {shadesFor(fruit).map((b) => (
              <div
                key={b.id}
                className="flex-1"
                style={{ background: shadeSwatch(b) }}
              />
            ))}
          </div>

          <ul className="mt-4 space-y-2.5">
            {tally.map(({ band, count, share }) => (
              <li key={band.id} className="flex items-center gap-3">
                <span
                  className="h-6 w-6 shrink-0 rounded-lg ring-1 ring-black/10"
                  style={{ background: shadeSwatch(band) }}
                />
                <span className="flex-1 text-[14px] font-medium">
                  {tx(band.label)}
                </span>
                <span className="num text-[14px] font-semibold">{count}</span>
                <span className="num w-12 text-right text-[13px] text-muted">
                  {count ? `${(share * 100).toFixed(0)}%` : '—'}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <p className="mt-4 border-t border-hair pt-3 text-[12px] leading-relaxed text-muted">
          {result.colorCalibrated
            ? t('result.shadeProvisional')
            : t('result.shadeUncal')}
        </p>
      </div>
    </Section>
  )
}
