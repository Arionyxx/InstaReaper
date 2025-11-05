import { join } from 'path'
import { promises as fs } from 'fs'
import Store from 'electron-store'
import { addUrl, getStatus, getFileLinks } from './torbox-api'

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

export class DownloadQueue {
  private queue: QueueItem[] = []
  private activeDownloads = new Map<string, NodeJS.Timeout>()
  private store: Store

  constructor(store: Store) {
    this.store = store
    this.loadQueue()
    this.startProcessing()
  }

  private loadQueue(): void {
    this.queue = this.store.get('downloadQueue', []) as QueueItem[]
  }

  private saveQueue(): void {
    this.store.set('downloadQueue', this.queue)
  }

  getQueue(): QueueItem[] {
    return [...this.queue]
  }

  async addToQueue(items: Partial<QueueItem>[]): Promise<QueueItem[]> {
    const newItems: QueueItem[] = items.map(item => ({
      id: `queue_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      url: item.url!,
      owner: item.owner || 'unknown',
      caption: item.caption || '',
      thumbnail: item.thumbnail || '',
      keywords: item.keywords || [],
      status: 'pending' as const,
      progress: 0,
      addedAt: new Date().toISOString(),
      retryCount: 0,
    }))

    this.queue.push(...newItems)
    this.saveQueue()
    return newItems
  }

  pauseItem(itemId: string): boolean {
    const item = this.queue.find(i => i.id === itemId)
    if (!item || !['pending', 'active', 'downloading'].includes(item.status)) {
      return false
    }

    item.status = 'paused'
    if (this.activeDownloads.has(itemId)) {
      clearTimeout(this.activeDownloads.get(itemId)!)
      this.activeDownloads.delete(itemId)
    }
    this.saveQueue()
    return true
  }

  resumeItem(itemId: string): boolean {
    const item = this.queue.find(i => i.id === itemId)
    if (!item || item.status !== 'paused') {
      return false
    }

    item.status = 'pending'
    item.error = undefined
    this.saveQueue()
    return true
  }

  cancelItem(itemId: string): boolean {
    const item = this.queue.find(i => i.id === itemId)
    if (!item) {
      return false
    }

    if (this.activeDownloads.has(itemId)) {
      clearTimeout(this.activeDownloads.get(itemId)!)
      this.activeDownloads.delete(itemId)
    }

    item.status = 'failed'
    item.error = 'Cancelled by user'
    this.saveQueue()
    return true
  }

  retryItem(itemId: string): boolean {
    const item = this.queue.find(i => i.id === itemId)
    if (!item || item.status !== 'failed') {
      return false
    }

    item.status = 'pending'
    item.error = undefined
    item.progress = 0
    item.jobId = undefined
    item.retryCount++
    this.saveQueue()
    return true
  }

  private startProcessing(): void {
    setInterval(() => {
      this.processQueue()
    }, 2000)
  }

  private async processQueue(): Promise<void> {
    const pendingItems = this.queue.filter(item => 
      item.status === 'pending' && !this.activeDownloads.has(item.id)
    )

    if (pendingItems.length === 0) return

    const item = pendingItems[0]
    await this.processItem(item)
  }

  private async processItem(item: QueueItem): Promise<void> {
    try {
      item.status = 'active'
      this.saveQueue()

      const settings = this.store.get('settings') as any
      const torboxApiKey = settings.torboxApiKey || ''
      if (!torboxApiKey) {
        throw new Error('Torbox API key not configured')
      }

      // Add to Torbox
      const result = await addUrl(item.url, torboxApiKey)
      item.jobId = result.jobId
      item.status = 'downloading'
      this.saveQueue()

      // Poll for completion
      this.activeDownloads.set(item.id, setInterval(async () => {
        try {
          const status = await getStatus(result.jobId, torboxApiKey)
          
          if (status.progress) {
            item.progress = status.progress
          }

          if (status.status === 'completed') {
            // Get file links and download
            const files = await getFileLinks(result.jobId, torboxApiKey)
            if (files.length > 0) {
              await this.downloadFile(item, files[0])
            }
            
            item.status = 'completed'
            item.completedAt = new Date().toISOString()
            item.progress = 100
            
            if (this.activeDownloads.has(item.id)) {
              clearInterval(this.activeDownloads.get(item.id)!)
              this.activeDownloads.delete(item.id)
            }
            
            this.saveQueue()
          } else if (status.status === 'failed') {
            throw new Error(status.error || 'Download failed')
          }
        } catch (error) {
          item.status = 'failed'
          item.error = error instanceof Error ? error.message : 'Unknown error'
          
          if (this.activeDownloads.has(item.id)) {
            clearInterval(this.activeDownloads.get(item.id)!)
            this.activeDownloads.delete(item.id)
          }
          
          this.saveQueue()
        }
      }, 3000))

    } catch (error) {
      item.status = 'failed'
      item.error = error instanceof Error ? error.message : 'Unknown error'
      this.saveQueue()
    }
  }

  private async downloadFile(item: QueueItem, file: { url: string; filename: string }): Promise<void> {
    const settings = this.store.get('settings') as any
    const downloadDir = settings.downloadDir
    
    if (!downloadDir || downloadDir.trim() === '') {
      throw new Error('DOWNLOAD_DIR_MISSING: Choose a download folder in Settings')
    }
    
    // Ensure download directory exists
    await fs.mkdir(downloadDir, { recursive: true })

    // Generate filename
    const extension = file.filename.split('.').pop() || 'mp4'
    const filename = `${item.owner}-${item.id}.${extension}`
    const filePath = join(downloadDir, filename)

    // Download file
    const response = await fetch(file.url)
    if (!response.ok) {
      throw new Error(`Failed to download: ${response.statusText}`)
    }

    const buffer = await response.arrayBuffer()
    await fs.writeFile(filePath, Buffer.from(buffer))

    // Save metadata
    const metadataPath = filePath.replace(/\.[^.]+$/, '.json')
    await fs.writeFile(metadataPath, JSON.stringify({
      owner: item.owner,
      caption: item.caption,
      keywords: item.keywords,
      addedAt: item.addedAt,
      source: item.url,
      thumbnail: item.thumbnail,
    }, null, 2))

    item.localPath = filePath
  }

  async scanLibrary(downloadDir: string): Promise<LibraryItem[]> {
    try {
      await fs.mkdir(downloadDir, { recursive: true })
      const files = await fs.readdir(downloadDir, { withFileTypes: true })
      
      const videoFiles = files.filter(file => 
        file.isFile() && file.name.endsWith('.mp4')
      )

      const libraryItems: LibraryItem[] = []

      for (const file of videoFiles) {
        const filePath = join(downloadDir, file.name)
        const metadataPath = filePath.replace('.mp4', '.json')
        
        try {
          const stats = await fs.stat(filePath)
          let metadata = {}

          try {
            const metadataContent = await fs.readFile(metadataPath, 'utf-8')
            metadata = JSON.parse(metadataContent)
          } catch {
            // Metadata file doesn't exist or is invalid
          }

          libraryItems.push({
            id: file.name.replace('.mp4', ''),
            filename: file.name,
            path: filePath,
            size: stats.size,
            owner: (metadata as any).owner || 'unknown',
            caption: (metadata as any).caption || '',
            keywords: (metadata as any).keywords || [],
            addedAt: (metadata as any).addedAt || stats.mtime.toISOString(),
            thumbnail: (metadata as any).thumbnail,
          })
        } catch (error) {
          console.error(`Error scanning file ${file.name}:`, error)
        }
      }

      return libraryItems
    } catch (error) {
      console.error('Error scanning library:', error)
      return []
    }
  }

  async deleteLibraryItem(item: LibraryItem): Promise<boolean> {
    try {
      await fs.unlink(item.path)
      
      const metadataPath = item.path.replace('.mp4', '.json')
      try {
        await fs.unlink(metadataPath)
      } catch {
        // Metadata file doesn't exist
      }
      
      return true
    } catch (error) {
      console.error('Error deleting library item:', error)
      return false
    }
  }
}