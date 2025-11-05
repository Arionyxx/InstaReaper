import React, { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { useSettings } from '@/contexts/SettingsContext'

interface ThemeContextType {
  theme: 'dark' | 'light'
  toggleTheme: () => void
  setTheme: (theme: 'dark' | 'light') => void
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined)

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { settings, updateSettings } = useSettings()
  const [theme, setThemeState] = useState<'dark' | 'light'>(settings.theme ?? 'dark')

  const applyTheme = useCallback((newTheme: 'dark' | 'light') => {
    if (newTheme === 'light') {
      document.documentElement.classList.add('light')
      document.documentElement.classList.remove('dark')
    } else {
      document.documentElement.classList.add('dark')
      document.documentElement.classList.remove('light')
    }
  }, [])

  useEffect(() => {
    applyTheme(theme)
  }, [theme, applyTheme])

  useEffect(() => {
    setThemeState((prevTheme) => {
      if (settings.theme && settings.theme !== prevTheme) {
        return settings.theme
      }
      return prevTheme
    })
  }, [settings.theme])

  const setTheme = useCallback(
    (newTheme: 'dark' | 'light') => {
      setThemeState(newTheme)
      applyTheme(newTheme)

      updateSettings({ theme: newTheme }).catch((error) => {
        console.error('Failed to save theme:', error)
      })
    },
    [applyTheme, updateSettings],
  )

  const toggleTheme = useCallback(() => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark'
    setTheme(nextTheme)
  }, [theme, setTheme])

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const context = useContext(ThemeContext)
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider')
  }
  return context
}
