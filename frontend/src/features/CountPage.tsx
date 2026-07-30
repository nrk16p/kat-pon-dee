import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, Check, Loader2, Pause, RotateCcw, Volume2, VolumeX } from 'lucide-react'
import { Button, GradeBadge, Notice, useT } from '@/components/ui'
import ZoneOverlay from '@/components/ZoneOverlay'
import { getFruit } from '@/domain/fruits'
import { MATS } from '@/domain/mats'
import { supportsCounting } from '@/domain/zones'
import { getApiUrl } from '@/lib/endpoint'
import { StillnessDetector, type Motion } from '@/lib/live/stillness'
import { Tracker, type Track } from '@/lib/live/tracker'
import {
  closeSession,
  commitCounts,
  openSession,
  sendFrame,
  undoCounts,
  zonesOf,
  type SessionInfo,
} from '@/lib/live/session'
import { useApp } from '@/store/app'

/**
 * Pour a basket across the sheet by hand and let the app keep the tally.
 *
 * The whole design rests on one observation: the fruit do not move, the hand
 * does. So the camera runs continuously but measurement happens exactly once
 * per handful, at the moment the farmer lets go. That is what makes the mode
 * possible on a phone with no on-device CV — a settled frame goes to the
 * server, comes back in about a third of a second, and the tracker does the
 * rest in plain arithmetic.
 */

/** Frames only go up when the scene has settled, but a farmer working quickly
 *  can settle twice a second. Rate-limit so requests cannot pile up. */
const MIN_FRAME_GAP_MS = 700

/** JPEG quality for the uploaded frame. 0.8 of a 1280 px frame is ~110 KB,
 *  which crosses a tunnel in well under a second. */
const FRAME_QUALITY = 0.8

