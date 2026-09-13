import { useState, useMemo } from 'react'
import { ArrowUpDown, Library } from 'lucide-react'
import { useGameStore } from '../../store/gameStore'
import { useTranslation } from '../../i18n/useTranslation'
import { GameCard } from './GameCard'
import { GameCardSkeleton } from './GameCardSkeleton'
import { EmptyState } from '../common/EmptyState'

type SortKey = 'dateAdded' | 'title' | 'lastPlayed' | 'playTime'

export function GameGrid() {
  const { games, loading, searchQuery, filter } = useGameStore()
  const [sortBy, setSortBy] = useState<SortKey>('dateAdded')
  const { t } = useTranslation()

  const SORT_OPTIONS = [
    { key: 'dateAdded' as const, label: t('grid.sortDateAdded') },
    { key: 'title' as const, label: t('grid.sortTitle') },
    { key: 'lastPlayed' as const, label: t('grid.sortLastPlayed') },
    { key: 'playTime' as const, label: t('grid.sortPlayTime') }
  ]

  // Apply client-side filter
  const filteredGames = useMemo(() => {
    switch (filter) {
      case 'favorites':
        return games.filter(g => g.isFavorite)
      case 'recent':
        return games.filter(g => {
          if (!g.lastPlayed) return false
          return (Date.now() - new Date(g.lastPlayed).getTime()) < 7 * 24 * 60 * 60 * 1000
        })
      case 'all':
      default:
        return games
    }
  }, [games, filter])

  const sortedGames = useMemo(() => {
    const sorted = [...filteredGames]
    sorted.sort((a, b) => {
      switch (sortBy) {
        case 'title':
          return a.title.localeCompare(b.title)
        case 'lastPlayed':
          if (!a.lastPlayed && !b.lastPlayed) return 0
          if (!a.lastPlayed) return 1
          if (!b.lastPlayed) return -1
          return new Date(b.lastPlayed).getTime() - new Date(a.lastPlayed).getTime()
        case 'playTime':
          return b.playTime - a.playTime
        case 'dateAdded':
        default:
          return new Date(b.dateAdded).getTime() - new Date(a.dateAdded).getTime()
      }
    })
    return sorted
  }, [filteredGames, sortBy])

  if (loading) {
    return (
      <div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {Array.from({ length: 12 }).map((_, i) => (
            <GameCardSkeleton key={i} />
          ))}
        </div>
      </div>
    )
  }

  if (filteredGames.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        {searchQuery ? (
          <EmptyState
            icon={<Library size={48} />}
            title={t('grid.noResults')}
            description={t('grid.noResultsDesc', { query: searchQuery })}
          />
        ) : (
          <EmptyState
            icon={<Library size={48} />}
            title={t('grid.emptyTitle')}
            description={t('grid.emptyDesc')}
          />
        )}
      </div>
    )
  }

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Sort bar */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-white/95">
            {t('sidebar.library')}
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            {searchQuery
              ? t('grid.foundResults', { count: filteredGames.length, query: searchQuery })
              : t('grid.gameCount', { count: filteredGames.length })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ArrowUpDown size={14} className="text-gray-500" />
          <label htmlFor="game-sort" className="sr-only">{t('grid.sortBy')}</label>
          <select
            id="game-sort"
            value={sortBy}
            onChange={e => setSortBy(e.target.value as SortKey)}
            className="bg-surface-100/[0.65] border border-surface-100/25 rounded-lg px-3 py-2
                       text-xs text-gray-300 focus:outline-none focus:border-accent/60
                       transition-colors"
          >
            {SORT_OPTIONS.map(opt => (
              <option key={opt.key} value={opt.key}>{opt.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Grid */}
      <div className="game-grid">
        {sortedGames.map(game => (
          <GameCard key={game.id} game={game} />
        ))}
      </div>
    </div>
  )
}
