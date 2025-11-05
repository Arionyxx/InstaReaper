import React from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { 
  Search, 
  Download, 
  FolderOpen, 
  Settings, 
  Instagram,
  Menu,
  X
} from 'lucide-react'
import { useTheme } from '@/contexts/ThemeContext'
import { ToastContainer } from '@/components/ToastContainer'

interface NavItem {
  id: string
  label: string
  icon: React.ReactNode
  path: string
}

export function Layout({ children }: { children: React.ReactNode }) {
  const location = useLocation()
  const navigate = useNavigate()
  const { theme, toggleTheme } = useTheme()
  const [sidebarOpen, setSidebarOpen] = React.useState(true)

  const navItems: NavItem[] = [
    {
      id: 'scraper',
      label: 'Scraper',
      icon: <Instagram className="w-5 h-5" />,
      path: '/scraper',
    },
    {
      id: 'downloads',
      label: 'Downloads',
      icon: <Download className="w-5 h-5" />,
      path: '/downloads',
    },
    {
      id: 'library',
      label: 'Library',
      icon: <FolderOpen className="w-5 h-5" />,
      path: '/library',
    },
    {
      id: 'settings',
      label: 'Settings',
      icon: <Settings className="w-5 h-5" />,
      path: '/settings',
    },
  ]

  return (
    <div className="flex h-screen bg-neutral-900 text-neutral-100">
      {/* Sidebar */}
      <div className={`${sidebarOpen ? 'w-64' : 'w-16'} glass-dark border-r border-white/10 transition-all duration-300 flex flex-col`}>
        {/* Header */}
        <div className="p-4 border-b border-white/10">
          <div className="flex items-center justify-between">
            <div className={`flex items-center gap-3 ${!sidebarOpen && 'justify-center'}`}>
              <div className="w-10 h-10 bg-primary-600 rounded-lg flex items-center justify-center">
                <Instagram className="w-6 h-6 text-white" />
              </div>
              {sidebarOpen && (
                <h1 className="text-xl font-bold text-primary-400">InstaReaper</h1>
              )}
            </div>
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-2 rounded-lg hover:bg-white/10 transition-colors"
            >
              {sidebarOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4">
          <div className="space-y-2">
            {navItems.map((item) => (
              <button
                key={item.id}
                onClick={() => navigate(item.path)}
                className={`w-full sidebar-item ${
                  location.pathname === item.path
                    ? 'sidebar-item-active'
                    : 'text-neutral-400 hover:text-neutral-100'
                }`}
              >
                {item.icon}
                {sidebarOpen && <span>{item.label}</span>}
              </button>
            ))}
          </div>
        </nav>

        {/* Theme toggle */}
        {sidebarOpen && (
          <div className="p-4 border-t border-white/10">
            <button
              onClick={toggleTheme}
              className="w-full btn-secondary justify-center"
            >
              {theme === 'dark' ? '☀️ Light' : '🌙 Dark'}
            </button>
          </div>
        )}
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <div className="glass-dark border-b border-white/10 px-6 py-4">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-semibold">
              {navItems.find(item => item.path === location.pathname)?.label || 'InstaReaper'}
            </h2>
            <div className="flex items-center gap-4">
              <div className="text-sm text-neutral-400">
                {new Date().toLocaleDateString()}
              </div>
            </div>
          </div>
        </div>

        {/* Page content */}
        <div className="flex-1 overflow-auto p-6">
          {children}
        </div>
      </div>

      {/* Toast container */}
      <ToastContainer />
    </div>
  )
}