function beep(kind: 'count' | 'undo') {
  try {
    const Ctx = window.AudioContext ?? (window as never as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    const ctx = new Ctx()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.frequency.value = kind === 'count' ? 880 : 420
    gain.gain.setValueAtTime(0.0001, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.12)
    osc.connect(gain).connect(ctx.destination)
    osc.start()
    osc.stop(ctx.currentTime + 0.14)
    setTimeout(() => void ctx.close(), 300)
  } catch {
    /* audio is a nicety; never let it break counting */
  }
}

export default function CountPage() {
  const { t, tx } = useT()
  const nav = useNavigate()
  const { fruitId, matId } = useApp()
  const fruit = getFruit(fruitId)
  const mat = MATS[matId]

  const videoRef = useRef<HTMLVideoElement>(null)
  const grabRef = useRef<HTMLCanvasElement>(null)
  const stillRef = useRef(new StillnessDetector())
  const trackerRef = useRef<Tracker | null>(null)
  const inFlight = useRef(false)
  const lastFrameAt = useRef(0)
  const sessionRef = useRef<SessionInfo | null>(null)

  const [session, setSession] = useState<SessionInfo | null>(null)
  const [tracks, setTracks] = useState<Track[]>([])
  const [homography, setHomography] = useState<number[] | null>(null)
  const [dims, setDims] = useState({ w: 0, h: 0 })
  const [motion, setMotion] = useState<Motion>('settling')
  const [busy, setBusy] = useState(false)
  const [starting, setStarting] = useState(false)
  const [markers, setMarkers] = useState<number | null>(null)
  const [merged, setMerged] = useState(0)
  const [error, setError] = useState('')
  const [flash, setFlash] = useState(0)
  const [sound, setSound] = useState(true)
  const [lastBatch, setLastBatch] = useState<number[]>([])

  const usable = supportsCounting(mat)
  const hasServer = !!getApiUrl()
  const zones = useMemo(() => zonesOf(session, mat), [session, mat])

  /* ------------------------------------------------------------ camera -- */

  useEffect(() => {
    if (!usable || !hasServer) return
    let stream: MediaStream | null = null
    let dead = false

    void (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            // 1280 is the sweet spot measured on the bench: markers decode with
            // room to spare and the frame is ~110 KB on the wire. Going higher
            // costs upload time and buys no accuracy at 2.5 px/mm.
            width: { ideal: 1280 },
            height: { ideal: 960 },
          },
          audio: false,
        })
        if (dead) {
          stream.getTracks().forEach((tr) => tr.stop())
          return
        }
        const v = videoRef.current
        if (!v) return
        v.srcObject = stream
        await v.play()
        setDims({ w: v.videoWidth, h: v.videoHeight })
      } catch (e) {
        setError(
          e instanceof DOMException && e.name === 'NotAllowedError'
            ? t('count.cameraDenied')
            : t('count.cameraFailed'),
        )
      }
    })()

    return () => {
      dead = true
      stream?.getTracks().forEach((tr) => tr.stop())
    }
  }, [usable, hasServer, t])

  /* ------------------------------------------------------- measure once -- */

  const measureFrame = useCallback(async () => {
    const v = videoRef.current
    const canvas = grabRef.current
    const s = sessionRef.current
    const tracker = trackerRef.current
    if (!v || !canvas || !s || !tracker || inFlight.current) return

    inFlight.current = true
    setBusy(true)
    try {
      canvas.width = v.videoWidth
      canvas.height = v.videoHeight
      canvas.getContext('2d')!.drawImage(v, 0, 0)
      const blob = await new Promise<Blob | null>((r) =>
        canvas.toBlob(r, 'image/jpeg', FRAME_QUALITY),
      )
      if (!blob) return

      const res = await sendFrame(s.sessionId, blob, fruit)
      setHomography(res.homography ?? null)
      setMarkers(res.markersFound)
      setMerged(res.counted - res.measured)
      setError('')

      const { visible, counted, retracted } = tracker.update(res.fruits, performance.now())
      setTracks(visible)

      const keepZones = (info: SessionInfo) => ({
        ...info,
        zones: info.zones?.length ? info.zones : s.zones,
      })

      // Retractions first. A fruit that reappeared was never gone, and leaving
      // it in the tally for even one frame means the number on screen is one a
      // careful farmer would catch us being wrong about.
      if (retracted.length) {
        const info = await undoCounts(s.sessionId, retracted.map((r) => r.tid))
        sessionRef.current = keepZones(info)
        setSession(sessionRef.current)
      }

      if (counted.length) {
        // Record before celebrating. If the write fails the farmer must not be
        // looking at a bumped counter for a fruit the server never stored.
        const info = await commitCounts(s.sessionId, counted)
        sessionRef.current = keepZones(info)
        setSession(sessionRef.current)
        setLastBatch(counted.map((c) => c.tid))
        setFlash(counted.length)
        if (sound) beep('count')
        setTimeout(() => setFlash(0), 900)
      }
    } catch (e) {
      // A frame that fails is normal — a hand across the markers, a bad
      // exposure. Say what happened but keep the camera running.
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      inFlight.current = false
      setBusy(false)
    }
  }, [fruit, sound])

  /* --------------------------------------------------------- watch loop -- */

  useEffect(() => {
    if (!session) return
    let raf = 0
    const tick = () => {
      raf = requestAnimationFrame(tick)
      const v = videoRef.current
      if (!v || v.readyState < 2) return

      const now = performance.now()
      const st = stillRef.current.push(v, now)
      setMotion(st.motion)

      if (
        st.settledAfterChange &&
        !inFlight.current &&
        now - lastFrameAt.current > MIN_FRAME_GAP_MS
      ) {
        lastFrameAt.current = now
        void measureFrame()
      }
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [session, measureFrame])

  /* ------------------------------------------------------------ actions -- */

  async function start() {
    setStarting(true)
    setError('')
    try {
      const info = await openSession(fruit, mat)
      trackerRef.current = new Tracker({ zones: zonesOf(info, mat), fruit })
      stillRef.current.reset()
      stillRef.current.arm()
      sessionRef.current = info
      setSession(info)
      setTracks([])
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setStarting(false)
    }
  }

  async function undoLast() {
    const s = sessionRef.current
    if (!s || !lastBatch.length) return
    try {
      const info = await undoCounts(s.sessionId, lastBatch)
      lastBatch.forEach((tid) => trackerRef.current?.uncount(tid))
      sessionRef.current = { ...info, zones: info.zones?.length ? info.zones : s.zones }
      setSession(sessionRef.current)
      setLastBatch([])
      if (sound) beep('undo')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  async function finish() {
    const s = sessionRef.current
    if (!s) return
    try {
      await closeSession(s.sessionId)
    } catch {
      /* the tally is already on disk; closing is bookkeeping */
    }
    sessionRef.current = null
    setSession(null)
    setTracks([])
    trackerRef.current = null
    nav('/home')
  }

  /* ----------------------------------------------------------- blocked -- */

  if (!usable) {
    return (
      <div className="px-5 pt-6 pb-8">
        <h1 className="text-[24px] font-bold tracking-tight">{t('count.title')}</h1>
        <div className="mt-4">
          <Notice tone="warn">
            <strong>{t('count.needFullMat')}</strong>
            <p className="mt-1 opacity-90">{t('count.needFullMatWhy')}</p>
          </Notice>
        </div>
        <Button className="mt-5" variant="ghost" onClick={() => nav('/settings')}>
          {t('tab.settings')}
        </Button>
      </div>
    )
  }

  if (!hasServer) {
    return (
      <div className="px-5 pt-6 pb-8">
        <h1 className="text-[24px] font-bold tracking-tight">{t('count.title')}</h1>
        <div className="mt-4">
          <Notice tone="warn">{t('count.noServer')}</Notice>
        </div>
      </div>
    )
  }

  /* ------------------------------------------------------------ render -- */

  const tally = session?.tally ?? {}
  const total = session?.counted ?? 0
  const onSheet = tracks.length
  const borderline = Object.entries(tally).find(([g]) => g === '?')?.[1] ?? 0

  return (
    <div className="pb-8">
      {/* tally bar — pinned so the number never scrolls out of reach */}
      <div className="sticky top-0 z-10 bg-bg/95 px-5 pt-4 pb-3 backdrop-blur">
        <div className="flex items-end justify-between gap-4">
          <div>
            <div className="text-[12px] font-semibold tracking-[0.06em] text-muted uppercase">
              {t('count.counted')}
            </div>
            <div className="mt-0.5 flex items-baseline gap-2">
              <span
                className={
                  'num text-[38px] leading-none font-bold transition-colors ' +
                  (flash ? 'text-accent' : '')
                }
              >
                {total}
              </span>
              <span className="num text-[13px] text-muted">{t('common.fruitUnit')}</span>
              {flash > 0 && (
                <span className="num rounded-full bg-accent px-2 py-0.5 text-[13px] font-bold text-white">
                  +{flash}
                </span>
              )}
            </div>
          </div>
          <div className="text-right">
            <div className="text-[12px] text-muted">
              {t('count.onSheet')} <span className="num font-semibold">{onSheet}</span>
            </div>
            {session && session.meanDiameter > 0 && (
              <div className="text-[12px] text-muted">
                {t('count.mean')}{' '}
                <span className="num font-semibold">{session.meanDiameter.toFixed(1)}</span>{' '}
                {t('common.mm')}
              </div>
            )}
          </div>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {fruit.grading.rules.map((r) => (
            <span key={r.id} className="flex items-center gap-1">
              <GradeBadge label={tx(r.label)} color={r.color} size="sm" />
              <span className="num text-[13px] font-semibold">{tally[r.id] ?? 0}</span>
            </span>
          ))}
          {borderline > 0 && (
            <span className="flex items-center gap-1">
              <GradeBadge label="?" color="#F59E0B" size="sm" />
              <span className="num text-[13px] font-semibold">{borderline}</span>
            </span>
          )}
          <span className="ml-auto flex items-center gap-2 text-[12px] text-muted">
            {markers !== null && (
              <span className={markers < 4 ? 'font-semibold text-warn' : ''}>
                {t('count.markers', { found: markers })}
              </span>
            )}
            <span className="flex items-center gap-1">
              {busy ? (
                <Loader2 size={13} className="animate-spin" />
              ) : motion === 'still' ? (
                <Check size={13} />
              ) : (
                <Pause size={13} />
              )}
              {busy
                ? t('count.reading')
                : motion === 'moving'
                  ? t('count.motionMoving')
                  : motion === 'settling'
                    ? t('count.motionSettling')
                    : t('count.motionStill')}
            </span>
          </span>
        </div>
      </div>

      {/* camera + zones */}
      <div className="relative mx-5 overflow-hidden rounded-2xl bg-panel">
        <video
          ref={videoRef}
          playsInline
          muted
          className="block w-full"
          style={{ aspectRatio: dims.w && dims.h ? `${dims.w}/${dims.h}` : '4/3' }}
        />
        <canvas ref={grabRef} className="hidden" />
        <ZoneOverlay
          zones={zones}
          homography={homography}
          tracks={tracks}
          fruit={fruit}
          width={dims.w}
          height={dims.h}
          motion={motion}
          mergedCount={merged}
          busy={busy}
        />
        {!session && (
          <div className="absolute inset-0 grid place-items-center bg-ink/45 px-6 text-center">
            <p className="text-[15px] leading-relaxed font-medium text-white">
              {t('count.howTo')}
            </p>
          </div>
        )}
      </div>

      <div className="px-5">
        {error && (
          <div className="mt-3">
            <Notice tone="warn">
              <AlertTriangle size={15} className="mr-1.5 inline" />
              {error}
            </Notice>
          </div>
        )}

        {!session ? (
          <Button className="mt-4" onClick={() => void start()} disabled={starting}>
            {starting ? t('count.starting') : t('count.start')}
          </Button>
        ) : (
          <>
            <div className="mt-4 flex gap-3">
              <Button
                variant="ghost"
                onClick={() => void undoLast()}
                disabled={!lastBatch.length}
              >
                <RotateCcw size={17} />
                {t('count.undo')}
              </Button>
              <Button variant="ghost" onClick={() => setSound((s) => !s)} className="!w-auto px-5">
                {sound ? <Volume2 size={18} /> : <VolumeX size={18} />}
              </Button>
            </div>
            <Button className="mt-3" onClick={() => void finish()}>
              {t('count.finish')}
            </Button>
          </>
        )}

        {/* Both of these stay on screen the whole time rather than living in a
            help page: they are the two things most likely to make someone
            distrust a number they are about to sell against. */}
        <p className="mt-4 px-1 text-[12px] leading-relaxed text-muted">
          {t('count.countedOnExit')}
        </p>
        <p className="mt-1.5 px-1 text-[12px] leading-relaxed text-muted">
          {t('count.liveNote')}
        </p>
        {borderline > 0 && (
          <p className="mt-1.5 px-1 text-[12px] leading-relaxed text-warn">
            {t('count.borderline')} · {t('count.borderlineHelp')}
          </p>
        )}
      </div>
    </div>
  )
}
