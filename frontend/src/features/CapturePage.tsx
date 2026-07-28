import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Camera,
  Check,
  ChevronLeft,
  FlaskConical,
  Images,
  RotateCcw,
  Sparkles,
  X,
} from 'lucide-react'
import { clsx } from 'clsx'
import { Button, Notice, useT } from '@/components/ui'
import MatGuide from '@/components/MatGuide'
import { LISTED_FRUITS, getFruit } from '@/domain/fruits'
import { MATS, MAT_LIST, matCapacity } from '@/domain/mats'
import { useApp } from '@/store/app'
import { measure } from '@/lib/api'

type Phase = 'fruit' | 'mat' | 'ready' | 'live' | 'review' | 'working'

const STEPS: Phase[] = ['fruit', 'mat', 'ready']

export default function CapturePage() {
  const { t, tx } = useT()
  const nav = useNavigate()
  const { fruitId, matId, setFruit, setMat, setDraft } = useApp()

  const fruit = getFruit(fruitId)
  const mat = MATS[matId]

  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const [phase, setPhase] = useState<Phase>('fruit')
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [shot, setShot] = useState<{ blob: Blob; url: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [lowRes, setLowRes] = useState<string | null>(null)

  const stop = () => {
    streamRef.current?.getTracks().forEach((tr) => tr.stop())
    streamRef.current = null
    setStream(null)
  }
  useEffect(() => stop, [])

  // Attach the stream only once React has actually rendered the <video>.
  // Doing it right after setPhase() runs before the commit, so the ref is still
  // null and the preview stays black.
  useEffect(() => {
    const v = videoRef.current
    if (phase !== 'live' || !v || !stream) return
    v.srcObject = stream
    const go = () => {
      v.play().catch(() => setError(t('capture.playFailed')))
    }
    if (v.readyState >= 2) go()
    else v.addEventListener('loadedmetadata', go, { once: true })

    const track = stream.getVideoTracks()[0]
    const st = track?.getSettings()
    if (st?.width && st?.height) {
      const long = Math.max(st.width, st.height)
      setLowRes(long < 1600 ? `${st.width}×${st.height}` : null)
    }
    return () => v.removeEventListener('loadedmetadata', go)
  }, [phase, stream, t])

  async function openCamera() {
    setError(null)
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 3840 },
          height: { ideal: 2160 },
        },
        audio: false,
      })
      streamRef.current = s
      setStream(s)
      setPhase('live')
    } catch {
      setError(t('capture.cameraDenied'))
    }
  }

  async function shutter() {
    const v = videoRef.current
    if (!v) return
    const c = document.createElement('canvas')
    c.width = v.videoWidth
    c.height = v.videoHeight
    c.getContext('2d')!.drawImage(v, 0, 0)
    const blob = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/jpeg', 0.94))
    if (!blob) return
    stop()
    setShot({ blob, url: URL.createObjectURL(blob) })
    setPhase('review')
  }

  /** Run the bundled demo capture. Lets someone see a complete result before
   *  they have printed a sheet — and it is a known-answer check: the sample was
   *  rendered from 64 fruit averaging 28.4 mm. */
  async function useSample() {
    setError(null)
    try {
      const res = await fetch('/samples/longan-sample.jpg')
      if (!res.ok) throw new Error(`sample ${res.status}`)
      const blob = await res.blob()
      setShot({ blob, url: URL.createObjectURL(blob) })
      setPhase('review')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  function pickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    setShot({ blob: f, url: URL.createObjectURL(f) })
    setPhase('review')
  }

  function retake() {
    if (shot) URL.revokeObjectURL(shot.url)
    setShot(null)
    setPhase('ready')
  }

  async function analyze() {
    if (!shot) return
    setPhase('working')
    try {
      const result = await measure(shot.blob, fruit, mat)
      setDraft({ result, image: shot.blob })
      nav('/result')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setPhase('review')
    }
  }

  /* ------------------------------------------------------------- camera -- */

  if (phase === 'live') {
    return (
      <div className="relative h-full bg-black">
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          className="h-full w-full object-cover"
        />
        <MatGuide areaRatio={mat.area / mat.mat} />

        <div
          className="absolute inset-x-0 top-0 flex items-center justify-between gap-2 px-4"
          style={{ paddingTop: 'calc(var(--safe-top) + 12px)' }}
        >
          <button
            onClick={() => {
              stop()
              setPhase('ready')
            }}
            className="press shrink-0 rounded-full bg-black/55 p-2.5 text-white"
            aria-label={t('common.cancel')}
          >
            <X size={20} />
          </button>
          <div className="min-w-0 truncate rounded-full bg-black/55 px-3.5 py-1.5 text-[12px] font-semibold text-white">
            {tx(fruit.name)} · {mat.sheet}
          </div>
        </div>

        <div className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-4 px-6 pb-10">
          {lowRes ? (
            <p className="rounded-2xl bg-warn/90 px-4 py-2.5 text-center text-[13px] leading-snug text-white">
              {t('capture.lowRes', { size: lowRes })}
            </p>
          ) : (
            <p className="rounded-full bg-black/55 px-4 py-2 text-center text-[13px] text-white">
              {t('capture.guideHint')}
            </p>
          )}
          <button
            onClick={shutter}
            aria-label={t('capture.shutter')}
            className="press h-20 w-20 shrink-0 rounded-full border-[6px] border-white/85 bg-accent shadow-lg"
          />
        </div>
      </div>
    )
  }

  /* ------------------------------------------------------------- review -- */

  if (phase === 'review' || phase === 'working') {
    return (
      <div className="flex h-full flex-col bg-black">
        <div className="relative min-h-0 flex-1">
          <img src={shot?.url} alt="" className="h-full w-full object-contain" />
          {phase === 'working' && (
            <div className="absolute inset-0 grid place-items-center bg-black/65">
              <div className="flex flex-col items-center gap-3 text-white">
                <Sparkles className="animate-pulse" size={30} />
                <span className="text-[15px] font-medium">{t('capture.analyzing')}</span>
              </div>
            </div>
          )}
        </div>
        <div
          className="space-y-3 bg-surface px-5 pt-4"
          style={{ paddingBottom: 'calc(var(--safe-bottom) + 16px)' }}
        >
          {error && <Notice tone="warn">{error}</Notice>}
          <Button onClick={analyze} disabled={phase === 'working'}>
            <Sparkles size={19} /> {t('capture.analyze')}
          </Button>
          <Button variant="ghost" onClick={retake} disabled={phase === 'working'}>
            <RotateCcw size={19} /> {t('capture.retake')}
          </Button>
        </div>
      </div>
    )
  }

  /* -------------------------------------------------------------- steps -- */

  const stepIndex = STEPS.indexOf(phase)

  return (
    <div className="px-5 pt-4 pb-8">
      {/* progress: one decision per screen, always shows where you are */}
      <div className="flex items-center gap-3">
        {stepIndex > 0 ? (
          <button
            onClick={() => setPhase(STEPS[stepIndex - 1])}
            className="press -ml-2 shrink-0 p-2 text-muted"
            aria-label={t('common.back')}
          >
            <ChevronLeft size={22} />
          </button>
        ) : (
          <span className="w-1" />
        )}
        <div className="flex min-w-0 flex-1 gap-1.5">
          {STEPS.map((s, i) => (
            <span
              key={s}
              className={clsx(
                'h-1.5 flex-1 rounded-full',
                i <= stepIndex ? 'bg-accent' : 'bg-hair',
              )}
            />
          ))}
        </div>
        <span className="num shrink-0 text-[12px] font-semibold text-muted">
          {stepIndex + 1}/{STEPS.length}
        </span>
      </div>

      {/* ---------------------------------------------------- step 1 fruit -- */}
      {phase === 'fruit' && (
        <>
          <h1 className="mt-5 text-[26px] font-bold tracking-tight">
            {t('capture.chooseFruit')}
          </h1>
          <p className="mt-1.5 text-[15px] text-muted">{t('capture.chooseFruitHint')}</p>

          <div className="mt-5 space-y-3">
            {LISTED_FRUITS.map((f) => {
              const soon = f.status === 'development'
              return (
              <button
                key={f.id}
                disabled={soon}
                onClick={() => {
                  if (soon) return
                  setFruit(f.id)
                  setPhase('mat')
                }}
                className={clsx(
                  'card flex w-full items-center gap-4 p-4 text-left',
                  soon ? 'opacity-55' : 'press',
                  !soon && f.id === fruitId && 'ring-2 ring-accent',
                )}
              >
                <span
                  className="grid h-14 w-14 shrink-0 place-items-center rounded-full text-[26px]"
                  style={{ backgroundColor: `${f.color}1F` }}
                >
                  {f.emoji}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[19px] font-bold">{tx(f.name)}</span>
                  {soon ? (
                    <span className="mt-1 inline-block rounded-full bg-warn/12 px-2.5 py-0.5 text-[12px] font-semibold text-warn">
                      {t('capture.inDevelopment')}
                    </span>
                  ) : (
                    <span className="num block text-[13px] text-muted">
                      {t(f.metric === 'length' ? 'result.length' : 'result.diameter')} ~
                      {f.size.typical} {t('common.mm')}
                    </span>
                  )}
                </span>
                {!soon && f.id === fruitId && (
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-accent text-white">
                    <Check size={16} strokeWidth={3} />
                  </span>
                )}
              </button>
              )
            })}
          </div>
        </>
      )}

      {/* ------------------------------------------------------ step 2 mat -- */}
      {phase === 'mat' && (
        <>
          <h1 className="mt-5 text-[26px] font-bold tracking-tight">
            {t('capture.chooseMat')}
          </h1>
          <p className="mt-1.5 text-[15px] text-muted">{t('capture.chooseMatHint')}</p>

          <div className="mt-5 space-y-3">
            {MAT_LIST.map((m) => (
              <button
                key={m.id}
                onClick={() => {
                  setMat(m.id)
                  setPhase('ready')
                }}
                className={clsx(
                  'press card flex w-full items-center gap-4 p-4 text-left',
                  m.id === matId && 'ring-2 ring-accent',
                )}
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-[17px] font-bold">{tx(m.label)}</span>
                  <span className="num mt-0.5 block text-[13px] text-muted">
                    {m.sheet}
                  </span>
                  <span className="num mt-0.5 block text-[12px] text-muted">
                    ≈ {matCapacity(m, fruit.size.typical)} {t('common.fruitUnit')}
                  </span>
                </span>
                {m.id === matId && (
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-accent text-white">
                    <Check size={16} strokeWidth={3} />
                  </span>
                )}
              </button>
            ))}
          </div>
        </>
      )}

      {/* ---------------------------------------------------- step 3 ready -- */}
      {phase === 'ready' && (
        <>
          <h1 className="mt-5 text-[26px] font-bold tracking-tight">
            {t('capture.readyTitle')}
          </h1>
          <p className="mt-1.5 text-[15px] text-muted">{t('capture.guideHint')}</p>

          <div className="card mt-5 divide-y divide-hair overflow-hidden">
            <div className="flex items-center gap-3 px-4 py-3.5">
              <span
                className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-[21px]"
                style={{ backgroundColor: `${fruit.color}1F` }}
              >
                {fruit.emoji}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[12px] text-muted">
                  {t('capture.chooseFruit')}
                </span>
                <span className="block text-[16px] font-semibold">{tx(fruit.name)}</span>
              </span>
              <button
                onClick={() => setPhase('fruit')}
                className="press shrink-0 text-[13px] font-semibold text-accent"
              >
                {t('capture.change')}
              </button>
            </div>
            <div className="flex items-center gap-3 px-4 py-3.5">
              <span className="min-w-0 flex-1">
                <span className="block text-[12px] text-muted">
                  {t('capture.chooseMat')}
                </span>
                <span className="block text-[16px] font-semibold">{tx(mat.label)}</span>
                <span className="num block text-[12px] text-muted">{mat.sheet}</span>
              </span>
              <button
                onClick={() => setPhase('mat')}
                className="press shrink-0 text-[13px] font-semibold text-accent"
              >
                {t('capture.change')}
              </button>
            </div>
          </div>

          <ol className="mt-5 space-y-2.5">
            {(['1', '2', '3'] as const).map((k) => (
              <li key={k} className="flex items-start gap-3">
                <span className="num grid h-6 w-6 shrink-0 place-items-center rounded-full bg-accent-soft text-[12px] font-bold text-accent-ink">
                  {k}
                </span>
                <span className="min-w-0 text-[14px] leading-snug text-muted">
                  {t(`capture.steps.${k}`)}
                </span>
              </li>
            ))}
          </ol>

          {error && (
            <div className="mt-5">
              <Notice tone="warn">{error}</Notice>
            </div>
          )}

          <div className="mt-6 space-y-3">
            <Button onClick={openCamera}>
              <Camera size={20} /> {t('capture.start')}
            </Button>
            <Button variant="ghost" onClick={() => fileRef.current?.click()}>
              <Images size={19} /> {t('capture.fromGallery')}
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              capture="environment"
              hidden
              onChange={pickFile}
            />
            {fruit.id === 'longan' && (
              <button
                onClick={useSample}
                className="press flex w-full items-center justify-center gap-2 py-3 text-[15px] font-semibold text-accent"
              >
                <FlaskConical size={18} /> {t('capture.trySample')}
              </button>
            )}
          </div>
          {fruit.id === 'longan' && (
            <p className="mt-1 px-1 text-center text-[12px] leading-relaxed text-muted">
              {t('capture.sampleHint')}
            </p>
          )}
        </>
      )}
    </div>
  )
}
