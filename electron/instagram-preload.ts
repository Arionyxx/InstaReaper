import { contextBridge, ipcRenderer } from 'electron'

// Instagram content script communication
contextBridge.exposeInMainWorld('instagramAPI', {
  extractReels: () => {
    // This function will be called from the main process
    // The actual extraction will be handled by the main process injecting JavaScript
  },

  sendToMain: (channel: string, data: any) => {
    ipcRenderer.sendToHost(channel, data)
  }
})