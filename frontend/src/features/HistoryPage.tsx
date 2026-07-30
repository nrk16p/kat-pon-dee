import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Trash2 } from 'lucide-react'
import { clsx } from 'clsx'
import ConfirmDialog from '@/components/ConfirmDialog'
import { Section, useT } from '@/components/ui'
import { db, deleteCapture } from '@/lib/db'
import { getFruit } from '@/domain/fruits'
import { MATS } from '@/domain/mats'
import type { CaptureStatus } from '@/domain/types'

const STATUS_TONE: Record<CaptureStatus, string> = {
  queued: 'bg-panel text-muted',
  uploading: 'bg-accent-soft text-accent-ink',
  done: 'bg-accent-soft text-accent-ink',
  failed: 'bg-danger/10 text-danger',
}

export default function HistoryPage() {
  const { t, tx, locale } = useT()
  const items = useLiveQuery(
    () => db.captures.orderBy('createdAt').reverse().limit(100).toArray(),
    [],
  )
  const [pendingDelete, setPendingDelete] = useState<number | null>(null)

  const fmt = new Intl.DateTimeFormat(locale === 'th' ? 'th-TH' : 'en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })

  return (
    <div className="px-5 pt-5 pb-8">
      <h1 className="text-[26px] font-bold tracking-tight">{t('history.title')}</h1>

      {items && items.length === 0 && (
        <div className="card mt-6 p-8 text-center">
          <p className="text-[16px] font-semibold">{t('history.empty')}</p>
          <p className="mt-1 text-[14px] text-muted">{t('history.emptyHint')}</p>
        </div>
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        title={t('history.deleteTitle')}
        body={t('history.deleteBody')}
        confirmLabel={t('history.deleteConfirm')}
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          if (pendingDelete !== null) void deleteCapture(pendingDelete)
          setPendingDelete(null)
        }}
      />

      {items && items.length > 0 && (
        <Section title={t('history.title')}>
          <ul className="card divide-y divide-hair overflow-hidden">
            {items.map((c) => {
              const fruit = getFruit(c.fruitId)
              const mat = MATS[c.matId]
              return (
                <li key={c.id} className="flex items-center gap-3 px-4 py-3.5">
                  <span
                    className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-[18px]"
                    style={{ backgroundColor: `${fruit.color}1F` }}
                  >
                    {fruit.emoji}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <span className="truncate text-[15px] font-semibold">
                        {tx(fruit.name)}
                      </span>
                      <span className="num text-[13px] text-accent">
                        {c.result ? `${c.result.meanDiameter.toFixed(1)} mm` : '—'}
                      </span>
                    </div>
                    <div className="num mt-0.5 truncate text-[12px] text-muted">
                      {fmt.format(c.createdAt)} · {c.result?.counted ?? 0}{' '}
                      {t('common.fruitUnit')} · {mat.sheet}
                    </div>
                  </div>
                  {c.status === 'failed' && (
                    <span
                      className={clsx(
                        'shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold',
                        STATUS_TONE[c.status],
                      )}
                    >
                      {t(`history.status.${c.status}`)}
                    </span>
                  )}
                  <button
                    onClick={() => c.id && setPendingDelete(c.id)}
                    aria-label={t('history.delete')}
                    className="press shrink-0 p-2 text-muted"
                  >
                    <Trash2 size={17} />
                  </button>
                </li>
              )
            })}
          </ul>
        </Section>
      )}
    </div>
  )
}
