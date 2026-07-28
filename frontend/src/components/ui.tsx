import { clsx } from 'clsx'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { I18nText, Locale } from '@/domain/types'

export function useT() {
  const { t, i18n } = useTranslation()
  const locale = (i18n.language as Locale) === 'en' ? 'en' : 'th'
  const tx = (v: I18nText) => v[locale]
  return { t, tx, locale, i18n }
}

/* ------------------------------------------------------------ primitives -- */

export function Button({
  children,
  onClick,
  variant = 'primary',
  disabled,
  className,
  type = 'button',
}: {
  children: ReactNode
  onClick?: () => void
  variant?: 'primary' | 'ghost' | 'danger'
  disabled?: boolean
  className?: string
  type?: 'button' | 'submit'
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={clsx(
        'press inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl px-5 text-[17px] font-semibold disabled:opacity-45',
        variant === 'primary' && 'bg-accent text-white shadow-sm',
        variant === 'ghost' && 'bg-panel text-ink',
        variant === 'danger' && 'bg-danger/10 text-danger',
        className,
      )}
    >
      {children}
    </button>
  )
}

export function Stat({
  label,
  value,
  unit,
  tone = 'ink',
}: {
  label: string
  value: string | number
  unit?: string
  tone?: 'ink' | 'accent' | 'muted'
}) {
  return (
    <div>
      <div className="text-[12px] font-semibold tracking-[0.06em] text-muted uppercase">
        {label}
      </div>
      <div className="mt-1 flex items-baseline gap-1">
        <span
          className={clsx(
            'num text-[30px] leading-none font-semibold',
            tone === 'accent' && 'text-accent',
            tone === 'muted' && 'text-muted',
          )}
        >
          {value}
        </span>
        {unit && <span className="num text-[13px] text-muted">{unit}</span>}
      </div>
    </div>
  )
}

export function Section({
  title,
  action,
  children,
}: {
  title: string
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="mt-6">
      <div className="mb-3 flex items-center justify-between px-1">
        <h2 className="text-[13px] font-semibold tracking-[0.1em] text-muted uppercase">
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  )
}

export function Notice({
  tone = 'info',
  children,
}: {
  tone?: 'info' | 'warn'
  children: ReactNode
}) {
  return (
    <div
      className={clsx(
        'rounded-2xl px-4 py-3 text-[14px] leading-relaxed',
        tone === 'info' && 'bg-accent-soft text-accent-ink',
        tone === 'warn' && 'bg-warn/10 text-warn',
      )}
    >
      {children}
    </div>
  )
}

/** Grade pill. Colour comes from the scheme, so a buyer-specific scheme keeps
 *  its own palette without touching this component. */
export function GradeBadge({
  label,
  color,
  size = 'md',
}: {
  label: string
  color: string
  size?: 'sm' | 'md'
}) {
  return (
    <span
      className={clsx(
        'num inline-flex items-center justify-center rounded-full font-bold text-white',
        size === 'md' ? 'min-w-9 px-2.5 py-1 text-[14px]' : 'min-w-7 px-2 py-0.5 text-[12px]',
      )}
      style={{ backgroundColor: color }}
    >
      {label}
    </span>
  )
}
