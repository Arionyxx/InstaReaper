import React, { useState, useEffect } from 'react'
import { QueueItem } from '@/types'
import { useToast } from '@/contexts/ToastContext'
import { 
  Pause, 
  Play, 
  Square, 
  RotateCcw, 
  Download,
  Loader2,
  CheckCircle,
  XCircle,
  Clock,
  AlertCircle
} from 'lucide-react'

export function Downloads() {
  const [queue, setQueue] = useState<QueueItem[]>([])
  const { addToast } = useToast()

  useEffect(() => {
    loadQueue()
    const interval = setInterval(loadQueue, 2000) // Update every 2 seconds
    return () => clearInterval(interval)
  }, [])

  const loadQueue = async () => {
    try {
      const items = await window.electronAPI.queue.get()
      setQueue(items)
    } catch (error) {
      console.error('Failed to load queue:', error)
    }
  }

  const pauseItem = async (itemId: string) => {
    try {
      const success = await window.electronAPI.queue.pause(itemId)
      if (success) {
        await loadQueue()
        addToast({
          type: 'success',
          message: 'Download paused',
        })
      }
    } catch (error) {
      addToast({
        type: 'error',
        message: 'Failed to pause download',
      })
    }
  }

  const resumeItem = async (itemId: string) => {
    try {
      const success = await window.electronAPI.queue.resume(itemId)
      if (success) {
        await loadQueue()
        addToast({
          type: 'success',
          message: 'Download resumed',
        })
      }
    } catch (error) {
      addToast({
        type: 'error',
        message: 'Failed to resume download',
      })
    }
  }

  const cancelItem = async (itemId: string) => {
    try {
      const success = await window.electronAPI.queue.cancel(itemId)
      if (success) {
        await loadQueue()
        addToast({
          type: 'success',
          message: 'Download cancelled',
        })
      }
    } catch (error) {
      addToast({
        type: 'error',
        message: 'Failed to cancel download',
      })
    }
  }

  const retryItem = async (itemId: string) => {
    try {
      const success = await window.electronAPI.queue.retry(itemId)
      if (success) {
        await loadQueue()
        addToast({
          type: 'success',
          message: 'Download retry initiated',
        })
      }
    } catch (error) {
      addToast({
        type: 'error',
        message: 'Failed to retry download',
      })
    }
  }

  const clearCompleted = async () => {
    const completedItems = queue.filter(item => item.status === 'completed')
    for (const item of completedItems) {
      await cancelItem(item.id)
    }
  }

  const getStatusIcon = (status: QueueItem['status']) => {
    switch (status) {
      case 'pending':
        return <Clock className="w-4 h-4 text-yellow-500" />
      case 'active':
      case 'downloading':
        return <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />
      case 'completed':
        return <CheckCircle className="w-4 h-4 text-green-500" />
      case 'failed':
        return <XCircle className="w-4 h-4 text-red-500" />
      case 'paused':
        return <Pause className="w-4 h-4 text-orange-500" />
      default:
        return <AlertCircle className="w-4 h-4 text-gray-500" />
    }
  }

  const getStatusColor = (status: QueueItem['status']) => {
    switch (status) {
      case 'pending':
        return 'text-yellow-500'
      case 'active':
      case 'downloading':
        return 'text-blue-500'
      case 'completed':
        return 'text-green-500'
      case 'failed':
        return 'text-red-500'
      case 'paused':
        return 'text-orange-500'
      default:
        return 'text-gray-500'
    }
  }

  const getStatusText = (status: QueueItem['status']) => {
    switch (status) {
      case 'pending':
        return 'Pending'
      case 'active':
        return 'Active'
      case 'downloading':
        return 'Downloading'
      case 'completed':
        return 'Completed'
      case 'failed':
        return 'Failed'
      case 'paused':
        return 'Paused'
      default:
        return 'Unknown'
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString()
  }

  const stats = {
    total: queue.length,
    pending: queue.filter(item => item.status === 'pending').length,
    active: queue.filter(item => ['active', 'downloading'].includes(item.status)).length,
    completed: queue.filter(item => item.status === 'completed').length,
    failed: queue.filter(item => item.status === 'failed').length,
    paused: queue.filter(item => item.status === 'paused').length,
  }

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <div className="glass-dark rounded-lg p-4 text-center">
          <div className="text-2xl font-bold text-primary-400">{stats.total}</div>
          <div className="text-xs text-neutral-400">Total</div>
        </div>
        <div className="glass-dark rounded-lg p-4 text-center">
          <div className="text-2xl font-bold text-yellow-500">{stats.pending}</div>
          <div className="text-xs text-neutral-400">Pending</div>
        </div>
        <div className="glass-dark rounded-lg p-4 text-center">
          <div className="text-2xl font-bold text-blue-500">{stats.active}</div>
          <div className="text-xs text-neutral-400">Active</div>
        </div>
        <div className="glass-dark rounded-lg p-4 text-center">
          <div className="text-2xl font-bold text-green-500">{stats.completed}</div>
          <div className="text-xs text-neutral-400">Completed</div>
        </div>
        <div className="glass-dark rounded-lg p-4 text-center">
          <div className="text-2xl font-bold text-red-500">{stats.failed}</div>
          <div className="text-xs text-neutral-400">Failed</div>
        </div>
        <div className="glass-dark rounded-lg p-4 text-center">
          <div className="text-2xl font-bold text-orange-500">{stats.paused}</div>
          <div className="text-xs text-neutral-400">Paused</div>
        </div>
      </div>

      {/* Controls */}
      <div className="glass-dark rounded-xl p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h3 className="font-semibold">Download Queue</h3>
            <span className="text-sm text-neutral-400">
              {queue.length} items
            </span>
          </div>
          {stats.completed > 0 && (
            <button
              onClick={clearCompleted}
              className="btn-secondary text-sm"
            >
              Clear Completed
            </button>
          )}
        </div>
      </div>

      {/* Queue Items */}
      {queue.length > 0 ? (
        <div className="space-y-3">
          {queue.map((item) => (
            <div key={item.id} className="glass-dark rounded-lg p-4">
              <div className="flex items-center gap-4">
                {/* Status Icon */}
                <div className="flex-shrink-0">
                  {getStatusIcon(item.status)}
                </div>

                {/* Thumbnail */}
                <div className="flex-shrink-0">
                  {item.thumbnail ? (
                    <img
                      src={item.thumbnail}
                      alt={item.owner}
                      className="w-16 h-16 object-cover rounded-lg"
                    />
                  ) : (
                    <div className="w-16 h-16 bg-neutral-700 rounded-lg flex items-center justify-center">
                      <Download className="w-6 h-6 text-neutral-500" />
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium text-primary-400">@{item.owner}</span>
                    <span className={`text-sm ${getStatusColor(item.status)}`}>
                      {getStatusText(item.status)}
                    </span>
                  </div>
                  <div className="text-sm text-neutral-400 truncate mb-2">
                    {item.caption || 'No caption'}
                  </div>
                  
                  {/* Progress Bar */}
                  {['active', 'downloading'].includes(item.status) && (
                    <div className="mb-2">
                      <div className="flex items-center justify-between text-xs text-neutral-400 mb-1">
                        <span>Progress</span>
                        <span>{item.progress}%</span>
                      </div>
                      <div className="w-full bg-neutral-700 rounded-full h-2">
                        <div
                          className="bg-primary-500 h-2 rounded-full transition-all duration-300"
                          style={{ width: `${item.progress}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Error Message */}
                  {item.error && (
                    <div className="text-sm text-red-400 mb-2">
                      Error: {item.error}
                    </div>
                  )}

                  {/* Metadata */}
                  <div className="flex items-center gap-4 text-xs text-neutral-500">
                    <span>Added: {formatDate(item.addedAt)}</span>
                    {item.completedAt && (
                      <span>Completed: {formatDate(item.completedAt)}</span>
                    )}
                    {item.retryCount > 0 && (
                      <span>Retries: {item.retryCount}</span>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2">
                  {item.status === 'pending' && (
                    <button
                      onClick={() => pauseItem(item.id)}
                      className="p-2 rounded-lg hover:bg-white/10 transition-colors"
                      title="Pause"
                    >
                      <Pause className="w-4 h-4" />
                    </button>
                  )}
                  
                  {item.status === 'paused' && (
                    <button
                      onClick={() => resumeItem(item.id)}
                      className="p-2 rounded-lg hover:bg-white/10 transition-colors"
                      title="Resume"
                    >
                      <Play className="w-4 h-4" />
                    </button>
                  )}
                  
                  {item.status === 'failed' && (
                    <button
                      onClick={() => retryItem(item.id)}
                      className="p-2 rounded-lg hover:bg-white/10 transition-colors"
                      title="Retry"
                    >
                      <RotateCcw className="w-4 h-4" />
                    </button>
                  )}
                  
                  {['pending', 'active', 'downloading', 'paused'].includes(item.status) && (
                    <button
                      onClick={() => cancelItem(item.id)}
                      className="p-2 rounded-lg hover:bg-white/10 transition-colors"
                      title="Cancel"
                    >
                      <Square className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="glass-dark rounded-xl p-12 text-center">
          <div className="max-w-md mx-auto">
            <div className="w-16 h-16 bg-neutral-700 rounded-full flex items-center justify-center mx-auto mb-4">
              <Download className="w-8 h-8 text-neutral-500" />
            </div>
            <h3 className="text-xl font-semibold mb-2">No downloads</h3>
            <p className="text-neutral-400">
              Go to the Scraper page to find and download Instagram reels
            </p>
          </div>
        </div>
      )}
    </div>
  )
}