import React, { useState, useEffect } from 'react'
import { Settings as SettingsType } from '@/types'
import { useToast } from '@/contexts/ToastContext'
import { 
  Key, 
  FolderOpen, 
  Check, 
  Loader2,
  HardDrive,
  Cloud
} from 'lucide-react'

const DEFAULT_TORBOX_BASE_URL = 'https://api.torbox.app'

export function SettingsPage() {
  const [settings, setSettings] = useState<SettingsType>({
    theme: 'dark',
    syncToDrive: false,
    torboxApiKey: '',
    torboxApiBaseUrl: DEFAULT_TORBOX_BASE_URL,
    downloadDir: '',
    driveFolderId: '',
  })
  const [testingConnection, setTestingConnection] = useState(false)
  const [loading, setLoading] = useState(false)
  const { addToast } = useToast()

  useEffect(() => {
    loadSettings()
  }, [])

  const loadSettings = async () => {
    try {
      const savedSettings = await window.electronAPI.settings.get()
      setSettings((prev) => ({
        ...prev,
        ...savedSettings,
        torboxApiKey: savedSettings.torboxApiKey ?? '',
        torboxApiBaseUrl: savedSettings.torboxApiBaseUrl || DEFAULT_TORBOX_BASE_URL,
        downloadDir: savedSettings.downloadDir ?? '',
        driveFolderId: savedSettings.driveFolderId ?? '',
      }))
    } catch (error) {
      addToast({
        type: 'error',
        message: 'Failed to load settings',
      })
    }
  }

  const saveSettings = async (newSettings: Partial<SettingsType>) => {
    try {
      setLoading(true)
      const nextSettings: SettingsType = {
        ...settings,
        ...newSettings,
        torboxApiKey: (newSettings.torboxApiKey ?? settings.torboxApiKey) || '',
        torboxApiBaseUrl:
          (newSettings.torboxApiBaseUrl ?? settings.torboxApiBaseUrl || DEFAULT_TORBOX_BASE_URL) ||
          DEFAULT_TORBOX_BASE_URL,
        downloadDir: newSettings.downloadDir ?? settings.downloadDir ?? '',
        driveFolderId: newSettings.driveFolderId ?? settings.driveFolderId ?? '',
      }

      const updatedSettings = await window.electronAPI.settings.set(nextSettings)
      setSettings({
        ...updatedSettings,
        torboxApiKey: updatedSettings.torboxApiKey ?? '',
        torboxApiBaseUrl: updatedSettings.torboxApiBaseUrl || DEFAULT_TORBOX_BASE_URL,
        downloadDir: updatedSettings.downloadDir ?? '',
        driveFolderId: updatedSettings.driveFolderId ?? '',
      })
      addToast({
        type: 'success',
        message: 'Settings saved successfully',
      })
    } catch (error) {
      addToast({
        type: 'error',
        message: 'Failed to save settings',
      })
    } finally {
      setLoading(false)
    }
  }

  const testTorboxConnection = async () => {
    if (!settings.torboxApiKey) {
      addToast({
        type: 'error',
        message: 'Please enter a Torbox API key first',
      })
      return
    }

    setTestingConnection(true)
    try {
      const normalizedSettings: SettingsType = {
        ...settings,
        torboxApiKey: settings.torboxApiKey || '',
        torboxApiBaseUrl: settings.torboxApiBaseUrl || DEFAULT_TORBOX_BASE_URL,
        downloadDir: settings.downloadDir ?? '',
        driveFolderId: settings.driveFolderId ?? '',
      }

      const persistedSettings = await window.electronAPI.settings.set(normalizedSettings)
      setSettings({
        ...persistedSettings,
        torboxApiKey: persistedSettings.torboxApiKey ?? '',
        torboxApiBaseUrl: persistedSettings.torboxApiBaseUrl || DEFAULT_TORBOX_BASE_URL,
        downloadDir: persistedSettings.downloadDir ?? '',
        driveFolderId: persistedSettings.driveFolderId ?? '',
      })

      const result = await window.electronAPI.torbox.testConnection()

      if (result.ok) {
        addToast({
          type: 'success',
          message: 'Torbox connection successful!',
        })
      } else {
        const detailFromError = (() => {
          if (!result.error.details) return undefined
          if (typeof result.error.details === 'string') return result.error.details
          if (typeof (result.error.details as any)?.detail === 'string') {
            return (result.error.details as any).detail as string
          }
          return undefined
        })()

        const errorLabel = [result.error.message, result.error.code ? `(${result.error.code})` : '']
          .filter(Boolean)
          .join(' ')

        addToast({
          type: 'error',
          message: detailFromError ? `${errorLabel} - ${detailFromError}` : errorLabel,
        })
      }
    } catch (error) {
      addToast({
        type: 'error',
        message: 'Failed to test Torbox connection',
      })
    } finally {
      setTestingConnection(false)
    }
  }

  const selectDownloadDir = async () => {
    try {
      const dir = await window.electronAPI.dialog.selectFolder()
      if (dir) {
        await saveSettings({ downloadDir: dir })
      }
    } catch (error) {
      addToast({
        type: 'error',
        message: 'Failed to select download directory',
      })
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="glass-dark rounded-xl p-6">
        <h2 className="text-xl font-semibold mb-6 flex items-center gap-3">
          <Key className="w-6 h-6 text-primary-400" />
          Torbox API Configuration
        </h2>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">API Base URL</label>
            <input
              type="text"
              value={settings.torboxApiBaseUrl || ''}
              onChange={(e) => setSettings({ ...settings, torboxApiBaseUrl: e.target.value })}
              placeholder="https://api.torbox.app"
              className="w-full input"
            />
            <p className="text-xs text-neutral-500 mt-2">
              Default: https://api.torbox.app. Override only if Torbox instructs you to use a different endpoint.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">API Key</label>
            <div className="flex gap-3">
              <input
                type="password"
                value={settings.torboxApiKey || ''}
                onChange={(e) => setSettings({ ...settings, torboxApiKey: e.target.value })}
                placeholder="Enter your Torbox API key"
                className="flex-1 input"
              />
              <button
                onClick={testTorboxConnection}
                disabled={testingConnection || !settings.torboxApiKey}
                className="btn-primary flex items-center gap-2 disabled:opacity-50"
              >
                {testingConnection ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Check className="w-4 h-4" />
                )}
                Test
              </button>
            </div>
            <p className="text-xs text-neutral-500 mt-2">
              Get your API key from the Torbox dashboard
            </p>
          </div>
        </div>
      </div>

      <div className="glass-dark rounded-xl p-6">
        <h2 className="text-xl font-semibold mb-6 flex items-center gap-3">
          <HardDrive className="w-6 h-6 text-primary-400" />
          Download Settings
        </h2>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Download Directory</label>
            <div className="flex gap-3">
              <input
                type="text"
                value={settings.downloadDir || ''}
                onChange={(e) => setSettings({ ...settings, downloadDir: e.target.value })}
                placeholder="Select download directory"
                className="flex-1 input"
                readOnly
              />
              <button
                onClick={selectDownloadDir}
                className="btn-secondary flex items-center gap-2"
              >
                <FolderOpen className="w-4 h-4" />
                Browse
              </button>
            </div>
            <p className="text-xs text-neutral-500 mt-2">
              Where downloaded files will be saved
            </p>
          </div>
        </div>
      </div>

      <div className="glass-dark rounded-xl p-6">
        <h2 className="text-xl font-semibold mb-6 flex items-center gap-3">
          <Cloud className="w-6 h-6 text-primary-400" />
          Google Drive Sync
        </h2>
        
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium">Enable Google Drive Sync</div>
              <div className="text-sm text-neutral-400">
                Automatically upload completed downloads to Google Drive
              </div>
            </div>
            <button
              onClick={() => saveSettings({ syncToDrive: !settings.syncToDrive })}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                settings.syncToDrive ? 'bg-primary-600' : 'bg-neutral-600'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  settings.syncToDrive ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          {settings.syncToDrive && (
            <div>
              <label className="block text-sm font-medium mb-2">Drive Folder ID</label>
              <input
                type="text"
                value={settings.driveFolderId || ''}
                onChange={(e) => setSettings({ ...settings, driveFolderId: e.target.value })}
                placeholder="Enter Google Drive folder ID"
                className="w-full input"
              />
              <p className="text-xs text-neutral-500 mt-2">
                Optional: Specify a folder ID to upload to a specific folder
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="flex justify-end gap-3">
        <button
          onClick={loadSettings}
          className="btn-secondary"
        >
          Reset
        </button>
        <button
          onClick={() => saveSettings(settings)}
          disabled={loading}
          className="btn-primary disabled:opacity-50"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save Settings'}
        </button>
      </div>
    </div>
  )
}