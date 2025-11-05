import { app, BrowserWindow, ipcMain, dialog, shell, BrowserView } from 'electron'
import { join } from 'path'
import Store from 'electron-store'
import { z } from 'zod'
import {
  testConnection,
  addUrl,
  getStatus,
  getFileLinks,
  cancelTransfer,
  listTransfers,
  TorboxClientConfig,
  TorboxJobReference,
  TorboxResult,
} from './torbox-api'
import { DownloadQueue } from './download-queue'
import { SettingsService, SettingsError } from './settings-service'

const store = new Store()
const settingsService = new SettingsService(store)
const downloadQueue = new DownloadQueue(store, settingsService)
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged
const rendererDevServerUrl = process.env.VITE_DEV_SERVER_URL ?? process.env.ELECTRON_RENDERER_URL
let devContentSecurityPolicyConfigured = false

const TorboxAddUrlSchema = z.object({
  url: z.string().trim().url(),
  name: z.string().trim().optional(),
})

const TorboxJobReferenceSchema = z
  .object({
    jobId: z.string().trim().min(1).optional(),
    jobHash: z.string().trim().min(1).optional().nullable(),
  })
  .refine((value) => Boolean(value.jobId || value.jobHash), {
    message: 'Provide a jobId or jobHash',
  })

const TorboxTestConnectionSchema = z.object({
  apiKey: z.string().trim().min(1).optional(),
  baseUrl: z.string().trim().url().optional(),
})

type TorboxJobReferenceInput = z.infer<typeof TorboxJobReferenceSchema>

function buildTorboxConfig(overrides?: Partial<TorboxClientConfig>): TorboxClientConfig {
  return {
    apiKey: overrides?.apiKey ?? settingsService.getTorboxApiKey(),
    baseUrl: overrides?.baseUrl ?? settingsService.getTorboxApiBaseUrl(),
  }
}

function torboxValidationError(message: string, details: unknown): TorboxResult<never> {
  return {
    ok: false,
    error: {
      code: 'TORBOX_BAD_REQUEST',
      message,
      details,
    },
  }
}

function toJobReference(input: TorboxJobReferenceInput): TorboxJobReference {
  return {
    jobId: input.jobId ?? '',
    jobHash: input.jobHash ?? undefined,
  }
}

function createWindow(): BrowserWindow {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (isDev) {
    const devServerUrl = rendererDevServerUrl ?? 'http://localhost:5173'

    try {
      const rendererOrigin = new URL(devServerUrl).origin
      const wsOrigin = rendererOrigin.replace(/^http/, 'ws')
      const devCspDirectives = [
        `default-src 'self' ${rendererOrigin}`,
        `script-src 'self' 'unsafe-inline' 'unsafe-eval' ${rendererOrigin}`,
        `style-src 'self' 'unsafe-inline' ${rendererOrigin}`,
        "img-src 'self' data: blob: https:",
        `connect-src 'self' ${rendererOrigin} ${wsOrigin} https:`,
        "frame-src https://www.instagram.com",
        "font-src 'self' data:",
      ].join('; ')

      if (!devContentSecurityPolicyConfigured) {
        mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
          const responseHeaders = { ...(details.responseHeaders ?? {}) }
          if (details.resourceType === 'mainFrame') {
            responseHeaders['Content-Security-Policy'] = [devCspDirectives]
          }
          callback({ responseHeaders })
        })
        devContentSecurityPolicyConfigured = true
      }
    } catch (error) {
      console.warn('Failed to configure development CSP', error)
    }

    mainWindow.loadURL(devServerUrl)
  } else {
    mainWindow.loadFile(join(__dirname, '../dist/index.html'))
  }

  return mainWindow
}

let mainWindow: BrowserWindow

