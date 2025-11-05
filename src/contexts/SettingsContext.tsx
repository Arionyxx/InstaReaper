import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { Settings } from '@/types'

interface SettingsContextType {
  settings: Settings
  updateSettings: (newSettings: Partial<Settings>) => Promise<void>
  isLoading: boolean
  isDownloadDirConfigured: boolean
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined)

interface SettingsProviderProps {
  children: ReactNode
}

export function SettingsProvider({ children }: SettingsProviderProps) {
  const [settings, setSettings] = useState<Settings>({
    theme: 'dark',
    syncToDrive: false,
    torboxApiKey: '',
    torboxApiBaseUrl: 'https://api.torbox.app',
    downloadDir: '',
    driveFolderId: '',
  })
  const [isLoading, setIsLoading] = useState(true)

  const isDownloadDirConfigured = Boolean(settings.downloadDir && settings.downloadDir.trim() !== '')

  useEffect(() => {
    loadSettings()
  }, [])

  const loadSettings = async () => {
    try {
      const loadedSettings = await window.electronAPI.settings.get()
      setSettings(loadedSettings)
    } catch (error) {
      console.error('Failed to load settings:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const updateSettings = async (newSettings: Partial<Settings>) => {
    try {
      const updatedSettings = await window.electronAPI.settings.set({
        ...settings,
        ...newSettings,
      })
      setSettings(updatedSettings)
    } catch (error) {
      console.error('Failed to update settings:', error)
      throw error
    }
  }

  return (
    <SettingsContext.Provider 
      value={{ 
        settings, 
        updateSettings, 
        isLoading, 
        isDownloadDirConfigured 
      }}
    >
      {children}
    </SettingsContext.Provider>
  )
}

export function useSettings() {
  const context = useContext(SettingsContext)
  if (context === undefined) {
    throw new Error('useSettings must be used within a SettingsProvider')
  }
  return context
}