import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, Loader2, MessageCircle } from 'lucide-react'
import { Button, Notice, useT } from '@/components/ui'
import {
  PROVINCES,
  isRegistered,
  useProfile,
  validPhone,
} from '@/domain/profile'
import { registerGrower } from '@/lib/api'
import { isInLineApp, isLineLoggedIn, liffConfigured, lineLogin } from '@/lib/liff'

/**
 * First run only. Does one thing: collect the minimum needed to attribute a
 * measurement, with consent, and register it.
 *
 * Kept separate from /profile because that page also holds stats, storage
 * controls and a delete button — none of which belong in front of someone who
 * just wants to start measuring, and all of which made the first screen look
 * like a settings panel rather than a sign-up.
 */
export default function RegisterPage() {
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
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const linked = !!p.lineUserId
  const canOfferLine =
    liffConfigured() && !linked && !isInLineApp() && !isLineLoggedIn()

  async function submit() {
    if (!consent) return setError(t('profile.mustConsent'))
    if (!draft.name.trim() || !draft.province) return setError(t('profile.mustFill'))
    if (!linked && !validPhone(draft.phone)) return setError(t('profile.phoneInvalid'))
    if (linked && draft.phone && !validPhone(draft.phone))
      return setError(t('profile.phoneInvalid'))

    setError(null)
    setBusy(true)
    const consentAt = p.consentAt ?? Date.now()
    try {
      const { growerId } = await registerGrower({
        name: draft.name,
        phone: draft.phone,
        province: draft.province,
        orchard: draft.orchard,
        lineUserId: p.lineUserId,
        consentAt,
      })
      p.set({ ...draft, onboarded: true, consent: true, consentAt, growerId })
      nav('/home', { replace: true })
    } catch (e) {
      // registration failed on the server — do NOT mark them registered, or
      // their captures would arrive with no grower attached and no way to tell
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  if (isRegistered(p) && p.growerId) {
    nav('/home', { replace: true })
    return null
  }

  return (
    <div className="px-5 pt-6 pb-10">
      <h1 className="text-[26px] font-bold tracking-tight">
        {t('profile.registerTitle')}
      </h1>
      <p className="mt-1.5 text-[15px] leading-relaxed text-muted">
        {t('profile.registerBody')}
      </p>

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
        <label className="block">
          <span className="text-[12px] font-semibold tracking-[0.06em] text-muted uppercase">
            {t('profile.name')} *
          </span>
          <input
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            placeholder={t('profile.namePh')}
            className="mt-1.5 w-full rounded-xl border border-hair bg-panel px-3.5 py-3.5 text-[16px] outline-none focus:border-accent"
          />
        </label>

        <label className="block">
          <span className="text-[12px] font-semibold tracking-[0.06em] text-muted uppercase">
            {t('profile.orchard')}
          </span>
          <input
            value={draft.orchard}
            onChange={(e) => setDraft({ ...draft, orchard: e.target.value })}
            placeholder={t('profile.orchardPh')}
            className="mt-1.5 w-full rounded-xl border border-hair bg-panel px-3.5 py-3.5 text-[16px] outline-none focus:border-accent"
          />
        </label>

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

        <label className="block">
          <span className="text-[12px] font-semibold tracking-[0.06em] text-muted uppercase">
            {linked
              ? t('profile.phoneOptional')
              : `${t('profile.phone').replace(' (ไม่บังคับ)', '').replace(' (optional)', '')} *`}
          </span>
          <input
            type="tel"
            value={draft.phone}
            onChange={(e) => setDraft({ ...draft, phone: e.target.value })}
            placeholder={t('profile.phonePh')}
            className="mt-1.5 w-full rounded-xl border border-hair bg-panel px-3.5 py-3.5 text-[16px] outline-none focus:border-accent"
          />
        </label>

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

        <Button onClick={submit} disabled={busy}>
          {busy ? <Loader2 size={19} className="animate-spin" /> : null}
          {busy ? t('capture.analyzing') : t('profile.registerCta')}
          {!busy && <ArrowRight size={18} />}
        </Button>
      </div>
    </div>
  )
}
