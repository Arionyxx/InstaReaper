import { contextBridge, ipcRenderer } from 'electron'
import { z } from 'zod'

// Settings schemas
const SettingsSchema = z.object({
  torboxApiKey: z.string().optional(),
  downloadDir: z.string().optional(),
  theme: z.enum(['dark', 'light']).default('dark'),
  driveFolderId: z.string().optional(),
  syncToDrive: z.boolean().default(false),
})

const QueueItemSchema = z.object({
  id: z.string(),
  url: z.string(),
  owner: z.string(),
  caption: z.string(),
  thumbnail: z.string(),
  keywords: z.array(z.string()),
  status: z.enum(['pending', 'active', 'downloading', 'completed', 'failed', 'paused']),
  progress: z.number(),
  error: z.string().optional(),
  jobId: z.string().optional(),
  localPath: z.string().optional(),
  addedAt: z.string(),
  completedAt: z.string().optional(),
  retryCount: z.number(),
})

const LibraryItemSchema = z.object({
  id: z.string(),
  filename: z.string(),
  path: z.string(),
  size: z.number(),
  owner: z.string(),
  caption: z.string(),
  keywords: z.array(z.string()),
  addedAt: z.string(),
  thumbnail: z.string().optional(),
})

const ReelSchema = z.object({
  id: z.string(),
  url: z.string(),
  owner: z.string(),
  caption: z.string(),
  thumbnail: z.string(),
})

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // Settings
  settings: {
    get: (): Promise<z.infer<typeof SettingsSchema>> => 
      ipcRenderer.invoke('settings:get'),
    set: (settings: unknown): Promise<z.infer<typeof SettingsSchema>> => 
      ipcRenderer.invoke('settings:set', settings),
  },

  // Dialog
  dialog: {
    selectFolder: (): Promise<string | null> => 
      ipcRenderer.invoke('dialog:selectFolder'),
  },

  // Torbox API
  torbox: {
    testConnection: (apiKey: string): Promise<boolean> => 
      ipcRenderer.invoke('torbox:testConnection', apiKey),
    addUrl: (url: string): Promise<{ jobId: string }> => 
      ipcRenderer.invoke('torbox:addUrl', url),
    getStatus: (jobId: string): Promise<z.infer<typeof QueueItemSchema>> => 
      ipcRenderer.invoke('torbox:getStatus', jobId),
    getFileLinks: (jobId: string): Promise<Array<{ url: string; filename: string; size: number }>> => 
      ipcRenderer.invoke('torbox:getFileLinks', jobId),
    cancel: (jobId: string): Promise<boolean> => 
      ipcRenderer.invoke('torbox:cancel', jobId),
    list: (): Promise<Array<any>> => 
      ipcRenderer.invoke('torbox:list'),
  },

  // Queue management
  queue: {
    get: (): Promise<z.infer<typeof QueueItemSchema>[]> => 
      ipcRenderer.invoke('queue:get'),
    add: (items: unknown): Promise<z.infer<typeof QueueItemSchema>[]> => 
      ipcRenderer.invoke('queue:add', items),
    pause: (itemId: string): Promise<boolean> => 
      ipcRenderer.invoke('queue:pause', itemId),
    resume: (itemId: string): Promise<boolean> => 
      ipcRenderer.invoke('queue:resume', itemId),
    cancel: (itemId: string): Promise<boolean> => 
      ipcRenderer.invoke('queue:cancel', itemId),
    retry: (itemId: string): Promise<boolean> => 
      ipcRenderer.invoke('queue:retry', itemId),
  },

  // Library
  library: {
    scan: (): Promise<z.infer<typeof LibraryItemSchema>[]> => 
      ipcRenderer.invoke('library:scan'),
    delete: (item: unknown): Promise<boolean> => 
      ipcRenderer.invoke('library:delete', item),
  },

  // Instagram browser
  instagram: {
    create: (): Promise<boolean> => 
      ipcRenderer.invoke('instagram:create'),
    destroy: (): Promise<boolean> => 
      ipcRenderer.invoke('instagram:destroy'),
    extract: (): Promise<boolean> => 
      ipcRenderer.invoke('instagram:extract'),
  },

  // Events
  onReelsFound: (callback: (reels: z.infer<typeof ReelSchema>[]) => void) => {
    ipcRenderer.on('reels:found', (_, reels) => {
      try {
        const validatedReels = z.array(ReelSchema).parse(reels)
        callback(validatedReels)
      } catch (error) {
        console.error('Invalid reels data:', error)
      }
    })
  },

  removeAllListeners: (channel: string) => {
    ipcRenderer.removeAllListeners(channel)
  },
})

// Type definitions for the renderer
export type ElectronAPI = {
  settings: {
    get: () => Promise<any>
    set: (settings: any) => Promise<any>
  }
  dialog: {
    selectFolder: () => Promise<string | null>
  }
  torbox: {
    testConnection: (apiKey: string) => Promise<boolean>
    addUrl: (url: string) => Promise<{ jobId: string }>
    getStatus: (jobId: string) => Promise<any>
    getFileLinks: (jobId: string) => Promise<Array<{ url: string; filename: string; size: number }>>
    cancel: (jobId: string) => Promise<boolean>
    list: () => Promise<Array<any>>
  }
  queue: {
    get: () => Promise<any[]>
    add: (items: any[]) => Promise<any[]>
    pause: (itemId: string) => Promise<boolean>
    resume: (itemId: string) => Promise<boolean>
    cancel: (itemId: string) => Promise<boolean>
    retry: (itemId: string) => Promise<boolean>
  }
  library: {
    scan: () => Promise<any[]>
    delete: (item: any) => Promise<boolean>
  }
  instagram: {
    create: () => Promise<boolean>
    destroy: () => Promise<boolean>
    extract: () => Promise<boolean>
  }
  onReelsFound: (callback: (reels: any[]) => void) => void
  removeAllListeners: (channel: string) => void
}