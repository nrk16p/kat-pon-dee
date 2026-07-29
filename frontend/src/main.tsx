import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router-dom'
import './index.css'
import './i18n'
import AppShell from './components/AppShell'
import ErrorScreen from './components/ErrorScreen'
import LandingPage from './features/LandingPage'
import HomePage from './features/HomePage'
import CapturePage from './features/CapturePage'
import ResultPage from './features/ResultPage'
import HistoryPage from './features/HistoryPage'
import PrivacyPage from './features/PrivacyPage'
import ProfilePage from './features/ProfilePage'
import SettingsPage from './features/SettingsPage'
import { useApp } from './store/app'
import { getLineProfile, initLiff } from './lib/liff'
import { useProfile } from './domain/profile'

/** First run shows the landing page; after that "/" goes straight to Home so a
 *  farmer opening the app in the field is one tap from the camera. */
function Entry() {
  const seen = useApp((s) => s.seenLanding)
  return seen ? <Navigate to="/home" replace /> : <LandingPage />
}

const router = createBrowserRouter([
  { path: '/', element: <Entry />, errorElement: <ErrorScreen /> },
  { path: '/welcome', element: <LandingPage /> },
  {
    element: <AppShell />,
    errorElement: <ErrorScreen />,
    children: [
      { path: '/home', element: <HomePage /> },
      { path: '/capture', element: <CapturePage /> },
      { path: '/result', element: <ResultPage /> },
      { path: '/history', element: <HistoryPage /> },
      { path: '/profile', element: <ProfilePage /> },
      { path: '/privacy', element: <PrivacyPage /> },
      { path: '/settings', element: <SettingsPage /> },
    ],
  },
  { path: '*', element: <Navigate to="/home" replace /> },
])

// Pull the LINE identity before the first render when we have one: the
// registration screen can then arrive pre-filled instead of asking a farmer to
// type their own name into a phone.
void initLiff().then(async (ok) => {
  if (!ok) return
  const line = await getLineProfile()
  if (!line) return
  const p = useProfile.getState()
  p.set({
    lineUserId: line.userId,
    linePicture: line.pictureUrl ?? '',
    name: p.name || line.displayName,
  })
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)
