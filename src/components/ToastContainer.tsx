import React from 'react'
import { useToast } from '@/contexts/ToastContext'
import { X, CheckCircle, AlertCircle, Info } from 'lucide-react'

export function ToastContainer() {
  const { toasts, removeToast } = useToast()

  const getIcon = (type: string) => {
    switch (type) {
      case 'success':
        return <CheckCircle className="w-5 h-5" />
      case 'error':
        return <AlertCircle className="w-5 h-5" />
      case 'info':
      default:
        return <Info className="w-5 h-5" />
    }
  }

  const getToastClass = (type: string) => {
    switch (type) {
      case 'success':
        return 'toast-success'
      case 'error':
        return 'toast-error'
      case 'info':
      default:
        return 'toast-info'
    }
  }

  return (
    <div className="fixed top-4 right-4 z-50 space-y-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`${getToastClass(toast.type)} flex items-center gap-3 min-w-80`}
        >
          {getIcon(toast.type)}
          <div className="flex-1 text-sm">{toast.message}</div>
          <button
            onClick={() => removeToast(toast.id)}
            className="p-1 rounded hover:bg-white/10 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>
  )
}