import { AlertTriangle, Download } from 'lucide-react'
import { clsx } from 'clsx'
import { GradeBadge, Notice, Section, useT } from '@/components/ui'
import { ENABLED_FRUITS, getFruit } from '@/domain/fruits'
import { MAT_LIST } from '@/domain/mats'
import ServerSetting from '@/components/ServerSetting'
import { useApp } from '@/store/app'
import type { Locale } from '@/domain/types'

const APP_VERSION = '0.1.0'

export default function SettingsPage() {
  const { t, tx, i18n } = useT()
  const { locale, fruitId, matId, setLocale, setFruit, setMat } = useApp()
  const fruit = getFruit(fruitId)

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

      <Section title={t('settings.server')}>
        <ServerSetting />
      </Section>

      <Section title={t('settings.defaultFruit')}>
        <div className="card divide-y divide-hair overflow-hidden">
          {ENABLED_FRUITS.map((f) => (
            <button
              key={f.id}
              onClick={() => setFruit(f.id)}
              className="press flex w-full items-center gap-3 px-4 py-3.5 text-left"
            >
              <span className="text-[18px]">{f.emoji}</span>
              <span className="flex-1">
                <span className="block text-[15px] font-semibold">{tx(f.name)}</span>
                <span className="block text-[12px] text-muted italic">{f.scientific}</span>
              </span>
              <span
                className={clsx(
                  'grid h-6 w-6 place-items-center rounded-full border-2',
                  f.id === fruitId ? 'border-accent bg-accent' : 'border-hair',
                )}
              >
                {f.id === fruitId && <span className="h-2 w-2 rounded-full bg-white" />}
              </span>
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
            <span>{APP_VERSION}</span>
          </div>
        </div>
      </Section>
    </div>
  )
}
