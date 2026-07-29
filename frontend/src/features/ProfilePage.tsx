import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { Check, ChevronLeft, HardDrive, MessageCircle, ShieldCheck, Trash2 } from 'lucide-react'
import { Button, Notice, Section, Stat, useT } from '@/components/ui'
import ConfirmDialog from '@/components/ConfirmDialog'
import {
  PROVINCES,
  initials,
  isRegistered,
  useProfile,
  validPhone,
} from '@/domain/profile'
import { db } from '@/lib/db'
import {
  isInLineApp,
  isLineLoggedIn,
  liffConfigured,
  lineLogin,
} from '@/lib/liff'
import {
  formatBytes,
  getStorageInfo,
  requestPersistence,
  type StorageInfo,
} from '@/lib/storage'

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  type?: string
}) {
  return (
    <label className="block">
      <span className="text-[12px] font-semibold tracking-[0.06em] text-muted uppercase">
        {label}
      </span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        className="mt-1.5 w-full rounded-xl border border-hair bg-panel px-3.5 py-3.5 text-[16px] outline-none focus:border-accent"
      />
    </label>
  )
}

export default function ProfilePage() {
  const { t } = useT()
  const nav = useNavigate()
  const p = useProfile()

  const [draft, setDraft] = useState({
    name: p.name,
    orchard: p.orchard,
    province: p.province,
    phone: p.phone,
  })
  const [consent, setConsent] = useState(p.consent)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)
  const [storage, setStorage] = useState<StorageInfo | null>(null)

  const captures = useLiveQuery(() => db.captures.toArray(), [])
  const sessions = captures?.length ?? 0
  const totalFruit = captures?.reduce((n, c) => n + (c.result?.counted ?? 0), 0) ?? 0

  useEffect(() => {
    void getStorageInfo().then(setStorage)
  }, [])

  const registered = isRegistered(p)
  const linked = !!p.lineUserId
  // Only offer the LINE button where it can actually help: configured, and
  // either already signed in or in a browser where the redirect can complete.
  const canOfferLine = liffConfigured() && !linked && !isInLineApp() && !isLineLoggedIn()

  function save() {
    if (!consent) return setError(t('profile.mustConsent'))
    if (!draft.name.trim() || !draft.province) return setError(t('profile.mustFill'))
    // signed in with LINE, the userId is the identity — a phone is a bonus
    if (!linked && !validPhone(draft.phone)) return setError(t('profile.phoneInvalid'))
    if (linked && draft.phone && !validPhone(draft.phone))
      return setError(t('profile.phoneInvalid'))
    setError(null)
    p.set({
      ...draft,
      onboarded: true,
      consent: true,
      consentAt: p.consentAt ?? Date.now(),
    })
    setSaved(true)
    setTimeout(() => {
      setSaved(false)
      if (!registered) nav('/home')
    }, 900)
  }

  async function protect() {
    await requestPersistence()
    setStorage(await getStorageInfo())
  }

  return (
    <div className="px-5 pt-4 pb-8">
      {isRegistered(p) && (
        <button
          onClick={() => nav('/home')}
          className="press -ml-2 mb-2 flex items-center gap-1 p-2 text-[14px] font-medium text-muted"
        >
          <ChevronLeft size={18} /> {t('common.back')}
        </button>
      )}

      <div className="flex items-center gap-4">
        {p.linePicture ? (
          <img
            src={p.linePicture}
            alt=""
            className="h-16 w-16 shrink-0 rounded-full object-cover"
          />
        ) : (
          <span className="grid h-16 w-16 shrink-0 place-items-center rounded-full bg-accent-soft text-[22px] font-bold text-accent-ink">
            {initials(draft)}
          </span>
        )}
        <div className="min-w-0">
          <h1 className="truncate text-[24px] font-bold tracking-tight">
            {draft.name || draft.orchard || t('profile.title')}
          </h1>
          <p className="text-[13px] text-muted">
            {isRegistered(p) ? t('profile.subtitle') : t('profile.registerBody')}
          </p>
        </div>
      </div>

      {linked && (
        <div className="mt-5 flex items-center gap-2.5 rounded-2xl bg-accent-soft px-4 py-3 text-[14px] font-semibold text-accent-ink">
          <MessageCircle size={17} className="shrink-0" />
          {t('profile.lineConnected')}
        </div>
      )}

      {canOfferLine && (
        <div className="mt-5">
          <button
            onClick={lineLogin}
            className="press flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-[#06C755] px-5 text-[16px] font-semibold text-white"
          >
            <MessageCircle size={19} /> {t('profile.lineLogin')}
          </button>
          <p className="mt-2 px-1 text-center text-[12px] text-muted">
            {t('profile.lineHint')}
          </p>
        </div>
      )}

      <div className="card mt-6 space-y-4 p-5">
        <Field
          label={`${t('profile.name')} *`}
          value={draft.name}
          placeholder={t('profile.namePh')}
          onChange={(v) => setDraft({ ...draft, name: v })}
        />
        <Field
          label={t('profile.orchard')}
          value={draft.orchard}
          placeholder={t('profile.orchardPh')}
          onChange={(v) => setDraft({ ...draft, orchard: v })}
        />
        <label className="block">
          <span className="text-[12px] font-semibold tracking-[0.06em] text-muted uppercase">
            {t('profile.province')} *
          </span>
          <select
            value={draft.province}
            onChange={(e) => setDraft({ ...draft, province: e.target.value })}
            className="mt-1.5 w-full appearance-none rounded-xl border border-hair bg-panel px-3.5 py-3.5 text-[16px] outline-none focus:border-accent"
          >
            <option value="">{t('profile.provincePick')}</option>
            {PROVINCES.map((pv) => (
              <option key={pv} value={pv}>
                {pv}
              </option>
            ))}
          </select>
        </label>
        <Field
          label={
            linked
              ? t('profile.phoneOptional')
              : `${t('profile.phone').replace(' (ไม่บังคับ)', '').replace(' (optional)', '')} *`
          }
          value={draft.phone}
          placeholder={t('profile.phonePh')}
          type="tel"
          onChange={(v) => setDraft({ ...draft, phone: v })}
        />

        <div className="rounded-2xl bg-panel p-4">
          <p className="text-[12px] font-semibold tracking-[0.06em] text-muted uppercase">
            {t('profile.consentTitle')}
          </p>
          <p className="mt-2 text-[13px] leading-relaxed">{t('profile.consentBody')}</p>
          <p className="mt-2 text-[12px] leading-relaxed text-muted">
            {t('profile.consentDetail')}{' '}
            <button
              onClick={() => nav('/privacy')}
              className="font-semibold text-accent underline"
            >
              {t('profile.privacyLink')}
            </button>
          </p>
          <label className="mt-3 flex items-start gap-3">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--color-accent)]"
            />
            <span className="text-[14px] font-semibold">{t('profile.consentAccept')}</span>
          </label>
        </div>

        {error && <Notice tone="warn">{error}</Notice>}

        <Button onClick={save}>
          {saved ? <Check size={19} /> : null}
          {saved ? t('profile.saved') : registered ? t('profile.save') : t('profile.registerCta')}
        </Button>
      </div>

      <Section title={t('profile.stats')}>
        <div className="card grid grid-cols-2 gap-4 p-5">
          <Stat label={t('home.sessions')} value={sessions} />
          <Stat label={t('home.totalFruit')} value={totalFruit} />
        </div>
      </Section>

      <Section title={t('profile.storage')}>
        <div className="card p-5">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-panel text-muted">
              <HardDrive size={19} />
            </span>
            <div className="num min-w-0 flex-1 text-[14px]">
              {storage?.supported
                ? t('profile.storageUsed', {
                    used: formatBytes(storage.usedBytes),
                    quota: formatBytes(storage.quotaBytes),
                  })
                : '—'}
            </div>
          </div>

          {storage?.supported && storage.quotaBytes > 0 && (
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-panel">
              <div
                className="h-full bg-accent"
                style={{
                  width: `${Math.min(100, (storage.usedBytes / storage.quotaBytes) * 100).toFixed(2)}%`,
                }}
              />
            </div>
          )}

          <div className="mt-4 border-t border-hair pt-4">
            {storage?.persisted ? (
              <p className="flex items-start gap-2 text-[13px] leading-relaxed text-accent-ink">
                <ShieldCheck size={16} className="mt-0.5 shrink-0" />
                {t('profile.storagePersisted')}
              </p>
            ) : (
              <>
                <Notice tone="warn">{t('profile.storageAtRisk')}</Notice>
                <div className="mt-3">
                  <Button variant="ghost" onClick={protect}>
                    <ShieldCheck size={18} /> {t('profile.storagePersist')}
                  </Button>
                </div>
              </>
            )}
            <p className="mt-3 text-[12px] leading-relaxed text-muted">
              {t('profile.storageTip')}
            </p>
          </div>
        </div>
      </Section>

      <button
        onClick={() => setConfirmClear(true)}
        className="press mt-6 flex w-full items-center justify-center gap-2 py-3 text-[15px] font-semibold text-danger"
      >
        <Trash2 size={17} /> {t('profile.clear')}
      </button>

      <ConfirmDialog
        open={confirmClear}
        title={t('profile.clearConfirm')}
        body={t('profile.clearBody')}
        confirmLabel={t('profile.clear')}
        onCancel={() => setConfirmClear(false)}
        onConfirm={() => {
          p.clear()
          setDraft({ name: '', orchard: '', province: '', phone: '' })
          setConfirmClear(false)
        }}
      />
    </div>
  )
}
