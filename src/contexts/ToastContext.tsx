import React, { createContext, useContext, useState, useCallback } from 'react'
import { Toast } from '@/types'

interface ToastContextType {
  toasts: Toast[]
  addToast: (toast: Omit<Toast, 'id'>) => void
  removeToast: (id: string) => void
}

const ToastContext = createContext<ToastContextType | undefined>(undefined)

const missingToastContext: ToastContextType = {
  toasts: [],
  addToast: (toast) => {
    if (import.meta.env.DEV) {
      console.warn('Attempted to add a toast without an active ToastProvider. The toast will be ignored.', toast)
    }
  },
  removeToast: () => {
    if (import.meta.env.DEV) {
      console.warn('Attempted to remove a toast without an active ToastProvider. Ignoring call.')
    }
  },
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const addToast = useCallback((toast: Omit<Toast, 'id'>) => {
    const id = Math.random().toString(36).substr(2, 9)
    const newToast: Toast = {
      ...toast,
      id,
      duration: toast.duration || 3000,
    }

    setToasts((prev) => [...prev, newToast])

    if (newToast.duration && newToast.duration > 0) {
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id))
      }, newToast.duration)
    }
  }, [])

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast }}>
      {children}
    </ToastContext.Provider>
  )
}

export function useToast() {
  const context = useContext(ToastContext)
  if (context === undefined) {
    return missingToastContext
  }
  return context
}
