import { useState, useEffect } from 'react'
import { Play, Star, MoreVertical, Edit, FolderOpen, Trash2 } from 'lucide-react'
import type { Game } from '../../../shared/types'
import { useGameStore } from '../../store/gameStore'
import { useUIStore } from '../../store/uiStore'
import { useTranslation } from '../../i18n/useTranslation'
import type { TranslationKey } from '../../i18n/translations'
import { ContextMenu } from '../common/ContextMenu'
import { toLocalFileUrl } from '../../utils/media'

interface GameCardProps {
  game: Game
}

export function GameCard({ game }: GameCardProps) {
  const { openDetailPanel, updateGame, deleteGame } = useGameStore()
  const { addToast } = useUIStore()
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)
  const [imgError, setImgError] = useState(false)
  const [launching, setLaunching] = useState(false)
  const { t } = useTranslation()

  // Reset imgError when coverPath changes (e.g., user updates cover)
  useEffect(() => {
    setImgError(false)
  }, [game.coverPath])

  const handleLaunch = async (e: React.MouseEvent) => {
    e.stopPropagation()
    setLaunching(true)
    try {
      const result = await window.api.launchGame(game.id)
      if (result.success) {
        addToast(t('card.launchSuccess', { title: game.title }), 'success')
      } else {
        addToast(result.error || t('card.launchFailed'), 'error')
      }
    } catch {
      addToast(t('card.launchFailed'), 'error')
    } finally {
      setLaunching(false)
    }
  }

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY })
  }

  const handleToggleFavorite = async (e: React.MouseEvent) => {
    e.stopPropagation()
    await updateGame(game.id, { isFavorite: !game.isFavorite })
  }

  const getCoverSrc = (): string => {
    if (imgError || !game.coverPath) return ''
    return toLocalFileUrl(game.coverPath)
  }

  return (
    <>
      <div
        className="group relative cursor-pointer overflow-hidden rounded-lg
                   border border-surface-100/20 bg-surface-200/80
                   transition-[transform,border-color,box-shadow] duration-200
                   hover:-translate-y-0.5 hover:border-accent/35 hover:shadow-xl hover:shadow-black/20"
        onClick={() => openDetailPanel(game.id)}
        onContextMenu={handleContextMenu}
      >
        {/* Cover image */}
        <div className="relative aspect-[3/4] overflow-hidden bg-surface-100/75 flex items-center justify-center">
          {getCoverSrc() && !imgError ? (
            <img
              src={getCoverSrc()}
              alt={game.title}
              className="h-full w-full object-contain p-1 transition-transform duration-300 group-hover:scale-[1.03]"
              onError={() => setImgError(true)}
            />
          ) : (
            <div className="h-full w-full flex flex-col items-center justify-center gap-3 bg-gradient-to-b from-surface-100/80 to-surface-200 p-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent/15">
                <Play size={20} className="text-accent" />
              </div>
              <span className="text-xs text-gray-500 text-center line-clamp-3">
                {game.title}
              </span>
            </div>
          )}
        </div>

        {/* Hover overlay */}
        <div className="absolute inset-0 bg-surface-400/[0.65] opacity-0 backdrop-blur-[2px] group-hover:opacity-100
                        transition-opacity duration-200 flex items-center justify-center">
          <button
            onClick={handleLaunch}
            disabled={launching}
            className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5
                       text-surface-300 font-medium shadow-lg shadow-black/20 transition-all
                       hover:bg-accent/[0.85]
                       transform scale-90 group-hover:scale-100 duration-200
                       disabled:opacity-50"
          >
            <Play size={18} fill="currentColor" />
            {launching ? t('card.launching') : t('card.play')}
          </button>
        </div>

        {/* Favorite toggle */}
        <button
          onClick={handleToggleFavorite}
          aria-label={t(game.isFavorite ? 'card.removeFavorite' : 'card.addFavorite')}
          title={t(game.isFavorite ? 'card.removeFavorite' : 'card.addFavorite')}
          className={`absolute right-2 top-2 rounded-full bg-surface-400/70 p-1.5
                     transition-opacity duration-200 hover:bg-surface-400/90
                     ${game.isFavorite ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
        >
          <Star
            size={16}
            className={game.isFavorite ? 'text-yellow-400 fill-yellow-400' : 'text-white'}
          />
        </button>

        {/* Info bar */}
        <div className="p-3.5">
          <h3 className="text-sm font-medium text-white/90 truncate" title={game.title}>
            {game.title}
          </h3>
          {game.lastPlayed && (
            <p className="text-xs text-gray-500 mt-0.5">
              {t('card.lastPlayed')} {formatRelativeTime(game.lastPlayed, t)}
            </p>
          )}
        </div>
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          items={[
            {
              label: t('card.play'),
              icon: <Play size={14} />,
              onClick: () => {
                setContextMenu(null)
                window.api.launchGame(game.id).then(result => {
                  if (result.success) {
                    addToast(t('card.launchSuccess', { title: game.title }), 'success')
                  } else {
                    addToast(result.error || t('card.launchFailed'), 'error')
                  }
                })
              }
            },
            {
              label: t('card.editDetails'),
              icon: <Edit size={14} />,
              onClick: () => {
                setContextMenu(null)
                openDetailPanel(game.id)
              }
            },
            {
              label: t('card.openFolder'),
              icon: <FolderOpen size={14} />,
              onClick: () => {
                setContextMenu(null)
                window.api.openGameDir(game.gameDir)
              }
            },
            { type: 'separator' as const },
            {
              label: t('card.delete'),
              icon: <Trash2 size={14} />,
              danger: true,
              onClick: () => {
                setContextMenu(null)
                if (confirm(t('card.removeConfirm', { title: game.title }))) {
                  deleteGame(game.id)
                  addToast(t('card.removed', { title: game.title }), 'info')
                }
              }
            }
          ]}
        />
      )}
    </>
  )
}

function formatRelativeTime(dateStr: string, t: (key: TranslationKey, params?: Record<string, string | number>) => string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return t('card.justNow')
  if (diffMins < 60) return t('card.minutesAgo', { n: diffMins })
  if (diffHours < 24) return t('card.hoursAgo', { n: diffHours })
  if (diffDays < 7) return t('card.daysAgo', { n: diffDays })
  return date.toLocaleDateString()
}
