import { app, BrowserWindow, ipcMain, dialog, shell, BrowserView } from 'electron'
import { join } from 'path'
import Store from 'electron-store'
import { 
  testConnection, 
  addUrl, 
  getStatus, 
  getFileLinks, 
  cancelTransfer, 
  listTransfers 
} from './torbox-api'
import { DownloadQueue } from './download-queue'
import { SettingsService, SettingsError } from './settings-service'

const store = new Store()
const settingsService = new SettingsService(store)
const downloadQueue = new DownloadQueue(store)
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged
const rendererDevServerUrl = process.env.VITE_DEV_SERVER_URL ?? process.env.ELECTRON_RENDERER_URL
let devContentSecurityPolicyConfigured = false

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
  ipcMain.handle('torbox:testConnection', async (_, apiKey: string) => {
    return await testConnection(apiKey)
  })

  ipcMain.handle('torbox:addUrl', async (_, url: string) => {
    const apiKey = settingsService.getTorboxApiKey()
    if (!apiKey) {
      throw new Error('Torbox API key not configured')
    }
    return await addUrl(url, apiKey)
  })

  ipcMain.handle('torbox:getStatus', async (_, jobId: string) => {
    const apiKey = settingsService.getTorboxApiKey()
    if (!apiKey) {
      throw new Error('Torbox API key not configured')
    }
    return await getStatus(jobId, apiKey)
  })

  ipcMain.handle('torbox:getFileLinks', async (_, jobId: string) => {
    const apiKey = settingsService.getTorboxApiKey()
    if (!apiKey) {
      throw new Error('Torbox API key not configured')
    }
    return await getFileLinks(jobId, apiKey)
  })

  ipcMain.handle('torbox:cancel', async (_, jobId: string) => {
    const apiKey = settingsService.getTorboxApiKey()
    if (!apiKey) {
      throw new Error('Torbox API key not configured')
    }
    return await cancelTransfer(jobId, apiKey)
  })

  ipcMain.handle('torbox:list', async () => {
    const apiKey = settingsService.getTorboxApiKey()
    if (!apiKey) {
      throw new Error('Torbox API key not configured')
    }
    return await listTransfers(apiKey)
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

  ipcMain.handle('instagram:create', () => {
    if (instagramView) {
      instagramView.webContents.close()
    }

    instagramView = new BrowserView({
      webPreferences: {
        preload: join(__dirname, 'instagram-preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
      },
    })

    mainWindow.addBrowserView(instagramView)
    instagramView.setBounds({ x: 200, y: 100, width: 800, height: 600 })
    instagramView.webContents.loadURL('https://www.instagram.com')

    instagramView.webContents.on('did-navigate', () => {
      mainWindow.webContents.send('instagram:navigated', instagramView?.webContents.getURL())
    })

    return true
  })

  ipcMain.handle('instagram:destroy', () => {
    if (instagramView) {
      mainWindow.removeBrowserView(instagramView)
      instagramView.webContents.close()
      instagramView = null
    }
    return true
  })

  ipcMain.handle('instagram:extract', async () => {
    if (instagramView) {
      const script = `
        (function() {
          function extractReelsFromPage() {
            const reels = [];
            
            // Look for reel elements in current page
            const reelElements = document.querySelectorAll('article');
            
            reelElements.forEach((element, index) => {
              try {
                // Get the video element
                const videoElement = element.querySelector('video');
                if (!videoElement) return;
                
                // Get the link to the reel
                const linkElement = element.querySelector('a[href*="/reel/"]');
                if (!linkElement) return;
                
                const reelUrl = linkElement.href;
                const reelId = reelUrl.match(/\\/reel\\/([^/]+)/)?.[1];
                
                if (!reelId) return;
                
                // Get owner information
                const ownerElement = element.querySelector('a[href*="/"]');
                const owner = ownerElement?.textContent?.trim() || 'unknown';
                
                // Get caption
                const captionElement = element.querySelector('h1, div[dir="auto"]');
                const caption = captionElement?.textContent?.trim() || '';
                
                // Get thumbnail from video poster
                const thumbnail = videoElement.poster || '';
                
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
          
          // Send reels to main process
          const reels = extractReelsFromPage();
          if (reels.length > 0) {
            // Send via IPC to main process
            require('electron').ipcRenderer.sendToHost('instagram:reels-found', reels);
          }
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
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  // Note: saveQueue is private, but the queue is automatically saved on changes
})