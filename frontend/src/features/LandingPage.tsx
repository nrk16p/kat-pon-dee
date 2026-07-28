import { useNavigate } from 'react-router-dom'
import { ArrowRight, Ruler, ScanLine, Tags } from 'lucide-react'
import { clsx } from 'clsx'
import { Button, useT } from '@/components/ui'
import { useApp } from '@/store/app'
import type { Locale } from '@/domain/types'

const POINTS = [
  { icon: ScanLine, key: 'landing.p1' },
  { icon: Ruler, key: 'landing.p2' },
  { icon: Tags, key: 'landing.p3' },
]

export default function LandingPage() {
  const { t, i18n } = useT()
  const nav = useNavigate()
  const { locale, setLocale, setSeenLanding } = useApp()

  function changeLocale(l: Locale) {
    setLocale(l)
    localStorage.setItem('locale', l)
    void i18n.changeLanguage(l)
  }

  function start() {
    setSeenLanding(true)
    nav('/home', { replace: true })
  }

  return (
    <div
      className="flex h-full flex-col overflow-x-hidden bg-accent text-white"
      style={{
        paddingTop: 'var(--safe-top)',
        paddingBottom: 'calc(var(--safe-bottom) + 24px)',
      }}
    >
      <div className="flex justify-end px-5 pt-3">
        <div className="flex rounded-full bg-white/15 p-0.5">
          {(['th', 'en'] as const).map((l) => (
            <button
              key={l}
              onClick={() => changeLocale(l)}
              className={clsx(
                'press rounded-full px-3.5 py-1.5 text-[13px] font-semibold',
                locale === l ? 'bg-white text-accent' : 'text-white/80',
              )}
            >
              {l === 'th' ? 'ไทย' : 'EN'}
            </button>
          ))}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col justify-center px-7">
        <img
          src="/icons/icon-512.png"
          alt=""
          className="h-24 w-24 rounded-[26px] shadow-lg"
        />
        <h1 className="mt-7 text-[38px] leading-tight font-bold tracking-tight">
          {t('app.name')}
        </h1>
        <p className="mt-2 text-[17px] leading-relaxed text-white/85">
          {t('app.tagline')}
        </p>
        <p className="mt-5 text-[15px] leading-relaxed text-white/75">
          {t('landing.lede')}
        </p>

        <ul className="mt-8 space-y-4">
          {POINTS.map(({ icon: Icon, key }) => (
            <li key={key} className="flex items-start gap-3.5">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/15">
                <Icon size={19} strokeWidth={2} />
              </span>
              <span className="pt-2 text-[15px] leading-snug text-white/90">
                {t(key)}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div className="px-7 pt-6">
        <Button onClick={start} className="bg-white !text-accent">
          {t('landing.cta')} <ArrowRight size={19} />
        </Button>
        <p className="mt-4 text-center text-[12px] leading-relaxed text-white/65">
          {t('landing.footnote')}
        </p>
      </div>
    </div>
  )
}
