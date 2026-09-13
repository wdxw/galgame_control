import { useState } from 'react'
import { FolderOpen, Star, Clock, ChevronLeft, ChevronRight, Library, Settings } from 'lucide-react'
import { useGameStore } from '../../store/gameStore'
import { useUIStore } from '../../store/uiStore'
import { useScanStore } from '../../store/scanStore'
import { useTranslation } from '../../i18n/useTranslation'
import { SearchBar } from './SearchBar'

interface SidebarProps {
  onOpenSettings?: () => void
}

export function Sidebar({ onOpenSettings }: SidebarProps) {
  const { games, filter, setFilter } = useGameStore()
  const { sidebarCollapsed, toggleSidebar } = useUIStore()
  const [importing, setImporting] = useState(false)
  const { t } = useTranslation()

  const handleImport = async () => {
    setImporting(true)
    try {
      const dirs = await window.api.selectDirectory()
      if (dirs && dirs.length > 0) {
        try {
          await useScanStore.getState().startScan(dirs)
        } catch (error) {
          useUIStore.getState().addToast(t('import.failed', { error: String(error) }), 'error')
        }
      }
    } catch (error) {
      useUIStore.getState().addToast(String(error), 'error')
    } finally {
      setImporting(false)
    }
  }

  const favorites = games.filter(g => g.isFavorite).length
  const recent = games.filter(g => {
    if (!g.lastPlayed) return false
    return (Date.now() - new Date(g.lastPlayed).getTime()) < 7 * 24 * 60 * 60 * 1000
  }).length

  if (sidebarCollapsed) {
    return (
      <aside className="w-16 bg-surface-200/[0.92] border-r border-surface-100/20 backdrop-blur-xl flex flex-col items-center py-4 gap-4 shrink-0">
        <button
          onClick={toggleSidebar}
          className="p-1.5 rounded-lg hover:bg-white/10 transition-colors text-gray-400 hover:text-white"
          title={t('sidebar.expand')}
        >
          <ChevronRight size={18} />
        </button>
        <button
          onClick={handleImport}
          disabled={importing}
          className="p-2 rounded-lg bg-accent/20 text-accent hover:bg-accent/30 transition-colors"
          title={t('sidebar.importGames')}
        >
          <FolderOpen size={18} />
        </button>
      </aside>
    )
  }

  return (
    <aside className="w-60 bg-surface-200/[0.92] border-r border-surface-100/20 backdrop-blur-xl flex flex-col shrink-0 overflow-hidden">
      {/* Header */}
      <div className="px-4 pb-3 pt-5 flex items-center justify-between">
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
          {t('sidebar.library')}
        </span>
        <button
          onClick={toggleSidebar}
          className="p-1 rounded hover:bg-white/10 transition-colors text-gray-400 hover:text-white"
          title={t('sidebar.collapse')}
        >
          <ChevronLeft size={16} />
        </button>
      </div>

      {/* Search */}
      <div className="px-3.5 mb-4">
        <SearchBar />
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3.5 space-y-1">
        <NavItem
          icon={<Library size={18} />}
          label={t('sidebar.allGames')}
          count={games.length}
          active={filter === 'all'}
          onClick={() => setFilter('all')}
        />
        <NavItem
          icon={<Clock size={18} />}
          label={t('sidebar.recent')}
          count={recent}
          active={filter === 'recent'}
          onClick={() => setFilter('recent')}
        />
        <NavItem
          icon={<Star size={18} />}
          label={t('sidebar.favorites')}
          count={favorites}
          active={filter === 'favorites'}
          onClick={() => setFilter('favorites')}
        />
      </nav>

      {/* Settings button */}
      <div className="px-3.5">
        <button
          onClick={() => onOpenSettings?.()}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm
                     text-gray-500 hover:text-white hover:bg-white/5 transition-all"
        >
          <Settings size={18} />
          <span>{t('sidebar.settings')}</span>
        </button>
      </div>

      {/* Import button */}
      <div className="p-3.5 border-t border-surface-100/20">
        <button
          onClick={handleImport}
          disabled={importing}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg
                     bg-accent hover:bg-accent/80 text-surface-300 font-medium
                     transition-all text-sm disabled:opacity-50"
        >
          <FolderOpen size={16} />
          {importing ? t('sidebar.opening') : t('sidebar.import')}
        </button>
      </div>
    </aside>
  )
}

function NavItem({
  icon,
  label,
  count,
  active,
  onClick
}: {
  icon: React.ReactNode
  label: string
  count: number
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all
        ${active
          ? 'bg-accent/15 text-accent font-medium'
          : 'text-gray-400 hover:text-white hover:bg-white/5'
        }`}
    >
      {icon}
      <span className="flex-1 text-left">{label}</span>
      {count > 0 && (
        <span className={`text-xs px-1.5 py-0.5 rounded-full
          ${active ? 'bg-accent/20 text-accent' : 'bg-surface-100 text-gray-500'}`}
        >
          {count}
        </span>
      )}
    </button>
  )
}
