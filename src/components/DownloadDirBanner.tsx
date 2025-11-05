import React from 'react'
import { useSettings } from '@/contexts/SettingsContext'
import { useToast } from '@/contexts/ToastContext'
import { FolderOpen, AlertTriangle } from 'lucide-react'

export function DownloadDirBanner() {
  const { updateSettings, isDownloadDirConfigured } = useSettings()
  const { addToast } = useToast()

  if (isDownloadDirConfigured) {
    return null
  }

  const handleSelectFolder = async () => {
    try {
      const selectedPath = await window.electronAPI.dialog.selectFolder()
      if (selectedPath) {
        await updateSettings({ downloadDir: selectedPath })
        addToast({
          type: 'success',
          message: 'Download directory selected successfully',
        })
      }
    } catch (error) {
      addToast({
        type: 'error',
        message: 'Failed to select download directory',
      })
    }
  }

  return (
    <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4 mb-6">
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0">
          <AlertTriangle className="w-5 h-5 text-yellow-500 mt-0.5" />
        </div>
        
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-yellow-500 mb-1">
            Download Directory Required
          </h3>
          <p className="text-sm text-yellow-400 mb-3">
            Choose a folder where your downloaded Instagram reels will be saved. 
            This is required before you can scan your library or start downloads.
          </p>
          
          <div className="flex items-center gap-3">
            <button
              onClick={handleSelectFolder}
              className="btn-primary bg-yellow-600 hover:bg-yellow-700 text-white flex items-center gap-2"
            >
              <FolderOpen className="w-4 h-4" />
              Choose Folder
            </button>
            
            <button
              onClick={() => window.location.href = '/settings'}
              className="btn-secondary text-yellow-400 border-yellow-500/30 hover:bg-yellow-500/10"
            >
              Open Settings
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}