import { useEffect, useState } from 'react'
import { CheckCircle2, Loader2, XCircle } from 'lucide-react'
import { clsx } from 'clsx'
import { Button, Notice, useT } from './ui'
import { MATS } from '@/domain/mats'
import {
  BUILD_DEFAULT,
  checkHealth,
  getApiUrl,
  isOverridden,
  setApiUrl,
  type HealthReport,
} from '@/lib/endpoint'

/** Lets a changing tunnel URL be fixed in the field instead of via a redeploy. */
export default function ServerSetting() {
  const { t } = useT()
  const [value, setValue] = useState(getApiUrl())
  const [busy, setBusy] = useState(false)
  const [report, setReport] = useState<HealthReport | null>(null)

  useEffect(() => {
    if (getApiUrl()) void test(getApiUrl())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function test(url: string) {
    setBusy(true)
    setReport(await checkHealth(url))
    setBusy(false)
  }

  async function save() {
    const url = setApiUrl(value)
    setValue(url)
    await test(url)
  }

  // a server whose sheet geometry differs from ours would measure against
  // numbers that are not on the table
  const mismatch =
    report?.mats &&
    Object.entries(report.mats).some(
      ([k, v]) => MATS[k as keyof typeof MATS] &&
        Math.abs(MATS[k as keyof typeof MATS].baseline - v.baseline) > 0.01,
    )

  return (
    <div className="card p-5">
      <label className="block text-[12px] font-semibold tracking-[0.06em] text-muted uppercase">
        {t('settings.serverUrl')}
      </label>
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        inputMode="url"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        placeholder="https://xxx.trycloudflare.com"
        className="num mt-2 w-full rounded-xl border border-hair bg-panel px-3 py-3 text-[14px] outline-none focus:border-accent"
      />
      <p className="mt-2 text-[12px] leading-relaxed text-muted">
        {t('settings.serverHint')}
      </p>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <Button onClick={save} disabled={busy}>
          {t('settings.serverSave')}
        </Button>
        <Button variant="ghost" onClick={() => void test(value)} disabled={busy || !value}>
          {busy ? <Loader2 size={17} className="animate-spin" /> : null}
          {busy ? t('settings.serverTesting') : t('settings.serverTest')}
        </Button>
      </div>

      {isOverridden() && BUILD_DEFAULT && (
        <button
          onClick={() => {
            setApiUrl('')
            setValue(BUILD_DEFAULT)
            void test(BUILD_DEFAULT)
          }}
          className="press mt-3 w-full py-2 text-[13px] font-semibold text-accent"
        >
          {t('settings.serverReset')}
        </button>
      )}

      {report && (
        <div
          className={clsx(
            'mt-4 flex items-start gap-2 rounded-xl px-3 py-2.5 text-[13px]',
            report.ok ? 'bg-accent-soft text-accent-ink' : 'bg-danger/10 text-danger',
          )}
        >
          {report.ok ? (
            <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
          ) : (
            <XCircle size={16} className="mt-0.5 shrink-0" />
          )}
          <span className="min-w-0">
            {report.ok
              ? t('settings.serverOk', { detail: report.detail })
              : t('settings.serverFail', { detail: report.detail })}
          </span>
        </div>
      )}

      {mismatch && (
        <div className="mt-3">
          <Notice tone="warn">{t('settings.serverMatMismatch')}</Notice>
        </div>
      )}

      {!value && (
        <div className="mt-3">
          <Notice tone="warn">{t('settings.serverEmpty')}</Notice>
        </div>
      )}
    </div>
  )
}
