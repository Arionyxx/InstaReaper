import Store from 'electron-store'
import { z } from 'zod'
import { app } from 'electron'

// Zod schema for settings validation with defaults
const SettingsSchema = z.object({
  torboxApiKey: z.string().default(''),
  downloadDir: z.string().default(''),
  theme: z.enum(['dark', 'light']).default('dark'),
  driveFolderId: z.string().default(''),
  syncToDrive: z.boolean().default(false),
})

export type Settings = z.infer<typeof SettingsSchema>

// Error codes for structured error handling
export enum SettingsError {
  DOWNLOAD_DIR_MISSING = 'DOWNLOAD_DIR_MISSING',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  STORAGE_ERROR = 'STORAGE_ERROR',
}

export class SettingsService {
  private store: Store

  constructor(store: Store) {
    this.store = store
    this.initializeDefaults()
  }

  /**
   * Initialize settings with defaults if they don't exist
   */
  private initializeDefaults(): void {
    try {
      const currentSettings = this.store.get('settings', {})
      const validatedSettings = SettingsSchema.parse(currentSettings)
      this.store.set('settings', validatedSettings)
    } catch (error) {
      console.error('Failed to initialize settings:', error)
      // If validation fails, set defaults
      const defaults = SettingsSchema.parse({})
      this.store.set('settings', defaults)
    }
  }

  /**
   * Get current settings with full validation
   */
  getSettings(): Settings {
    try {
      const settings = this.store.get('settings', {})
      return SettingsSchema.parse(settings)
    } catch (error) {
      console.error('Failed to get settings:', error)
      // Return defaults if validation fails
      return SettingsSchema.parse({})
    }
  }

  /**
   * Update settings with validation
   */
  updateSettings(newSettings: Partial<Settings>): Settings {
    try {
      const currentSettings = this.getSettings()
      const updatedSettings = { ...currentSettings, ...newSettings }
      const validatedSettings = SettingsSchema.parse(updatedSettings)
      this.store.set('settings', validatedSettings)
      return validatedSettings
    } catch (error) {
      console.error('Failed to update settings:', error)
      throw new Error(`${SettingsError.VALIDATION_ERROR}: Invalid settings data`)
    }
  }

  /**
   * Check if download directory is configured and valid
   */
  isDownloadDirConfigured(): boolean {
    const settings = this.getSettings()
    return Boolean(settings.downloadDir && settings.downloadDir.trim() !== '')
  }

  /**
   * Get download directory or throw error if not configured
   */
  requireDownloadDir(): string {
    const settings = this.getSettings()
    
    if (!settings.downloadDir || settings.downloadDir.trim() === '') {
      throw new Error(
        `${SettingsError.DOWNLOAD_DIR_MISSING}: Choose a download folder in Settings`
      )
    }
    
    return settings.downloadDir
  }

  /**
   * Get download directory with fallback (for backwards compatibility)
   */
  getDownloadDir(): string {
    try {
      return this.requireDownloadDir()
    } catch (error) {
      // Fallback to default directory for backwards compatibility
      return app.getPath('downloads')
    }
  }

  /**
   * Validate and set download directory
   */
  setDownloadDir(path: string): Settings {
    if (!path || path.trim() === '') {
      throw new Error(`${SettingsError.VALIDATION_ERROR}: Download directory cannot be empty`)
    }
    return this.updateSettings({ downloadDir: path.trim() })
  }

  /**
   * Get Torbox API key
   */
  getTorboxApiKey(): string {
    const settings = this.getSettings()
    return settings.torboxApiKey || ''
  }

  /**
   * Check if Torbox API is configured
   */
  isTorboxConfigured(): boolean {
    return Boolean(this.getTorboxApiKey())
  }

  /**
   * Validate and set Torbox API key
   */
  setTorboxApiKey(apiKey: string): Settings {
    return this.updateSettings({ torboxApiKey: apiKey.trim() })
  }

  /**
   * Get theme setting
   */
  getTheme(): 'dark' | 'light' {
    const settings = this.getSettings()
    return settings.theme
  }

  /**
   * Set theme
   */
  setTheme(theme: 'dark' | 'light'): Settings {
    return this.updateSettings({ theme })
  }

  /**
   * Get Google Drive settings
   */
  getDriveSettings(): { folderId: string; syncEnabled: boolean } {
    const settings = this.getSettings()
    return {
      folderId: settings.driveFolderId || '',
      syncEnabled: settings.syncToDrive || false,
    }
  }

  /**
   * Update Google Drive settings
   */
  updateDriveSettings(folderId?: string, syncEnabled?: boolean): Settings {
    const updates: Partial<Settings> = {}
    if (folderId !== undefined) updates.driveFolderId = folderId
    if (syncEnabled !== undefined) updates.syncToDrive = syncEnabled
    return this.updateSettings(updates)
  }
}