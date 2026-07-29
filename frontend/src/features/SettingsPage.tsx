import { useState } from 'react'
import { AlertTriangle, Download, FileDown } from 'lucide-react'
import { clsx } from 'clsx'
import { GradeBadge, Notice, Section, useT } from '@/components/ui'
import { LISTED_FRUITS, getFruit } from '@/domain/fruits'
import { MAT_LIST } from '@/domain/mats'
import ServerSetting from '@/components/ServerSetting'
import { useApp } from '@/store/app'
import type { Locale } from '@/domain/types'

const APP_VERSION = '0.1.0'

export default function SettingsPage() {
  const { t, tx, i18n } = useT()
  const { locale, fruitId, matId, setLocale, setFruit, setMat } = useApp()
  const fruit = getFruit(fruitId)

  // The measurement server lives behind a tunnel whose URL changes whenever the
  // machine restarts, so the field has to stay reachable — but it is a technical
  // detail a grower should never be shown. Hidden behind the long-standing
  // "tap the version number" gesture, and remembered once unlocked.
  const [taps, setTaps] = useState(0)
  const [dev, setDev] = useState(() => localStorage.getItem('kpd-dev') === '1')

  function tapVersion() {
    const n = taps + 1
    setTaps(n)
    if (n >= 7) {
      localStorage.setItem('kpd-dev', '1')
      setDev(true)
      setTaps(0)
    }
  }

  function changeLocale(l: Locale) {
    setLocale(l)
    localStorage.setItem('locale', l)
    void i18n.changeLanguage(l)
  }

  return (
    <div className="px-5 pt-5 pb-8">
      <h1 className="text-[26px] font-bold tracking-tight">{t('settings.title')}</h1>

      <Section title={t('settings.language')}>
        <div className="card grid grid-cols-2 gap-1 p-1">
          {(['th', 'en'] as const).map((l) => (
            <button
              key={l}
              onClick={() => changeLocale(l)}
              className={clsx(
                'press rounded-2xl py-3 text-[15px] font-semibold',
                locale === l ? 'bg-accent text-white' : 'text-muted',
              )}
            >
              {l === 'th' ? 'ไทย' : 'English'}
            </button>
          ))}
        </div>
      </Section>

      <Section title={t('settings.defaultFruit')}>
        <div className="card divide-y divide-hair overflow-hidden">
          {LISTED_FRUITS.map((f) => (
            <button
              key={f.id}
              disabled={f.status === 'development'}
              onClick={() => setFruit(f.id)}
              className={clsx(
                'flex w-full items-center gap-3 px-4 py-3.5 text-left',
                f.status === 'development' ? 'opacity-55' : 'press',
              )}
            >
              <span className="text-[18px]">{f.emoji}</span>
              <span className="flex-1">
                <span className="block text-[15px] font-semibold">{tx(f.name)}</span>
                <span className="block text-[12px] text-muted italic">{f.scientific}</span>
                {f.status === 'development' && (
                  <span className="mt-1 inline-block rounded-full bg-warn/12 px-2 py-0.5 text-[11px] font-semibold text-warn">
                    {t('capture.inDevelopment')}
                  </span>
                )}
              </span>
              {f.status !== 'development' && (
                <span
                  className={clsx(
                    'grid h-6 w-6 shrink-0 place-items-center rounded-full border-2',
                    f.id === fruitId ? 'border-accent bg-accent' : 'border-hair',
                  )}
                >
                  {f.id === fruitId && <span className="h-2 w-2 rounded-full bg-white" />}
                </span>
              )}
            </button>
          ))}
        </div>
      </Section>

      <Section title={t('settings.grading')}>
        <div className="card p-5">
          <p className="text-[15px] font-semibold">{tx(fruit.grading.label)}</p>
          <ul className="mt-4 space-y-3">
            {fruit.grading.rules.map((r) => (
              <li key={r.id} className="flex items-center gap-3">
                <GradeBadge label={tx(r.label)} color={r.color} />
                <span className="num flex-1 text-[14px]">
                  ≥ {r.minDiameter.toFixed(1)} {t('common.mm')}
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-4 border-t border-hair pt-4">
            <p className="text-[12px] font-semibold tracking-[0.06em] text-muted uppercase">
              {t('settings.gradingSource')}
            </p>
            <p className="mt-1 text-[13px] text-muted">{tx(fruit.grading.source)}</p>
          </div>
        </div>
        <div className="mt-3">
          <Notice tone="warn">
            <span className="flex gap-2">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              {t('settings.gradingWarning')}
            </span>
          </Notice>
        </div>
      </Section>

      <Section title={t('settings.defaultMat')}>
        <div className="card divide-y divide-hair overflow-hidden">
          {MAT_LIST.map((m) => (
            <button
              key={m.id}
              onClick={() => setMat(m.id)}
              className="press flex w-full items-center gap-3 px-4 py-3.5 text-left"
            >
              <span className="flex-1">
                <span className="block text-[15px] font-semibold">{tx(m.label)}</span>
                <span className="num block text-[12px] text-muted">
                  {m.sheet} · baseline {m.baseline.toFixed(1)} mm · area {m.area} mm
                </span>
                <a
                  href={m.pdf}
                  download
                  onClick={(e) => e.stopPropagation()}
                  className="press mt-1.5 inline-flex items-center gap-1.5 text-[13px] font-semibold text-accent"
                >
                  <FileDown size={15} /> {t('settings.matDownload')}
                </a>
              </span>
              <span
                className={clsx(
                  'grid h-6 w-6 place-items-center rounded-full border-2',
                  m.id === matId ? 'border-accent bg-accent' : 'border-hair',
                )}
              >
                {m.id === matId && <span className="h-2 w-2 rounded-full bg-white" />}
              </span>
            </button>
          ))}
        </div>
        <div className="mt-3">
          <Notice tone="warn">
            <span className="flex gap-2">
              <Download size={16} className="mt-0.5 shrink-0" />
              {t('settings.matPrintWarning')}
            </span>
          </Notice>
        </div>
      </Section>

      <Section title={t('settings.about')}>
        <div className="card num p-4 text-[13px]">
          <div className="flex justify-between">
            <span className="text-muted">{t('settings.version')}</span>
            <button onClick={tapVersion} className="select-none tabular-nums">
              {APP_VERSION}
            </button>
          </div>
        </div>
        {!dev && taps >= 4 && taps < 7 && (
          <p className="num mt-2 text-center text-[12px] text-muted">
            {7 - taps}
          </p>
        )}
      </Section>

      {dev && (
        <Section title={t('settings.devTitle')}>
          <p className="mb-3 px-1 text-[12px] leading-relaxed text-muted">
            {t('settings.devHint')}
          </p>
          <ServerSetting />
          <button
            onClick={() => {
              localStorage.removeItem('kpd-dev')
              setDev(false)
            }}
            className="press mt-3 w-full py-2 text-[13px] font-semibold text-muted"
          >
            {t('settings.devHide')}
          </button>
        </Section>
      )}
    </div>
  )
}
