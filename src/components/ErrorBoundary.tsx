import React from 'react'
import { AlertTriangle, RefreshCw, Settings as SettingsIcon } from 'lucide-react'

interface ErrorBoundaryState {
  hasError: boolean
  error?: Error
}

interface ErrorBoundaryProps {
  children: React.ReactNode
}

export const CRASH_RECOVERY_ROUTE_STORAGE_KEY = 'instaReaper:crashRecoveryRoute'

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Uncaught error in renderer process:', error, errorInfo)
  }

  private clearRecoveryRoute() {
    if (typeof window === 'undefined') {
      return
    }

    try {
      window.sessionStorage.removeItem(CRASH_RECOVERY_ROUTE_STORAGE_KEY)
    } catch (storageError) {
      console.warn('Failed to clear crash recovery route from session storage', storageError)
    }
  }

  private handleReload = () => {
    this.clearRecoveryRoute()
    if (typeof window !== 'undefined') {
      window.location.reload()
    }
  }

  private handleOpenSettings = () => {
    if (typeof window !== 'undefined') {
      try {
        window.sessionStorage.setItem(CRASH_RECOVERY_ROUTE_STORAGE_KEY, '/settings')
      } catch (storageError) {
        console.warn('Failed to persist crash recovery route', storageError)
      }
      window.location.reload()
    }
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children
    }

    return (
      <div className="h-screen w-screen bg-neutral-950 text-neutral-100 flex items-center justify-center p-6">
        <div className="glass-dark border border-red-500/20 rounded-2xl max-w-xl w-full p-8 text-center space-y-6 shadow-xl">
          <div className="flex flex-col items-center space-y-4">
            <AlertTriangle className="w-12 h-12 text-red-400" />
            <h1 className="text-2xl font-semibold">Something went wrong</h1>
            <p className="text-neutral-400">
              We hit an unexpected issue while rendering the interface. You can reload the app or reopen Settings to adjust your configuration.
            </p>
          </div>

          {import.meta.env.DEV && this.state.error ? (
            <pre className="text-left text-sm text-red-300 bg-black/60 rounded-lg p-4 overflow-auto max-h-48 border border-red-500/30">
              {(this.state.error.stack ?? this.state.error.message ?? 'Unknown error').trim()}
            </pre>
          ) : null}

          <div className="flex flex-col sm:flex-row sm:justify-center gap-4">
            <button
              type="button"
              onClick={this.handleReload}
              className="btn-primary flex items-center justify-center gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              Reload
            </button>
            <button
              type="button"
              onClick={this.handleOpenSettings}
              className="btn-secondary flex items-center justify-center gap-2"
            >
              <SettingsIcon className="w-4 h-4" />
              Open Settings
            </button>
          </div>
        </div>
      </div>
    )
  }
}
