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
  jobHash: z.string().optional(),
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

const TorboxErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  status: z.number().optional(),
  details: z.any().optional(),
})

const TorboxFileLinkSchema = z.object({
  url: z.string(),
  filename: z.string().optional(),
  sizeBytes: z.number().nullable().optional(),
  expiresAt: z.string().nullable().optional(),
  raw: z.any().optional(),
})

const TorboxJobStatusSchema = z.object({
  jobId: z.string(),
  jobHash: z.string().nullable().optional(),
  status: z.enum(['queued', 'pending', 'processing', 'downloading', 'completed', 'failed', 'cancelled']),
  progress: z.number(),
  bytesTotal: z.number().nullable().optional(),
  bytesDownloaded: z.number().nullable().optional(),
  message: z.string().optional(),
  etaSeconds: z.number().nullable().optional(),
  raw: z.any().optional(),
})

const TorboxCreateJobResultSchema = z.object({
  jobId: z.string(),
  jobHash: z.string().nullable().optional(),
  name: z.string().optional(),
  raw: z.any().optional(),
})

const TorboxTestConnectionResultSchema = z.object({
  user: z.record(z.any()).optional(),
  detail: z.any().optional(),
})

function createTorboxResultSchema<T extends z.ZodTypeAny>(schema: T) {
  return z.union([
    z.object({
      ok: z.literal(true),
      data: schema,
    }),
    z.object({
      ok: z.literal(false),
      error: TorboxErrorSchema,
    }),
  ])
}

const TorboxTestConnectionResponseSchema = createTorboxResultSchema(TorboxTestConnectionResultSchema)
const TorboxCreateJobResponseSchema = createTorboxResultSchema(TorboxCreateJobResultSchema)
const TorboxJobStatusResponseSchema = createTorboxResultSchema(TorboxJobStatusSchema)
const TorboxFileLinksResponseSchema = createTorboxResultSchema(z.array(TorboxFileLinkSchema))
const TorboxCancelResponseSchema = createTorboxResultSchema(z.object({ cancelled: z.boolean() }))
const TorboxListResponseSchema = createTorboxResultSchema(z.array(TorboxJobStatusSchema))

function invokeTorbox<T extends z.ZodTypeAny>(channel: string, schema: T, payload?: unknown) {
  return ipcRenderer.invoke(channel, payload).then((result) => schema.parse(result))
}

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
    testConnection: () => invokeTorbox('torbox:testConnection', TorboxTestConnectionResponseSchema),
    addUrl: (payload: { url: string; name?: string }) => invokeTorbox('torbox:addUrl', TorboxCreateJobResponseSchema, payload),
    getStatus: (reference: { jobId: string; jobHash?: string | null }) =>
      invokeTorbox('torbox:getStatus', TorboxJobStatusResponseSchema, reference),
    getFileLinks: (reference: { jobId: string; jobHash?: string | null }) =>
      invokeTorbox('torbox:getFileLinks', TorboxFileLinksResponseSchema, reference),
    cancel: (reference: { jobId: string; jobHash?: string | null }) =>
      invokeTorbox('torbox:cancel', TorboxCancelResponseSchema, reference),
    list: () => invokeTorbox('torbox:list', TorboxListResponseSchema),
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
    openInBrowser: (): Promise<boolean> => 
      ipcRenderer.invoke('instagram:openInBrowser'),
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

  onInstagramLoaded: (callback: () => void) => {
    ipcRenderer.on('instagram:loaded', callback)
  },

  onInstagramLoadTimeout: (callback: () => void) => {
    ipcRenderer.on('instagram:load-timeout', callback)
  },

  onInstagramLoadError: (callback: (error: { errorCode: number; errorDescription: string }) => void) => {
    ipcRenderer.on('instagram:load-error', (_, error) => callback(error))
  },

  onInstagramExtractionError: (callback: (error: string) => void) => {
    ipcRenderer.on('instagram:extraction-error', (_, error) => callback(error))
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
    testConnection: () => Promise<z.infer<typeof TorboxTestConnectionResponseSchema>>
    addUrl: (payload: { url: string; name?: string }) => Promise<z.infer<typeof TorboxCreateJobResponseSchema>>
    getStatus: (reference: { jobId: string; jobHash?: string | null }) => Promise<z.infer<typeof TorboxJobStatusResponseSchema>>
    getFileLinks: (reference: { jobId: string; jobHash?: string | null }) => Promise<z.infer<typeof TorboxFileLinksResponseSchema>>
    cancel: (reference: { jobId: string; jobHash?: string | null }) => Promise<z.infer<typeof TorboxCancelResponseSchema>>
    list: () => Promise<z.infer<typeof TorboxListResponseSchema>>
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
    openInBrowser: () => Promise<boolean>
  }
  onReelsFound: (callback: (reels: any[]) => void) => void
  onInstagramLoaded: (callback: () => void) => void
  onInstagramLoadTimeout: (callback: () => void) => void
  onInstagramLoadError: (callback: (error: { errorCode: number; errorDescription: string }) => void) => void
  onInstagramExtractionError: (callback: (error: string) => void) => void
  removeAllListeners: (channel: string) => void
}