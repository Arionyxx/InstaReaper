export interface Settings {
  torboxApiKey?: string
  torboxApiBaseUrl?: string
  downloadDir?: string
  theme: 'dark' | 'light'
  driveFolderId?: string
  syncToDrive: boolean
}

export interface QueueItem {
  id: string
  url: string
  owner: string
  caption: string
  thumbnail: string
  keywords: string[]
  status: 'pending' | 'active' | 'downloading' | 'completed' | 'failed' | 'paused'
  progress: number
  error?: string
  jobId?: string
  jobHash?: string
  localPath?: string
  addedAt: string
  completedAt?: string
  retryCount: number
}

export interface LibraryItem {
  id: string
  filename: string
  path: string
  size: number
  owner: string
  caption: string
  keywords: string[]
  addedAt: string
  thumbnail?: string
}

export interface Reel {
  id: string
  url: string
  owner: string
  caption: string
  thumbnail: string
}

export interface Toast {
  id: string
  type: 'success' | 'error' | 'info'
  message: string
  duration?: number
}

export interface TorboxError {
  code: string
  message: string
  status?: number
  details?: unknown
}

export type TorboxResult<T> = { ok: true; data: T } | { ok: false; error: TorboxError }

export interface TorboxJobReference {
  jobId: string
  jobHash?: string | null
}

export type TorboxJobLifecycleStatus =
  | 'queued'
  | 'pending'
  | 'processing'
  | 'downloading'
  | 'completed'
  | 'failed'
  | 'cancelled'

export interface TorboxJobStatus {
  jobId: string
  jobHash?: string | null
  status: TorboxJobLifecycleStatus
  progress: number
  bytesTotal?: number | null
  bytesDownloaded?: number | null
  message?: string
  etaSeconds?: number | null
  raw?: unknown
}

export interface TorboxFileLink {
  url: string
  filename?: string
  sizeBytes?: number | null
  expiresAt?: string | null
  raw?: unknown
}

export interface TorboxCreateJobResult extends TorboxJobReference {
  name?: string
  raw?: unknown
}

export interface TorboxTestConnectionResult {
  user?: Record<string, unknown>
  detail?: unknown
}

declare global {
  interface Window {
    electronAPI: {
      settings: {
        get: () => Promise<Settings>
        set: (settings: Settings) => Promise<Settings>
      }
      dialog: {
        selectFolder: () => Promise<string | null>
      }
      torbox: {
        testConnection: () => Promise<TorboxResult<TorboxTestConnectionResult>>
        addUrl: (payload: { url: string; name?: string }) => Promise<TorboxResult<TorboxCreateJobResult>>
        getStatus: (reference: TorboxJobReference) => Promise<TorboxResult<TorboxJobStatus>>
        getFileLinks: (reference: TorboxJobReference) => Promise<TorboxResult<TorboxFileLink[]>>
        cancel: (reference: TorboxJobReference) => Promise<TorboxResult<{ cancelled: boolean }>>
        list: () => Promise<TorboxResult<any>>
      }
      queue: {
        get: () => Promise<QueueItem[]>
        add: (items: Partial<QueueItem>[]) => Promise<QueueItem[]>
        pause: (itemId: string) => Promise<boolean>
        resume: (itemId: string) => Promise<boolean>
        cancel: (itemId: string) => Promise<boolean>
        retry: (itemId: string) => Promise<boolean>
      }
      library: {
        scan: () => Promise<LibraryItem[]>
        delete: (item: LibraryItem) => Promise<boolean>
      }
      instagram: {
        create: () => Promise<boolean>
        destroy: () => Promise<boolean>
        extract: () => Promise<boolean>
      }
      onReelsFound: (callback: (reels: Reel[]) => void) => void
      removeAllListeners: (channel: string) => void
    }
  }
}