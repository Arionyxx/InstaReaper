import React, { useState, useEffect } from 'react'
import { LibraryItem } from '@/types'
import { useToast } from '@/contexts/ToastContext'
import { 
  Play, 
  Trash2, 
  Search, 
  Filter,
  Grid3X3,
  List,
  Download,
  Eye,
  X,
  Loader2
} from 'lucide-react'

export function Library() {
  const [library, setLibrary] = useState<LibraryItem[]>([])
  const [filteredLibrary, setFilteredLibrary] = useState<LibraryItem[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [keywordFilter, setKeywordFilter] = useState('')
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [selectedItem, setSelectedItem] = useState<LibraryItem | null>(null)
  const [loading, setLoading] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const { addToast } = useToast()

  useEffect(() => {
    scanLibrary()
  }, [])

  useEffect(() => {
    filterLibrary()
  }, [library, searchTerm, keywordFilter])

  const scanLibrary = async () => {
    try {
      setLoading(true)
      const items = await window.electronAPI.library.scan()
      setLibrary(items)
    } catch (error) {
      addToast({
        type: 'error',
        message: 'Failed to scan library',
      })
    } finally {
      setLoading(false)
    }
  }

  const filterLibrary = () => {
    let filtered = [...library]

    // Apply search filter
    if (searchTerm.trim()) {
      const search = searchTerm.toLowerCase()
      filtered = filtered.filter(item =>
        item.owner.toLowerCase().includes(search) ||
        item.caption.toLowerCase().includes(search) ||
        item.filename.toLowerCase().includes(search)
      )
    }

    // Apply keyword filter
    if (keywordFilter.trim()) {
      const keywords = keywordFilter.toLowerCase().split(/[\s,]+/).filter(k => k.length > 0)
      filtered = filtered.filter(item =>
        keywords.some(keyword =>
          item.keywords.some(k => k.toLowerCase().includes(keyword))
        )
      )
    }

    setFilteredLibrary(filtered)
  }

  const deleteItem = async (item: LibraryItem) => {
    if (!confirm(`Are you sure you want to delete "${item.filename}"?`)) {
      return
    }

    try {
      setDeleting(item.id)
      const success = await window.electronAPI.library.delete(item)
      if (success) {
        setLibrary(library.filter(i => i.id !== item.id))
        addToast({
          type: 'success',
          message: 'File deleted successfully',
        })
      } else {
        addToast({
          type: 'error',
          message: 'Failed to delete file',
        })
      }
    } catch (error) {
      addToast({
        type: 'error',
        message: 'Failed to delete file',
      })
    } finally {
      setDeleting(null)
    }
  }

  const playVideo = (item: LibraryItem) => {
    setSelectedItem(item)
  }

  const formatFileSize = (bytes: number) => {
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(1024))
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString()
  }

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="glass-dark rounded-xl p-6">
        <div className="flex flex-col gap-4">
          {/* Search and Filters */}
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-neutral-500" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search by owner, caption, or filename..."
                  className="w-full pl-10 pr-4 py-2 input"
                />
              </div>
            </div>
            
            <div className="flex gap-3">
              <div className="relative">
                <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-neutral-500" />
                <input
                  type="text"
                  value={keywordFilter}
                  onChange={(e) => setKeywordFilter(e.target.value)}
                  placeholder="Filter by keywords..."
                  className="pl-10 pr-4 py-2 input"
                />
              </div>
              
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
            </div>
          </div>

          {/* Stats and Refresh */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <span className="text-sm text-neutral-400">
                {filteredLibrary.length} of {library.length} items
              </span>
              {library.length > 0 && (
                <span className="text-sm text-neutral-400">
                  Total size: {formatFileSize(library.reduce((sum, item) => sum + item.size, 0))}
                </span>
              )}
            </div>
            
            <button
              onClick={scanLibrary}
              disabled={loading}
              className="btn-secondary flex items-center gap-2 disabled:opacity-50"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Download className="w-4 h-4" />
              )}
              Refresh Library
            </button>
          </div>
        </div>
      </div>

      {/* Library Items */}
      {filteredLibrary.length > 0 ? (
        <div className={viewMode === 'grid' ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4' : 'space-y-4'}>
          {filteredLibrary.map((item) => (
            <div
              key={item.id}
              className="card group"
            >
              {viewMode === 'grid' ? (
                /* Grid View */
                <div className="space-y-3">
                  {/* Thumbnail/Preview */}
                  <div className="relative aspect-video bg-neutral-800 rounded-lg overflow-hidden">
                    <video
                      className="w-full h-full object-cover"
                      src={`file://${item.path}`}
                    />
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <button
                        onClick={() => playVideo(item)}
                        className="p-3 bg-primary-600 rounded-full hover:bg-primary-700 transition-colors"
                      >
                        <Play className="w-6 h-6 text-white" />
                      </button>
                    </div>
                  </div>

                  {/* Info */}
                  <div>
                    <div className="font-medium text-primary-400 truncate mb-1">
                      @{item.owner}
                    </div>
                    <div className="text-sm text-neutral-400 line-clamp-2 mb-2">
                      {item.caption || 'No caption'}
                    </div>
                    
                    {/* Tags */}
                    {item.keywords.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-2">
                        {item.keywords.slice(0, 3).map((keyword, index) => (
                          <span
                            key={index}
                            className="px-2 py-1 bg-primary-600/20 text-primary-400 text-xs rounded-full"
                          >
                            {keyword}
                          </span>
                        ))}
                        {item.keywords.length > 3 && (
                          <span className="px-2 py-1 bg-neutral-700 text-neutral-400 text-xs rounded-full">
                            +{item.keywords.length - 3}
                          </span>
                        )}
                      </div>
                    )}

                    {/* Metadata */}
                    <div className="flex items-center justify-between text-xs text-neutral-500">
                      <span>{formatFileSize(item.size)}</span>
                      <span>{formatDate(item.addedAt)}</span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => playVideo(item)}
                      className="flex-1 btn-secondary text-sm"
                    >
                      <Eye className="w-3 h-3 mr-1" />
                      Play
                    </button>
                    <button
                      onClick={() => deleteItem(item)}
                      disabled={deleting === item.id}
                      className="p-2 bg-red-600/20 hover:bg-red-600/30 text-red-400 rounded-lg transition-colors disabled:opacity-50"
                    >
                      {deleting === item.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Trash2 className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>
              ) : (
                /* List View */
                <div className="flex items-center gap-4">
                  <div className="relative w-20 h-20 bg-neutral-800 rounded-lg overflow-hidden flex-shrink-0">
                    <video
                      className="w-full h-full object-cover"
                      src={`file://${item.path}`}
                    />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-primary-400">@{item.owner}</span>
                      <span className="text-sm text-neutral-400">
                        {formatFileSize(item.size)}
                      </span>
                      <span className="text-sm text-neutral-400">
                        {formatDate(item.addedAt)}
                      </span>
                    </div>
                    <div className="text-sm text-neutral-400 mb-2">
                      {item.caption || 'No caption'}
                    </div>
                    {item.keywords.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {item.keywords.map((keyword, index) => (
                          <span
                            key={index}
                            className="px-2 py-1 bg-primary-600/20 text-primary-400 text-xs rounded-full"
                          >
                            {keyword}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => playVideo(item)}
                      className="btn-secondary"
                    >
                      <Eye className="w-4 h-4 mr-1" />
                      Play
                    </button>
                    <button
                      onClick={() => deleteItem(item)}
                      disabled={deleting === item.id}
                      className="p-2 bg-red-600/20 hover:bg-red-600/30 text-red-400 rounded-lg transition-colors disabled:opacity-50"
                    >
                      {deleting === item.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Trash2 className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="glass-dark rounded-xl p-12 text-center">
          <div className="max-w-md mx-auto">
            <div className="w-16 h-16 bg-neutral-700 rounded-full flex items-center justify-center mx-auto mb-4">
              <Play className="w-8 h-8 text-neutral-500" />
            </div>
            <h3 className="text-xl font-semibold mb-2">
              {library.length === 0 ? 'No files in library' : 'No matching files'}
            </h3>
            <p className="text-neutral-400">
              {library.length === 0 
                ? 'Download some reels to see them in your library'
                : 'Try adjusting your search or filters'
              }
            </p>
          </div>
        </div>
      )}

      {/* Video Player Modal */}
      {selectedItem && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="glass-dark rounded-xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
            <div className="p-4 border-b border-white/10 flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-primary-400">@{selectedItem.owner}</h3>
                <p className="text-sm text-neutral-400">{selectedItem.caption}</p>
              </div>
              <button
                onClick={() => setSelectedItem(null)}
                className="p-2 rounded-lg hover:bg-white/10 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-4">
              <video
                controls
                autoPlay
                className="w-full rounded-lg"
                src={`file://${selectedItem.path}`}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}