app.whenReady().then(() => {
  mainWindow = createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })

  // Settings IPC handlers
  ipcMain.handle('settings:get', () => {
    return settingsService.getSettings()
  })

  ipcMain.handle('settings:set', (_, settings) => {
    return settingsService.updateSettings(settings)
  })

  ipcMain.handle('dialog:selectFolder', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
      title: 'Select Download Directory',
    })
    if (result.canceled || !result.filePaths.length) {
      return null
    }
    return result.filePaths[0]
  })

  // Torbox API IPC handlers
  ipcMain.handle('torbox:testConnection', async (_, payload: unknown) => {
    const parsed = TorboxTestConnectionSchema.safeParse(payload ?? {})
    if (!parsed.success) {
      return torboxValidationError('Invalid payload for torbox:testConnection', parsed.error.flatten())
    }

    const overrides: Partial<TorboxClientConfig> = {}
    if (parsed.data.apiKey) overrides.apiKey = parsed.data.apiKey
    if (parsed.data.baseUrl) overrides.baseUrl = parsed.data.baseUrl

    const config = buildTorboxConfig(overrides)
    return await testConnection(config)
  })

  ipcMain.handle('torbox:addUrl', async (_, payload: unknown) => {
    const parsed = TorboxAddUrlSchema.safeParse(payload)
    if (!parsed.success) {
      return torboxValidationError('Invalid payload for torbox:addUrl', parsed.error.flatten())
    }

    const config = buildTorboxConfig()
    return await addUrl(config, parsed.data)
  })

  ipcMain.handle('torbox:getStatus', async (_, payload: unknown) => {
    const parsed = TorboxJobReferenceSchema.safeParse(payload)
    if (!parsed.success) {
      return torboxValidationError('Invalid payload for torbox:getStatus', parsed.error.flatten())
    }

    const config = buildTorboxConfig()
    return await getStatus(config, toJobReference(parsed.data))
  })

  ipcMain.handle('torbox:getFileLinks', async (_, payload: unknown) => {
    const parsed = TorboxJobReferenceSchema.safeParse(payload)
    if (!parsed.success) {
      return torboxValidationError('Invalid payload for torbox:getFileLinks', parsed.error.flatten())
    }

    const config = buildTorboxConfig()
    return await getFileLinks(config, toJobReference(parsed.data))
  })

  ipcMain.handle('torbox:cancel', async (_, payload: unknown) => {
    const parsed = TorboxJobReferenceSchema.safeParse(payload)
    if (!parsed.success) {
      return torboxValidationError('Invalid payload for torbox:cancel', parsed.error.flatten())
    }

    const config = buildTorboxConfig()
    return await cancelTransfer(config, toJobReference(parsed.data))
  })

  ipcMain.handle('torbox:list', async () => {
    const config = buildTorboxConfig()
    return await listTransfers(config)
  })

  // Download queue IPC handlers
  ipcMain.handle('queue:get', () => {
    return downloadQueue.getQueue()
  })

  ipcMain.handle('queue:add', async (_, items: any[]) => {
    return await downloadQueue.addToQueue(items)
  })

  ipcMain.handle('queue:pause', (_, itemId: string) => {
    return downloadQueue.pauseItem(itemId)
  })

  ipcMain.handle('queue:resume', (_, itemId: string) => {
    return downloadQueue.resumeItem(itemId)
  })

  ipcMain.handle('queue:cancel', (_, itemId: string) => {
    return downloadQueue.cancelItem(itemId)
  })

  ipcMain.handle('queue:retry', (_, itemId: string) => {
    return downloadQueue.retryItem(itemId)
  })

  // Library IPC handlers
  ipcMain.handle('library:scan', async () => {
    try {
      const downloadDir = settingsService.requireDownloadDir()
      return await downloadQueue.scanLibrary(downloadDir)
    } catch (error) {
      if (error instanceof Error && error.message.includes(SettingsError.DOWNLOAD_DIR_MISSING)) {
        throw error // Re-throw with the structured error
      }
      throw error
    }
  })

  ipcMain.handle('library:delete', async (_, item: any) => {
    return await downloadQueue.deleteLibraryItem(item)
  })

  // Instagram browser handlers
  let instagramView: BrowserView | null = null
  let instagramLoadTimeout: NodeJS.Timeout | null = null
  let isLoadingInstagram = false

  // Modern Chrome User Agent to avoid blocking
  const CHROME_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

  ipcMain.handle('instagram:create', () => {
    if (instagramView) {
      instagramView.webContents.close()
    }

    isLoadingInstagram = true
    
    // Create BrowserView with persistent session and secure settings
    instagramView = new BrowserView({
      webPreferences: {
        preload: join(__dirname, 'instagram-preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        webSecurity: true,
        partition: 'persist:instagram', // Persistent session for login cookies
      },
    })

    // Set user agent to avoid Instagram blocking
    instagramView.webContents.setUserAgent(CHROME_USER_AGENT)

    mainWindow.addBrowserView(instagramView)
    instagramView.setBounds({ x: 200, y: 100, width: 800, height: 600 })
    
    // Handle window opening - open external links in system browser
    instagramView.webContents.setWindowOpenHandler(({ url }) => {
      shell.openExternal(url)
      return { action: 'deny' }
    })

    // Set up loading timeout detection
    instagramLoadTimeout = setTimeout(() => {
      if (isLoadingInstagram && instagramView) {
        isLoadingInstagram = false
        mainWindow.webContents.send('instagram:load-timeout')
      }
    }, 10000) // 10 second timeout

    instagramView.webContents.loadURL('https://www.instagram.com')

    // Handle navigation events
    instagramView.webContents.on('did-navigate', () => {
      mainWindow.webContents.send('instagram:navigated', instagramView?.webContents.getURL())
    })

    // Handle page load completion
    instagramView.webContents.on('did-finish-load', () => {
      if (instagramLoadTimeout) {
        clearTimeout(instagramLoadTimeout)
        instagramLoadTimeout = null
      }
      isLoadingInstagram = false
      mainWindow.webContents.send('instagram:loaded')
    })

    // Handle load failures
    instagramView.webContents.on('did-fail-load', (_, errorCode, errorDescription) => {
      if (instagramLoadTimeout) {
        clearTimeout(instagramLoadTimeout)
        instagramLoadTimeout = null
      }
      isLoadingInstagram = false
      mainWindow.webContents.send('instagram:load-error', { errorCode, errorDescription })
    })

    return true
  })

  ipcMain.handle('instagram:destroy', () => {
    if (instagramLoadTimeout) {
      clearTimeout(instagramLoadTimeout)
      instagramLoadTimeout = null
    }
    
    if (instagramView) {
      mainWindow.removeBrowserView(instagramView)
      instagramView.webContents.close()
      instagramView = null
    }
    
    isLoadingInstagram = false
    return true
  })

  ipcMain.handle('instagram:extract', async () => {
    if (instagramView) {
      const script = `
        (function() {
          // Wait for critical selectors to be available
          function waitForElements(selector, timeout = 5000) {
            return new Promise((resolve) => {
              const startTime = Date.now();
              
              function check() {
                const elements = document.querySelectorAll(selector);
                if (elements.length > 0) {
                  resolve(elements);
                  return;
                }
                
                if (Date.now() - startTime > timeout) {
                  resolve([]);
                  return;
                }
                
                setTimeout(check, 100);
              }
              
              check();
            });
          }
          
          async function extractReelsFromPage() {
            const reels = [];
            
            // Wait for reel links to be available (handles SPA navigation)
            await waitForElements('a[href^="/reel/"]', 3000);
            
            // Look for reel elements with better selectors
            const reelLinks = document.querySelectorAll('a[href^="/reel/"]');
            
            reelLinks.forEach((linkElement) => {
              try {
                const reelUrl = linkElement.href;
                const reelId = reelUrl.match(/\\/reel\\/([^/?]+)/)?.[1];
                
                if (!reelId) return;
                
                // Find the parent article/container
                const container = linkElement.closest('article, div[role="button"], div[data-pressable-container]');
                if (!container) return;
                
                // Get the video element for thumbnail
                const videoElement = container.querySelector('video');
                
                // Get owner information - try multiple selectors
                let owner = 'unknown';
                const ownerSelectors = [
                  'a[href*="/"] span',
                  'a[href*="/"]',
                  '[data-visualcompletion="ignore-dynamic"] span',
                  'span[dir="auto"]'
                ];
                
                for (const selector of ownerSelectors) {
                  const element = container.querySelector(selector);
                  if (element && element.textContent && element.textContent.trim()) {
                    const text = element.textContent.trim();
                    if (!text.includes('•') && text.length > 0 && text.length < 50) {
                      owner = text.startsWith('@') ? text.substring(1) : text;
                      break;
                    }
                  }
                }
                
                // Get caption - look for text content near the reel
                let caption = '';
                const captionSelectors = [
                  'h1',
                  'div[dir="auto"]',
                  'span[dir="auto"]',
                  '[data-visualcompletion="ignore-dynamic"]'
                ];
                
                for (const selector of captionSelectors) {
                  const element = container.querySelector(selector);
                  if (element && element.textContent && element.textContent.trim()) {
                    const text = element.textContent.trim();
                    if (text.length > 10 && !text.includes('Follow') && !text.includes('Like')) {
                      caption = text;
                      break;
                    }
                  }
                }
                
                // Get thumbnail from video poster or fallback
                let thumbnail = '';
                if (videoElement) {
                  thumbnail = videoElement.poster || videoElement.getAttribute('src') || '';
                }
                
                // Try to get thumbnail from image elements as fallback
                if (!thumbnail) {
                  const imgElement = container.querySelector('img');
                  if (imgElement && imgElement.src && !imgElement.src.includes('profile')) {
                    thumbnail = imgElement.src;
                  }
                }
                
                reels.push({
                  id: reelId,
                  url: reelUrl,
                  owner: owner,
                  caption: caption.substring(0, 200), // Limit caption length
                  thumbnail: thumbnail
                });
              } catch (error) {
                console.error('Error extracting reel:', error);
              }
            });
            
            return reels;
          }
          
          // Extract and send reels to main process
          extractReelsFromPage().then(reels => {
            if (reels.length > 0) {
              require('electron').ipcRenderer.sendToHost('instagram:reels-found', reels);
            } else {
              require('electron').ipcRenderer.sendToHost('instagram:reels-found', []);
            }
          }).catch(error => {
            console.error('Error in reel extraction:', error);
            require('electron').ipcRenderer.sendToHost('instagram:extraction-error', error.message);
          });
        })();
      `
      
      await instagramView.webContents.executeJavaScript(script)
    }
    return true
  })

  // Handle reels found from Instagram
  ipcMain.on('instagram:reels-found', (_, reels) => {
    mainWindow.webContents.send('reels:found', reels)
  })

  // Handle extraction errors
  ipcMain.on('instagram:extraction-error', (_, error) => {
    mainWindow.webContents.send('instagram:extraction-error', error)
  })

  // Open Instagram in system browser
  ipcMain.handle('instagram:openInBrowser', () => {
    shell.openExternal('https://www.instagram.com')
    return true
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  // Note: saveQueue is private, but the queue is automatically saved on changes
})