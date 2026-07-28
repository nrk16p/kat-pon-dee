import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { Camera, ChevronRight, UserRound } from 'lucide-react'
import { Section, Stat, useT } from '@/components/ui'
import { db } from '@/lib/db'
import { getFruit } from '@/domain/fruits'
import { MATS } from '@/domain/mats'
import { initials, hasProfile, useProfile } from '@/domain/profile'
import { useApp } from '@/store/app'

export default function HomePage() {
  const { t, tx, locale } = useT()
  const nav = useNavigate()
  const { fruitId, matId } = useApp()
  const profile = useProfile()
  const fruit = getFruit(fruitId)
  const mat = MATS[matId]

  const items = useLiveQuery(
    () => db.captures.orderBy('createdAt').reverse().limit(5).toArray(),
    [],
  )
  const all = useLiveQuery(() => db.captures.toArray(), [])

  const sessions = all?.length ?? 0
  const totalFruit = all?.reduce((n, c) => n + (c.result?.counted ?? 0), 0) ?? 0
  const lastMean = items?.[0]?.result?.meanDiameter

  const fmt = new Intl.DateTimeFormat(locale === 'th' ? 'th-TH' : 'en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })

  return (
    <div className="px-5 pt-5 pb-8">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[13px] font-semibold tracking-[0.1em] text-accent uppercase">
            {t('app.name')}
          </p>
          <h1 className="mt-1 truncate text-[26px] font-bold tracking-tight">
            {profile.name || profile.orchard || t('home.title')}
          </h1>
        </div>
        <button
          onClick={() => nav('/profile')}
          aria-label={t('profile.title')}
          className="press grid h-12 w-12 shrink-0 place-items-center rounded-full bg-accent-soft text-[15px] font-bold text-accent-ink"
        >
          {hasProfile(profile) ? initials(profile) : <UserRound size={22} />}
        </button>
      </div>

      {!profile.onboarded && (
        <button
          onClick={() => nav('/profile')}
          className="press card mt-4 flex w-full items-center gap-3 p-4 text-left"
        >
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-accent-soft text-accent-ink">
            <UserRound size={20} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-semibold">
              {t('profile.setupTitle')}
            </span>
            <span className="block text-[12px] leading-snug text-muted">
              {t('profile.setupBody')}
            </span>
          </span>
          <ChevronRight size={20} className="shrink-0 text-muted" />
        </button>
      )}

      <button
        onClick={() => nav('/capture')}
        className="press mt-5 flex w-full items-center gap-4 rounded-[22px] bg-accent p-5 text-left text-white shadow-md"
      >
        <span className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-white/18">
          <Camera size={26} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[19px] font-bold">{t('home.newMeasure')}</span>
          <span className="block text-[13px] text-white/80">
            {tx(fruit.name)} · {mat.sheet}
          </span>
        </span>
        <ChevronRight size={22} className="shrink-0 opacity-80" />
      </button>

      <div className="card mt-4 grid grid-cols-3 gap-3 p-5">
        <Stat label={t('home.sessions')} value={sessions} />
        <Stat label={t('home.totalFruit')} value={totalFruit} />
        <Stat
          label={t('home.lastMean')}
          value={lastMean ? lastMean.toFixed(1) : '—'}
          unit={lastMean ? t('common.mm') : undefined}
          tone="accent"
        />
      </div>

      <Section
        title={t('home.recent')}
        action={
          <button
            onClick={() => nav('/history')}
            className="text-[13px] font-semibold text-accent"
          >
            {t('home.seeAll')}
          </button>
        }
      >
        {items && items.length > 0 ? (
          <ul className="card divide-y divide-hair overflow-hidden">
            {items.map((c) => {
              const f = getFruit(c.fruitId)
              return (
                <li key={c.id} className="flex items-center gap-3 px-4 py-3">
                  <span
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-[16px]"
                    style={{ backgroundColor: `${f.color}1F` }}
                  >
                    {f.emoji}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-semibold">
                      {tx(f.name)}
                    </span>
                    <span className="num block truncate text-[11px] text-muted">
                      {fmt.format(c.createdAt)}
                    </span>
                  </span>
                  <span className="num shrink-0 text-[14px] font-semibold text-accent">
                    {c.result ? `${c.result.meanDiameter.toFixed(1)} mm` : '—'}
                  </span>
                </li>
              )
            })}
          </ul>
        ) : (
          <div className="card p-6 text-center">
            <p className="text-[15px] font-semibold">{t('history.empty')}</p>
            <p className="mt-1 text-[13px] text-muted">{t('history.emptyHint')}</p>
          </div>
        )}
      </Section>

    </div>
  )
}
