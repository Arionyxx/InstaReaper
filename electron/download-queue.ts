import { join } from 'path'
import { promises as fs } from 'fs'
import Store from 'electron-store'
import {
  addUrl,
  getStatus,
  getFileLinks,
  TorboxFileLink,
  TorboxJobReference,
  TorboxResult,
  TorboxError,
} from './torbox-api'
import { SettingsService } from './settings-service'

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

export class DownloadQueue {
  private queue: QueueItem[] = []
  private activeDownloads = new Map<string, NodeJS.Timeout>()
  private store: Store
  private settingsService: SettingsService

  constructor(store: Store, settingsService: SettingsService) {
    this.store = store
    this.settingsService = settingsService
    this.loadQueue()
    this.startProcessing()
  }

  private loadQueue(): void {
    this.queue = this.store.get('downloadQueue', []) as QueueItem[]
  }

  private saveQueue(): void {
    this.store.set('downloadQueue', this.queue)
  }

  private getTorboxConfig() {
    return {
      apiKey: this.settingsService.getTorboxApiKey(),
      baseUrl: this.settingsService.getTorboxApiBaseUrl(),
    }
  }

  private ensureTorboxConfigured() {
    const config = this.getTorboxConfig()
    if (!config.apiKey || !config.apiKey.trim()) {
      throw new Error('Torbox API key not configured')
    }
    return config
  }

  private static formatTorboxError(error: TorboxError): string {
    const parts: string[] = [error.message]

    if (error.code) {
      parts.push(`(${error.code})`)
    }

    const detail = (() => {
      if (!error.details) return undefined
      if (typeof error.details === 'string') return error.details
      if (typeof (error.details as any)?.detail === 'string') return (error.details as any).detail as string
      return undefined
    })()

    if (detail) {
      parts.push(`- ${detail}`)
    }

    return parts.filter(Boolean).join(' ')
  }

  private static unwrapTorboxResult<T>(result: TorboxResult<T>, context: string): T {
    if (result.ok) {
      return result.data
    }

    const message = DownloadQueue.formatTorboxError(result.error)
    throw new Error(context ? `${context}: ${message}` : message)
  }

  private clearActiveDownload(itemId: string): void {
    const timer = this.activeDownloads.get(itemId)
    if (timer) {
      clearInterval(timer)
      this.activeDownloads.delete(itemId)
    }
  }

  private handleDownloadError(item: QueueItem, error: unknown): void {
    console.error('[DownloadQueue] Failed to process Torbox job', {
      itemId: item.id,
      jobId: item.jobId,
      error,
    })
    item.status = 'failed'
    item.error = error instanceof Error ? error.message : 'Unknown error'
    this.clearActiveDownload(item.id)
    this.saveQueue()
  }

  private resolveFilename(item: QueueItem, file: TorboxFileLink): string {
    if (file.filename && file.filename.trim()) {
      return file.filename.trim()
    }

    const extension = this.extractExtension(file) ?? 'mp4'
    const ownerSlug = (item.owner || 'instareaper').replace(/[^a-z0-9_-]+/gi, '_')
    return `${ownerSlug}-${item.id}.${extension}`
  }

  private extractExtension(file: TorboxFileLink): string | null {
    if (file.filename && file.filename.includes('.')) {
      const ext = file.filename.split('.').pop()
      if (ext) {
        return ext
      }
    }

    try {
      const url = new URL(file.url)
      const match = url.pathname.match(/\.([a-z0-9]{2,5})$/i)
      if (match) {
        return match[1]
      }
    } catch {
      // ignore URL parsing failures
    }

    return null
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
    this.clearActiveDownload(itemId)
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

    this.clearActiveDownload(itemId)

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
    item.jobHash = undefined
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
      item.error = undefined
      this.saveQueue()

      const config = this.ensureTorboxConfigured()

      const addResult = await addUrl(config, { url: item.url, name: item.owner })
      const job = DownloadQueue.unwrapTorboxResult(addResult, 'Failed to create Torbox download job')

      item.jobId = job.jobId
      item.jobHash = job.jobHash ?? undefined
      item.status = 'downloading'
      item.progress = 0
      this.saveQueue()

      const pollReference: TorboxJobReference = {
        jobId: item.jobId!,
        jobHash: item.jobHash,
      }

      this.activeDownloads.set(
        item.id,
        setInterval(async () => {
          try {
            const statusResult = await getStatus(config, pollReference)
            const status = DownloadQueue.unwrapTorboxResult(statusResult, 'Failed to retrieve Torbox job status')

            if (status.jobHash && status.jobHash !== item.jobHash) {
              item.jobHash = status.jobHash ?? undefined
              pollReference.jobHash = status.jobHash ?? undefined
            }

            if (typeof status.progress === 'number') {
              item.progress = Math.max(item.progress, status.progress)
              this.saveQueue()
            }

            if (status.status === 'completed') {
              const linksResult = await getFileLinks(config, pollReference)

              if (!linksResult.ok) {
                if (linksResult.error.code === 'TORBOX_NO_LINKS') {
                  return
                }
                throw new Error(DownloadQueue.formatTorboxError(linksResult.error))
              }

              const links = linksResult.data

              if (links.length > 0) {
                await this.downloadFile(item, links[0])
              }

              item.status = 'completed'
              item.completedAt = new Date().toISOString()
              item.progress = 100

              this.clearActiveDownload(item.id)
              this.saveQueue()
            } else if (status.status === 'failed') {
              throw new Error(status.message ?? 'Torbox reported that the job failed')
            } else if (status.status === 'cancelled') {
              throw new Error('Torbox job was cancelled')
            }
          } catch (error) {
            this.handleDownloadError(item, error)
          }
        }, 3000)
      )
    } catch (error) {
      this.handleDownloadError(item, error)
    }
  }

  private async downloadFile(item: QueueItem, file: TorboxFileLink): Promise<void> {
    const downloadDir = this.settingsService.requireDownloadDir()

    await fs.mkdir(downloadDir, { recursive: true })

    const filename = this.resolveFilename(item, file)
    const filePath = join(downloadDir, filename)

    const response = await fetch(file.url)
    if (!response.ok) {
      throw new Error(`Failed to download from Torbox: ${response.status} ${response.statusText}`)
    }

    const buffer = await response.arrayBuffer()
    await fs.writeFile(filePath, Buffer.from(buffer))

    const metadataPath = filePath.replace(/\.[^.]+$/, '.json')
    await fs.writeFile(
      metadataPath,
      JSON.stringify(
        {
          owner: item.owner,
          caption: item.caption,
          keywords: item.keywords,
          addedAt: item.addedAt,
          source: item.url,
          thumbnail: item.thumbnail,
          torboxJobId: item.jobId,
          torboxJobHash: item.jobHash,
        },
        null,
        2
      )
    )

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