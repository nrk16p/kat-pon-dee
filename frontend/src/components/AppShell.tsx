import { NavLink, Outlet } from 'react-router-dom'
import { Camera, History, Home, Settings, WifiOff } from 'lucide-react'
import { clsx } from 'clsx'
import { useEffect, useState } from 'react'
import { useT } from './ui'
import { isMock } from '@/lib/api'

const TABS = [
  { to: '/home', icon: Home, key: 'tab.home' },
  { to: '/capture', icon: Camera, key: 'tab.measure' },
  { to: '/history', icon: History, key: 'tab.history' },
  { to: '/settings', icon: Settings, key: 'tab.settings' },
]

export default function AppShell() {
  const { t } = useT()
  const [online, setOnline] = useState(navigator.onLine)

  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])

  return (
    <div className="flex h-full flex-col overflow-x-hidden">
      {(!online || isMock()) && (
        <div
          className={clsx(
            // long Thai strings must wrap here, or the banner sets a min-width
            // wider than the viewport and pushes the whole app sideways
            'px-4 py-1.5 text-center text-[12px] leading-snug font-medium text-balance',
            !online ? 'bg-ink text-white' : 'bg-warn/12 text-warn',
          )}
          style={{ paddingTop: 'calc(var(--safe-top) + 6px)' }}
        >
          {!online && <WifiOff size={13} className="mr-1 inline align-[-2px]" />}
          {!online ? t('common.offline') : t('common.mockMode')}
        </div>
      )}

      <main className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
        <Outlet />
      </main>

      <nav
        className="grid shrink-0 grid-cols-4 border-t border-hair bg-surface/95 backdrop-blur"
        style={{ paddingBottom: 'var(--safe-bottom)' }}
      >
        {TABS.map(({ to, icon: Icon, key }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              clsx(
                'flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-semibold',
                isActive ? 'text-accent' : 'text-muted',
              )
            }
          >
            {({ isActive }) => (
              <>
                <Icon size={22} strokeWidth={isActive ? 2.3 : 1.8} />
                {t(key)}
              </>
            )}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
