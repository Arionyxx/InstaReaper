import React, { useEffect } from 'react'
import { Routes, Route, useNavigate } from 'react-router-dom'
import { Layout } from '@/components/Layout'
import { Scraper } from '@/pages/Scraper'
import { Downloads } from '@/pages/Downloads'
import { Library } from '@/pages/Library'
import { SettingsPage } from '@/pages/Settings'
import { CRASH_RECOVERY_ROUTE_STORAGE_KEY } from '@/components/ErrorBoundary'

function App() {
  const navigate = useNavigate()

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    try {
      const pendingRoute = window.sessionStorage.getItem(CRASH_RECOVERY_ROUTE_STORAGE_KEY)
      if (pendingRoute) {
        window.sessionStorage.removeItem(CRASH_RECOVERY_ROUTE_STORAGE_KEY)
        navigate(pendingRoute, { replace: true })
      }
    } catch (error) {
      if (import.meta.env.DEV) {
        console.warn('Failed to restore recovery route after crash', error)
      }
    }
  }, [navigate])

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Scraper />} />
        <Route path="/scraper" element={<Scraper />} />
        <Route path="/downloads" element={<Downloads />} />
        <Route path="/library" element={<Library />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Routes>
    </Layout>
  )
}

export default App
