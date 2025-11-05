import React, { useState, useEffect } from 'react'
import { Reel } from '@/types'
import { useToast } from '@/contexts/ToastContext'
import { useSettings } from '@/contexts/SettingsContext'
import { DownloadDirBanner } from '@/components/DownloadDirBanner'
import { 
  Search, 
  Download, 
  Filter,
  CheckSquare,
  Square,
  Loader2,
  Play,
  ExternalLink,
  Grid3X3,
  List,
  Globe,
  AlertTriangle,
  RefreshCw
} from 'lucide-react'

export function Scraper() {
  const [reels, setReels] = useState<Reel[]>([])
  const [selectedReels, setSelectedReels] = useState<Set<string>>(new Set())
  const [keywords, setKeywords] = useState('')
  const [filteredReels, setFilteredReels] = useState<Reel[]>([])
  const [loading, setLoading] = useState(false)
  const [extracting, setExtracting] = useState(false)
  const [browserOpen, setBrowserOpen] = useState(false)
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [instagramLoading, setInstagramLoading] = useState(false)
  const [instagramError, setInstagramError] = useState<string | null>(null)
  const [showTimeoutFallback, setShowTimeoutFallback] = useState(false)
  const { addToast } = useToast()
  const { isDownloadDirConfigured } = useSettings()

  useEffect(() => {
    // Listen for reels found from Instagram
    window.electronAPI.onReelsFound((foundReels) => {
      setReels(foundReels)
      setExtracting(false)
      addToast({
        type: 'success',
        message: `Found ${foundReels.length} reels`,
      })
    })

    // Listen for Instagram loaded successfully
    window.electronAPI.onInstagramLoaded(() => {
      setInstagramLoading(false)
      setInstagramError(null)
      setShowTimeoutFallback(false)
      addToast({
        type: 'success',
        message: 'Instagram loaded successfully',
      })
    })

    // Listen for Instagram load timeout
    window.electronAPI.onInstagramLoadTimeout(() => {
      setInstagramLoading(false)
      setShowTimeoutFallback(true)
      addToast({
        type: 'warning',
        message: 'Instagram is taking too long to load. You can try opening in your system browser.',
      })
    })

    // Listen for Instagram load errors
    window.electronAPI.onInstagramLoadError((error) => {
      setInstagramLoading(false)
      setInstagramError(`Failed to load Instagram: ${error.errorDescription}`)
      addToast({
        type: 'error',
        message: `Failed to load Instagram: ${error.errorDescription}`,
      })
    })

    // Listen for extraction errors
    window.electronAPI.onInstagramExtractionError((error) => {
      setExtracting(false)
      addToast({
        type: 'error',
        message: `Extraction failed: ${error}`,
      })
    })

    return () => {
      window.electronAPI.removeAllListeners('reels:found')
      window.electronAPI.removeAllListeners('instagram:loaded')
      window.electronAPI.removeAllListeners('instagram:load-timeout')
      window.electronAPI.removeAllListeners('instagram:load-error')
      window.electronAPI.removeAllListeners('instagram:extraction-error')
    }
  }, [addToast])

  useEffect(() => {
    filterReels()
  }, [reels, keywords]) // eslint-disable-line react-hooks/exhaustive-deps

  const filterReels = () => {
    if (!keywords.trim()) {
      setFilteredReels(reels)
      return
    }

    const keywordList = keywords.toLowerCase()
      .split(/[\s,]+/)
      .filter(k => k.length > 0)

    const filtered = reels.filter(reel => {
      const searchText = `${reel.owner} ${reel.caption}`.toLowerCase()
      return keywordList.some(keyword => 
        searchText.includes(keyword)
      )
    })

    setFilteredReels(filtered)
  }

  const openInstagramBrowser = async () => {
    try {
      setInstagramLoading(true)
      setInstagramError(null)
      setShowTimeoutFallback(false)
      await window.electronAPI.instagram.create()
      setBrowserOpen(true)
      addToast({
        type: 'info',
        message: 'Opening Instagram browser... This may take a moment.',
      })
    } catch (error) {
      setInstagramLoading(false)
      addToast({
        type: 'error',
        message: 'Failed to open Instagram browser',
      })
    }
  }

  const closeInstagramBrowser = async () => {
    try {
      await window.electronAPI.instagram.destroy()
      setBrowserOpen(false)
      setInstagramLoading(false)
      setInstagramError(null)
      setShowTimeoutFallback(false)
      setReels([])
      setSelectedReels(new Set())
    } catch (error) {
      addToast({
        type: 'error',
        message: 'Failed to close Instagram browser',
      })
    }
  }

  const extractFromCurrentPage = async () => {
    try {
      setExtracting(true)
      await window.electronAPI.instagram.extract()
    } catch (error) {
      addToast({
        type: 'error',
        message: 'Failed to extract reels from current page',
      })
    }
  }

  const openInstagramInSystemBrowser = async () => {
    try {
      await window.electronAPI.instagram.openInBrowser()
      addToast({
        type: 'info',
        message: 'Opening Instagram in your system browser...',
      })
    } catch (error) {
      addToast({
        type: 'error',
        message: 'Failed to open Instagram in system browser',
      })
    }
  }

  const toggleReelSelection = (reelId: string) => {
    const newSelected = new Set(selectedReels)
    if (newSelected.has(reelId)) {
      newSelected.delete(reelId)
    } else {
      newSelected.add(reelId)
    }
    setSelectedReels(newSelected)
  }

  const selectAll = () => {
    if (selectedReels.size === filteredReels.length) {
      setSelectedReels(new Set())
    } else {
      setSelectedReels(new Set(filteredReels.map(r => r.id)))
    }
  }

  const downloadSelected = async () => {
    if (selectedReels.size === 0) {
      addToast({
        type: 'error',
        message: 'No reels selected',
      })
      return
    }

    if (!isDownloadDirConfigured) {
      addToast({
        type: 'error',
        message: 'Please choose a download folder in Settings first',
      })
      return
    }

    try {
      setLoading(true)
      const reelsToDownload = filteredReels.filter(r => selectedReels.has(r.id))
      
      // Add to queue
      await window.electronAPI.queue.add(reelsToDownload.map(reel => ({
        url: reel.url,
        owner: reel.owner,
        caption: reel.caption,
        thumbnail: reel.thumbnail,
        keywords: keywords.split(/[\s,]+/).filter(k => k.length > 0),
      })))

      addToast({
        type: 'success',
        message: `Added ${selectedReels.size} reels to download queue`,
      })

      // Clear selection
      setSelectedReels(new Set())
    } catch (error) {
      if (error instanceof Error && error.message.includes('DOWNLOAD_DIR_MISSING')) {
        addToast({
          type: 'error',
          message: 'Please choose a download folder in Settings',
        })
      } else {
        addToast({
          type: 'error',
          message: 'Failed to add reels to queue',
        })
      }
    } finally {
      setLoading(false)
    }
  }

  const formatCaption = (caption: string) => {
    return caption.length > 100 ? caption.substring(0, 100) + '...' : caption
  }

  return (
    <div className="space-y-6">
      <DownloadDirBanner />
      
      {/* Controls */}
      <div className="glass-dark rounded-xl p-6">
        <div className="flex flex-col gap-4">
          {/* Instagram Browser Controls */}
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold mb-2">Instagram Browser</h3>
                <p className="text-sm text-neutral-400">
                  Open Instagram to extract reels from your feed or profile
                </p>
              </div>
              <div className="flex gap-3">
                {!browserOpen ? (
                  <button
                    onClick={openInstagramBrowser}
                    disabled={instagramLoading}
                    className="btn-primary flex items-center gap-2 disabled:opacity-50"
                  >
                    {instagramLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Play className="w-4 h-4" />
                    )}
                    {instagramLoading ? 'Loading...' : 'Open Instagram'}
                  </button>
                ) : (
                  <>
                    <button
                      onClick={extractFromCurrentPage}
                      disabled={extracting}
                      className="btn-secondary flex items-center gap-2 disabled:opacity-50"
                    >
                      {extracting ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Search className="w-4 h-4" />
                      )}
                      Extract from current page
                    </button>
                    <button
                      onClick={closeInstagramBrowser}
                      className="btn-secondary"
                    >
                      Close
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Loading State */}
            {instagramLoading && (
              <div className="flex items-center gap-3 p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                <Loader2 className="w-4 h-4 animate-spin text-blue-400" />
                <span className="text-sm text-blue-300">Loading Instagram...</span>
              </div>
            )}

            {/* Error State */}
            {instagramError && (
              <div className="flex items-start gap-3 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                <AlertTriangle className="w-4 h-4 text-red-400 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm text-red-300">{instagramError}</p>
                  <div className="flex gap-2 mt-2">
                    <button
                      onClick={openInstagramBrowser}
                      className="text-xs btn-secondary py-1 px-2"
                    >
                      <RefreshCw className="w-3 h-3 inline mr-1" />
                      Retry
                    </button>
                    <button
                      onClick={openInstagramInSystemBrowser}
                      className="text-xs btn-secondary py-1 px-2"
                    >
                      <Globe className="w-3 h-3 inline mr-1" />
                      Open in Browser
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Timeout Fallback */}
            {showTimeoutFallback && (
              <div className="flex items-start gap-3 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
                <AlertTriangle className="w-4 h-4 text-yellow-400 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm text-yellow-300">
                    Instagram is taking longer than expected to load. This can happen due to network issues or Instagram's anti-bot measures.
                  </p>
                  <div className="flex gap-2 mt-2">
                    <button
                      onClick={openInstagramInSystemBrowser}
                      className="text-xs btn-primary py-1 px-2"
                    >
                      <Globe className="w-3 h-3 inline mr-1" />
                      Open in System Browser
                    </button>
                    <button
                      onClick={openInstagramBrowser}
                      className="text-xs btn-secondary py-1 px-2"
                    >
                      <RefreshCw className="w-3 h-3 inline mr-1" />
                      Try Again
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* System Browser Action */}
            {!browserOpen && !instagramLoading && (
              <div className="flex items-center justify-center p-3 bg-neutral-700/30 rounded-lg">
                <p className="text-sm text-neutral-400 mr-3">
                  Having trouble with the embedded browser?
                </p>
                <button
                  onClick={openInstagramInSystemBrowser}
                  className="text-sm btn-secondary py-1 px-3 flex items-center gap-1"
                >
                  <Globe className="w-3 h-3" />
                  Open Instagram in Browser
                </button>
              </div>
            )}
          </div>

          {/* Keyword Filter */}
          <div>
            <label className="block text-sm font-medium mb-2">Filter by Keywords</label>
            <div className="flex gap-3">
              <input
                type="text"
                value={keywords}
                onChange={(e) => setKeywords(e.target.value)}
                placeholder="Enter keywords separated by spaces or commas"
                className="flex-1 input"
              />
              <div className="flex items-center gap-2 text-sm text-neutral-400">
                <Filter className="w-4 h-4" />
                {filteredReels.length} of {reels.length} reels
              </div>
            </div>
          </div>

          {/* Selection Controls */}
          {filteredReels.length > 0 && (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <button
                  onClick={selectAll}
                  className="btn-secondary flex items-center gap-2"
                >
                  {selectedReels.size === filteredReels.length ? (
                    <CheckSquare className="w-4 h-4" />
                  ) : (
                    <Square className="w-4 h-4" />
                  )}
                  {selectedReels.size === filteredReels.length ? 'Deselect All' : 'Select All'}
                </button>
                <span className="text-sm text-neutral-400">
                  {selectedReels.size} selected
                </span>
              </div>

              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setViewMode('grid')}
                    className={`p-2 rounded ${viewMode === 'grid' ? 'bg-primary-600' : 'hover:bg-white/10'}`}
                  >
                    <Grid3X3 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setViewMode('list')}
                    className={`p-2 rounded ${viewMode === 'list' ? 'bg-primary-600' : 'hover:bg-white/10'}`}
                  >
                    <List className="w-4 h-4" />
                  </button>
                </div>

                <button
                  onClick={downloadSelected}
                  disabled={selectedReels.size === 0 || loading || !isDownloadDirConfigured}
                  className="btn-primary flex items-center gap-2 disabled:opacity-50"
                >
                  {loading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Download className="w-4 h-4" />
                  )}
                  Download Selected ({selectedReels.size})
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Reels Grid/List */}
      {filteredReels.length > 0 ? (
        <div className={viewMode === 'grid' ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4' : 'space-y-4'}>
          {filteredReels.map((reel) => (
            <div
              key={reel.id}
              className={`card cursor-pointer transition-all ${
                selectedReels.has(reel.id) ? 'ring-2 ring-primary-500' : ''
              }`}
              onClick={() => toggleReelSelection(reel.id)}
            >
              <div className="flex gap-4">
                {/* Thumbnail */}
                <div className="relative flex-shrink-0">
                  {reel.thumbnail ? (
                    <img
                      src={reel.thumbnail}
                      alt={reel.owner}
                      className="w-24 h-24 object-cover rounded-lg"
                    />
                  ) : (
                    <div className="w-24 h-24 bg-neutral-700 rounded-lg flex items-center justify-center">
                      <Play className="w-8 h-8 text-neutral-500" />
                    </div>
                  )}
                  <div className="absolute top-2 left-2">
                    <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${
                      selectedReels.has(reel.id)
                        ? 'bg-primary-600 border-primary-600'
                        : 'bg-black/50 border-white/50'
                    }`}>
                      {selectedReels.has(reel.id) && (
                        <CheckSquare className="w-3 h-3 text-white" />
                      )}
                    </div>
                  </div>
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-primary-400 truncate">
                    @{reel.owner}
                  </div>
                  <div className="text-sm text-neutral-400 mt-1 line-clamp-2">
                    {formatCaption(reel.caption)}
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <a
                      href={reel.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-primary-400 hover:text-primary-300 flex items-center gap-1"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <ExternalLink className="w-3 h-3" />
                      Open
                    </a>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="glass-dark rounded-xl p-12 text-center">
          <div className="max-w-md mx-auto">
            <div className="w-16 h-16 bg-neutral-700 rounded-full flex items-center justify-center mx-auto mb-4">
              <Search className="w-8 h-8 text-neutral-500" />
            </div>
            <h3 className="text-xl font-semibold mb-2">No reels found</h3>
            <p className="text-neutral-400 mb-4">
              {browserOpen 
                ? 'Navigate to Instagram reels and click "Extract from current page" to find reels'
                : 'Open the Instagram browser to start extracting reels'
              }
            </p>
            {!browserOpen && (
              <div className="flex flex-col gap-2">
                <button
                  onClick={openInstagramBrowser}
                  disabled={instagramLoading}
                  className="btn-primary mx-auto flex items-center gap-2"
                >
                  <Play className="w-4 h-4" />
                  {instagramLoading ? 'Loading...' : 'Open Instagram Browser'}
                </button>
                <button
                  onClick={openInstagramInSystemBrowser}
                  className="btn-secondary mx-auto flex items-center gap-2 text-sm"
                >
                  <Globe className="w-4 h-4" />
                  Open in System Browser
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}