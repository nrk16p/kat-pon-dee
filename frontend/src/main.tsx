import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router-dom'
import './index.css'
import './i18n'
import AppShell from './components/AppShell'
import LandingPage from './features/LandingPage'
import HomePage from './features/HomePage'
import CapturePage from './features/CapturePage'
import ResultPage from './features/ResultPage'
import HistoryPage from './features/HistoryPage'
import SettingsPage from './features/SettingsPage'
import { useApp } from './store/app'

/** First run shows the landing page; after that "/" goes straight to Home so a
 *  farmer opening the app in the field is one tap from the camera. */
function Entry() {
  const seen = useApp((s) => s.seenLanding)
  return seen ? <Navigate to="/home" replace /> : <LandingPage />
}

const router = createBrowserRouter([
  { path: '/', element: <Entry /> },
  { path: '/welcome', element: <LandingPage /> },
  {
    element: <AppShell />,
    children: [
      { path: '/home', element: <HomePage /> },
      { path: '/capture', element: <CapturePage /> },
      { path: '/result', element: <ResultPage /> },
      { path: '/history', element: <HistoryPage /> },
      { path: '/settings', element: <SettingsPage /> },
    ],
  },
  { path: '*', element: <Navigate to="/home" replace /> },
])

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)
