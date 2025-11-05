import React, { createContext, useContext, useEffect, useState } from 'react'
import { useToast } from '@/contexts/ToastContext'

interface ThemeContextType {
  theme: 'dark' | 'light'
  toggleTheme: () => void
  setTheme: (theme: 'dark' | 'light') => void
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined)

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<'dark' | 'light'>('dark')
  const { addToast } = useToast()

  useEffect(() => {
    loadTheme()
  }, [])

  const loadTheme = async () => {
    try {
      const settings = await window.electronAPI.settings.get()
      setThemeState(settings.theme)
      applyTheme(settings.theme)
    } catch (error) {
      console.error('Failed to load theme:', error)
    }
  }

  const applyTheme = (newTheme: 'dark' | 'light') => {
    if (newTheme === 'light') {
      document.documentElement.classList.add('light')
      document.documentElement.classList.remove('dark')
    } else {
      document.documentElement.classList.add('dark')
      document.documentElement.classList.remove('light')
    }
  }

  const toggleTheme = async () => {
    const newTheme = theme === 'dark' ? 'light' : 'dark'
    await setTheme(newTheme)
  }

  const setTheme = async (newTheme: 'dark' | 'light') => {
    setThemeState(newTheme)
    applyTheme(newTheme)
    
    try {
      const settings = await window.electronAPI.settings.get()
      await window.electronAPI.settings.set({ ...settings, theme: newTheme })
    } catch (error) {
      console.error('Failed to save theme:', error)
    }
  }

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