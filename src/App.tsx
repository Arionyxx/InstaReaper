import React from 'react'
import { Routes, Route } from 'react-router-dom'
import { Layout } from '@/components/Layout'
import { Scraper } from '@/pages/Scraper'
import { Downloads } from '@/pages/Downloads'
import { Library } from '@/pages/Library'
import { SettingsPage } from '@/pages/Settings'
import { ThemeProvider } from '@/contexts/ThemeContext'
import { ToastProvider } from '@/contexts/ToastContext'
import { SettingsProvider } from '@/contexts/SettingsContext'

function App() {
  return (
    <SettingsProvider>
      <ThemeProvider>
        <ToastProvider>
          <Layout>
            <Routes>
              <Route path="/" element={<Scraper />} />
              <Route path="/scraper" element={<Scraper />} />
              <Route path="/downloads" element={<Downloads />} />
              <Route path="/library" element={<Library />} />
              <Route path="/settings" element={<SettingsPage />} />
            </Routes>
          </Layout>
        </ToastProvider>
      </ThemeProvider>
    </SettingsProvider>
  )
}

export default App