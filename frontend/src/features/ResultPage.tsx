import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, Check, ChevronLeft, Save } from 'lucide-react'
import { Button, GradeBadge, Notice, Section, Stat, useT } from '@/components/ui'
import { GradeBadge as Badge } from '@/components/ui'
import { getFruit } from '@/domain/fruits'
import { MATS } from '@/domain/mats'
import { ruleById } from '@/domain/grade'
import { labToCss, skinFlag, summariseSkin } from '@/domain/skin'
import DetectionOverlay from '@/components/DetectionOverlay'
import ShadePanel from '@/components/ShadePanel'
import { fruitShade } from '@/domain/shade'
import { useApp } from '@/store/app'
import { addCapture } from '@/lib/db'

export default function ResultPage() {
  const { t, tx } = useT()
  const nav = useNavigate()
  const { draft, setDraft } = useApp()
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (!draft) nav('/capture', { replace: true })
  }, [draft, nav])
  if (!draft) return null

  const { result, image } = draft
  const fruit = getFruit(result.fruitId)
  const mat = MATS[result.matId]
  const occluded = result.counted - result.measured
  // mango is elongated: the service reports a major axis, and calling that a
  // "diameter" in the UI would be a lie the farmer cannot see through
  const skin = summariseSkin(result)
  const sizeLabel = fruit.metric === 'length' ? t('result.meanLength') : t('result.meanDiameter')

  async function save() {
    await addCapture({
      uuid: crypto.randomUUID(),
      createdAt: Date.now(),
      fruitId: result.fruitId,
      matId: result.matId,
      blob: image,
      status: 'queued',
      result,
    })
    setSaved(true)
    setTimeout(() => {
      setDraft(null)
      nav('/history')
    }, 550)
  }

  return (
    <div className="px-5 pt-4 pb-8">
      <button
        onClick={() => {
          setDraft(null)
          nav('/capture')
        }}
        className="press -ml-2 mb-2 flex items-center gap-1 p-2 text-[14px] font-medium text-muted"
      >
        <ChevronLeft size={18} /> {t('common.back')}
      </button>

      <h1 className="text-[26px] font-bold tracking-tight">{t('result.title')}</h1>
      <p className="num mt-1 text-[13px] text-muted">
        {tx(fruit.name)} · {mat.sheet} · {result.markersFound}/4 {t('result.markers')}
      </p>

      {!result.heightCorrected && (
        <div className="mt-4">
          <Notice tone="warn">
            <span className="flex gap-2">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              {t('result.notHeightCorrected')}
            </span>
          </Notice>
        </div>
      )}

      {result.counted === 0 ? (
        <div className="mt-6">
          <Notice tone="warn">{t('result.noFruit')}</Notice>
        </div>
      ) : (
        <>
          <Section title={t('result.overlay')}>
            <DetectionOverlay image={image} result={result} fruit={fruit} />
            <p className="mt-2 px-1 text-[12px] leading-relaxed text-muted">
              {t('result.overlayHint')}
            </p>
          </Section>

          <div className="card mt-5 grid grid-cols-2 gap-x-4 gap-y-6 p-5">
            <Stat label={t('result.counted')} value={result.counted} unit={t('common.fruitUnit')} />
            <Stat
              label={sizeLabel}
              value={result.meanDiameter.toFixed(1)}
              unit={t('common.mm')}
              tone="accent"
            />
            <Stat label={t('result.measured')} value={result.measured} unit={t('common.fruitUnit')} />
            <Stat
              label={t('result.range')}
              value={`${result.minDiameter.toFixed(1)}–${result.maxDiameter.toFixed(1)}`}
              unit={t('common.mm')}
            />
          </div>

          {occluded > 0 && (
            <p className="mt-3 px-1 text-[13px] leading-relaxed text-muted">
              {t('result.occludedNote')}
            </p>
          )}

          <Section title={t('result.distribution')}>
            <div className="card p-5">
              <div className="flex h-3 overflow-hidden rounded-full bg-panel">
                {result.tally
                  .filter((g) => g.count > 0)
                  .map((g) => {
                    const rule = ruleById(fruit, g.gradeId)!
                    return (
                      <div
                        key={g.gradeId}
                        style={{ width: `${g.share * 100}%`, backgroundColor: rule.color }}
                      />
                    )
                  })}
              </div>
              <ul className="mt-4 space-y-3">
                {result.tally.map((g) => {
                  const rule = ruleById(fruit, g.gradeId)!
                  return (
                    <li key={g.gradeId} className="flex items-center gap-3">
                      <Badge label={tx(rule.label)} color={rule.color} />
                      <span className="num flex-1 text-[13px] text-muted">
                        ≥ {rule.minDiameter.toFixed(1)} {t('common.mm')}
                      </span>
                      <span className="num text-[15px] font-semibold">{g.count}</span>
                      <span className="num w-12 text-right text-[13px] text-muted">
                        {(g.share * 100).toFixed(0)}%
                      </span>
                    </li>
                  )
                })}
              </ul>
              <p className="mt-4 border-t border-hair pt-3 text-[12px] leading-relaxed text-muted">
                {tx(fruit.grading.source)}
              </p>
            </div>
          </Section>

          <ShadePanel result={result} fruit={fruit} />

          {skin && (
            <Section title={t('result.skin')}>
              <div className="card p-5">
                <div className="flex items-center gap-4">
                  <span
                    className="h-14 w-14 shrink-0 rounded-full ring-1 ring-black/10"
                    style={{
                      background: labToCss(
                        skin.medianL,
                        result.fruits.find((f) => f.color)?.color?.a ?? 0,
                        result.fruits.find((f) => f.color)?.color?.b ?? 0,
                      ),
                    }}
                  />
                  <div className="grid min-w-0 flex-1 grid-cols-2 gap-x-4 gap-y-3">
                    <Stat label={t('result.skinTone')} value={skin.medianL.toFixed(1)} />
                    <Stat
                      label={t('result.skinUniformity')}
                      value={skin.medianUniformity.toFixed(2)}
                    />
                  </div>
                </div>

                <ul className="mt-4 space-y-2 border-t border-hair pt-4 text-[14px]">
                  <li className="flex justify-between">
                    <span className="text-muted">{t('result.skinDarker')}</span>
                    <span className="num font-semibold">{skin.darker}</span>
                  </li>
                  <li className="flex justify-between">
                    <span className="text-muted">{t('result.skinLighter')}</span>
                    <span className="num font-semibold">{skin.lighter}</span>
                  </li>
                  <li className="flex justify-between">
                    <span className="text-muted">{t('result.skinMottled')}</span>
                    <span className="num font-semibold">{skin.mottled}</span>
                  </li>
                </ul>

                <p className="mt-4 border-t border-hair pt-3 text-[12px] leading-relaxed text-muted">
                  {skin.calibrated ? t('result.skinRelative') : t('result.skinUncal')}
                </p>
              </div>
            </Section>
          )}

          <Section title={t('result.fruitList')}>
            <ul className="card divide-y divide-hair overflow-hidden">
              {result.fruits.slice(0, 40).map((f) => {
                const rule = ruleById(fruit, f.grade)
                const flag = skin
                  ? skinFlag(f, skin.medianL, skin.medianUniformity)
                  : null
                return (
                  <li key={f.i} className="flex items-center gap-3 px-4 py-2.5">
                    <span className="num w-7 text-[12px] text-muted">{f.i + 1}</span>
                    {f.color && (
                      <span
                        className="h-5 w-5 shrink-0 rounded-full ring-1 ring-black/10"
                        style={{ background: labToCss(f.color.L, f.color.a, f.color.b) }}
                        title={tx(fruitShade(f, fruit)?.label ?? { th: '', en: '' })}
                      />
                    )}
                    <span className="num flex-1 text-[15px] font-medium">
                      {f.occluded ? '—' : `${f.d.toFixed(1)} ${t('common.mm')}`}
                    </span>
                    {flag && (
                      <span className="shrink-0 rounded-full bg-warn/12 px-2 py-0.5 text-[10px] font-semibold text-warn">
                        {t(
                          flag === 'mottled'
                            ? 'result.skinMottled'
                            : flag === 'darker'
                              ? 'result.skinDarker'
                              : 'result.skinLighter',
                        )}
                      </span>
                    )}
                    {f.occluded ? (
                      <span className="rounded-full bg-panel px-2.5 py-0.5 text-[11px] font-semibold text-muted">
                        {t('result.occluded')}
                      </span>
                    ) : (
                      rule && <GradeBadge label={tx(rule.label)} color={rule.color} size="sm" />
                    )}
                  </li>
                )
              })}
            </ul>
          </Section>

          <Section title={t('result.processing')}>
            <div className="card num grid grid-cols-2 gap-y-3 p-4 text-[13px]">
              <span className="text-muted">{t('result.processing')}</span>
              <span className="text-right">{(result.processingMs / 1000).toFixed(1)} {t('common.sec')}</span>
              <span className="text-muted">{t('result.scale')}</span>
              <span className="text-right">{result.scale.toFixed(4)} mm/px</span>
              <span className="text-muted">{t('result.cameraHeight')}</span>
              <span className="text-right">
                {result.cameraHeight ? `${result.cameraHeight} ${t('common.mm')}` : '—'}
              </span>
              <span className="text-muted">{t('result.stdev')}</span>
              <span className="text-right">± {result.stdDiameter.toFixed(2)} {t('common.mm')}</span>
            </div>
          </Section>
        </>
      )}

      <div className="mt-7">
        <Button onClick={save} disabled={saved}>
          {saved ? <Check size={19} /> : <Save size={19} />}
          {saved ? t('result.saved') : t('result.save')}
        </Button>
      </div>
    </div>
  )
}
