import { contextBridge, ipcRenderer } from 'electron'

// Instagram content script communication
contextBridge.exposeInMainWorld('instagramAPI', {
  extractReels: () => {
    // This function will be called from the main process
    // The actual extraction will be handled by the main process injecting JavaScript
  },

  sendToMain: (channel: string, data: any) => {
    ipcRenderer.sendToHost(channel, data)
  },

  // Helper function to check if page has loaded properly
  isPageReady: () => {
    return document.readyState === 'complete' && 
           document.querySelector('body') !== null
  },

  // Helper function to wait for elements
  waitForElement: (selector: string, timeout = 5000) => {
    return new Promise((resolve) => {
      const startTime = Date.now()
      
      function check() {
        const element = document.querySelector(selector)
        if (element) {
          resolve(element)
          return
        }
        
        if (Date.now() - startTime > timeout) {
          resolve(null)
          return
        }
        
        setTimeout(check, 100)
      }
      
      check()
    })
  }
})