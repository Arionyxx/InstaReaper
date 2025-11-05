export interface Settings {
  torboxApiKey?: string
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
        testConnection: (apiKey: string) => Promise<boolean>
        addUrl: (url: string) => Promise<{ jobId: string }>
        getStatus: (jobId: string) => Promise<QueueItem>
        getFileLinks: (jobId: string) => Promise<Array<{ url: string; filename: string; size: number }>>
        cancel: (jobId: string) => Promise<boolean>
        list: () => Promise<Array<any>>
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