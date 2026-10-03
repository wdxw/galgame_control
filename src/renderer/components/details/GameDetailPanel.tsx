import { useState, useEffect } from 'react'
import { X, Play, Star, Clock, Calendar, Monitor, Image, Search, FolderOpen } from 'lucide-react'
import { useGameStore } from '../../store/gameStore'
import { useUIStore } from '../../store/uiStore'
import { useTranslation } from '../../i18n/useTranslation'
import { GameRatings } from './GameRatings'
import type { Game, VndbSearchResult } from '../../../shared/types'
import { toLocalFileUrl } from '../../utils/media'

export function GameDetailPanel() {
  const { games, selectedGameId, detailPanelOpen, closeDetailPanel, updateGame, deleteGame, fetchGames } =
    useGameStore()
  const { addToast } = useUIStore()
  const [game, setGame] = useState<Game | null>(null)
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState<Partial<Game>>({})
  const [launching, setLaunching] = useState(false)
  const [imgError, setImgError] = useState(false)
  const [showCoverMenu, setShowCoverMenu] = useState(false)
  const [vndbQuery, setVndbQuery] = useState('')
  const [vndbResults, setVndbResults] = useState<VndbSearchResult[]>([])
  const [vndbSearching, setVndbSearching] = useState(false)
  const [vndbDownloading, setVndbDownloading] = useState<string | null>(null)
  const { t } = useTranslation()

  useEffect(() => {
    if (selectedGameId) {
      const g = games.find(g => g.id === selectedGameId) || null
      setGame(g)
      setEditing(false)
      setImgError(false)
      setShowCoverMenu(false)
      setVndbResults([])
      setVndbQuery('')
    } else {
      setGame(null)
    }
  }, [selectedGameId, games])

  if (!detailPanelOpen || !game) return null

  const coverSrc = imgError ? '' : toLocalFileUrl(game.coverPath)

  const handleLaunch = async () => {
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

  const handleSave = async () => {
    await updateGame(game.id, form)
    addToast(t('detail.updated'), 'success')
    setEditing(false)
  }

  const handleDelete = async () => {
    if (confirm(t('card.removeConfirm', { title: game.title }))) {
      deleteGame(game.id)
      addToast(t('detail.removedMsg', { title: game.title }), 'info')
    }
  }

  // Cover management
  const handleBrowseCover = async () => {
    const filePath = await window.api.selectFile([
      { name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp', 'bmp'] }
    ])
    if (filePath) {
      try {
        const newCoverPath = await window.api.copyCoverFile(game.id, filePath)
        await updateGame(game.id, { coverPath: newCoverPath, coverSource: 'manual' })
        addToast(t('cover.coverUpdated'), 'success')
        setImgError(false)
        fetchGames()
      } catch {
        addToast(t('common.error'), 'error')
      }
    }
  }

  const handleExtractIcon = async () => {
    try {
      const iconPath = await window.api.extractExeIcon(game.id, game.exePath)
      if (iconPath) {
        await updateGame(game.id, { coverPath: iconPath, coverSource: 'local' })
        addToast(t('cover.coverUpdated'), 'success')
        setImgError(false)
        fetchGames()
      }
    } catch {
      addToast(t('common.error'), 'error')
    }
  }

  const handleVndbSearch = async () => {
    if (!vndbQuery.trim()) return
    setVndbSearching(true)
    try {
      const results = await window.api.searchVndb(vndbQuery)
      setVndbResults(results)
    } catch {
      addToast(t('common.error'), 'error')
    } finally {
      setVndbSearching(false)
    }
  }

  const handleVndbDownload = async (result: VndbSearchResult) => {

    setVndbDownloading(result.id)
    try {
      const newCoverPath = result.imageUrl
        ? await window.api.downloadVndbCover(game.id, result.imageUrl).catch(() => null)
        : null
      await updateGame(game.id, {
        ...(newCoverPath ? { coverPath: newCoverPath, coverSource: 'vndb' as const } : {}),
        vndbId: result.id,
        worldTags: result.tags,
        title: result.title || game.title,
        originalTitle: result.originalTitle || game.originalTitle,
        description: result.description || game.description,
        developer: result.developer || game.developer,
        releaseDate: result.releaseDate || game.releaseDate
      })
      addToast('已关联 VNDB，游戏世界已创建', 'success')
      setImgError(false)
      setShowCoverMenu(false)
      fetchGames()
    } catch {
      addToast(t('common.error'), 'error')
    } finally {
      setVndbDownloading(null)
    }
  }

  return (
    <>
      {/* Full-window cover, independent of the scrolling detail panel. */}
      <div
        className="fixed inset-0 z-30 overflow-hidden bg-surface-300"
        onClick={closeDetailPanel}
        aria-hidden="true"
      >
        {coverSrc && (
          <img
            key={coverSrc}
            src={coverSrc}
            alt=""
            className="detail-cover-backdrop pointer-events-none absolute -inset-6 h-[calc(100%+3rem)] w-[calc(100%+3rem)] object-cover"
            onError={() => setImgError(true)}
          />
        )}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-black/10 via-transparent to-surface-200/60" />
      </div>

      {/* The clear cover fits the unobstructed space without enlargement or cropping. */}
      {coverSrc && (
        <div className="detail-cover-stage pointer-events-none fixed left-0 top-10 bottom-0 z-30">
          <img
            key={coverSrc}
            src={coverSrc}
            alt={game.title}
            className="detail-cover-image h-full w-full object-scale-down drop-shadow-2xl animate-fade-in"
            onError={() => setImgError(true)}
          />
        </div>
      )}

      {/* Panel */}
      <aside className="detail-panel fixed right-0 top-10 bottom-0 z-40 w-[min(440px,100vw)]
                         overflow-y-auto border-l border-surface-100/25 bg-surface-200/80
                         shadow-2xl backdrop-blur-xl animate-slide-up">
        <div className="relative min-h-full">
          <div className="relative z-10 min-h-full">
            {/* Close button */}
            <button
              onClick={closeDetailPanel}
              aria-label={t('titlebar.close')}
              title={t('titlebar.close')}
              className="absolute right-4 top-4 z-20 rounded-lg p-1.5 text-gray-400
                         transition-colors hover:bg-white/10 hover:text-white"
            >
              <X size={20} />
            </button>

            {/* Cover */}
            <div className="group relative flex min-h-[300px] items-center justify-center
                            overflow-hidden bg-surface-100/25 px-8 pb-8 pt-14">
              <div className="absolute inset-0 bg-gradient-to-b from-black/5 via-transparent to-surface-200/80" />
              {coverSrc ? (
                <img
                  key={coverSrc}
                  src={coverSrc}
                  alt={game.title}
                  className="detail-cover-preview relative z-10 max-h-[320px] max-w-full object-scale-down drop-shadow-2xl
                             animate-fade-in"
                  onError={() => setImgError(true)}
                />
              ) : (
                <div className="relative z-10 flex h-48 w-full items-center justify-center">
                  <Play size={32} className="text-gray-600" />
                </div>
              )}
              {/* Cover action overlay */}
              <div className="absolute inset-x-4 bottom-4 z-20 opacity-0 transition-opacity
                              group-hover:opacity-100">
                <button
                  onClick={() => setShowCoverMenu(!showCoverMenu)}
                  className="flex w-full items-center justify-center gap-1.5 rounded-lg
                             bg-surface-400/70 py-2 text-xs text-white backdrop-blur-md
                             transition-colors hover:bg-surface-400/90"
                >
                  <Image size={13} />
                  {t('cover.changeCover')}
                </button>
              </div>
            </div>

            {/* Cover menu */}
            {showCoverMenu && (
              <div className="space-y-3 border-b border-surface-100/20 bg-surface-200/80 p-4 backdrop-blur-xl">
            <button
              onClick={handleBrowseCover}
              className="flex w-full items-center gap-2 rounded-lg border border-surface-100/20
                             bg-surface-100/60 px-3 py-2 text-sm text-white transition-colors hover:bg-white/10"
            >
              <FolderOpen size={14} />
              {t('cover.browseFile')}
            </button>
            <button
              onClick={handleExtractIcon}
              className="flex w-full items-center gap-2 rounded-lg border border-surface-100/20
                         bg-surface-100/60 px-3 py-2 text-sm text-white transition-colors hover:bg-white/10"
            >
              <Image size={14} />
              {t('cover.extractIcon')}
            </button>

            {/* VNDB search */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Search size={14} className="text-gray-500 shrink-0" />
                <input
                  type="text"
                  value={vndbQuery}
                  onChange={e => setVndbQuery(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleVndbSearch()}
                  placeholder={t('cover.searchPlaceholder')}
                  className="flex-1 rounded-lg border border-surface-100/25 bg-surface-100/[0.65] px-2 py-1.5
                             text-xs text-white placeholder-gray-500 focus:outline-none focus:border-accent/60"
                />
                <button
                  onClick={handleVndbSearch}
                  disabled={vndbSearching}
                  className="rounded-lg bg-accent/15 px-2 py-1.5 text-xs text-accent
                             transition-colors hover:bg-accent/25 disabled:opacity-50"
                >
                  {vndbSearching ? t('cover.searching') : t('cover.vndbSearch')}
                </button>
              </div>

              {/* VNDB results */}
              {vndbResults.length > 0 && (
                <div className="max-h-40 overflow-y-auto space-y-1">
                  {vndbResults.map(result => (
                    <button
                      key={result.id}
                      onClick={() => handleVndbDownload(result)}
                      disabled={vndbDownloading !== null}
                      className="flex w-full items-center gap-2 rounded-lg border border-surface-100/20
                                 bg-surface-100/[0.55] px-3 py-2 text-left text-sm transition-colors
                                 hover:bg-white/10 disabled:opacity-50"
                    >
                      {result.imageUrl && (
                        <img
                          src={result.imageUrl}
                          alt=""
                          className="w-8 h-10 object-cover rounded shrink-0"
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-xs truncate">{result.title}</p>
                        {result.originalTitle && (
                          <p className="text-gray-500 text-xs truncate">{result.originalTitle}</p>
                        )}
                        {result.developer && (
                          <p className="text-gray-500 text-xs truncate">{result.developer}</p>
                        )}
                        {result.releaseDate && (
                          <p className="text-gray-600 text-xs truncate">{result.releaseDate}</p>
                        )}
                        {result.description && (
                          <p className="text-gray-600 text-xs line-clamp-2 mt-0.5">
                            {result.description}
                          </p>
                        )}
                      </div>
                      {vndbDownloading === result.id && (
                        <span className="text-xs text-accent">{t('cover.downloading')}</span>
                      )}
                    </button>
                  ))}
                </div>
              )}
              {vndbResults.length === 0 && vndbQuery && !vndbSearching && (
                <p className="text-xs text-gray-500 text-center py-2">{t('cover.noResults')}</p>
              )}
            </div>
              </div>
            )}

            {/* Content */}
            <div className="space-y-6 p-5 sm:p-6">
          {/* Title section */}
          {editing ? (
            <div className="space-y-3">
              <input
                type="text"
                value={form.title ?? game.title}
                onChange={e => setForm({ ...form, title: e.target.value })}
                className="w-full rounded-lg border border-surface-100/25 bg-surface-100/[0.65] px-3 py-2
                           text-lg font-semibold text-white focus:outline-none focus:border-accent/60"
                placeholder={t('detail.title')}
              />
              <input
                type="text"
                value={form.originalTitle ?? game.originalTitle ?? ''}
                onChange={e => setForm({ ...form, originalTitle: e.target.value || null })}
                className="w-full rounded-lg border border-surface-100/25 bg-surface-100/[0.65] px-3 py-2
                           text-sm text-white/70 focus:outline-none focus:border-accent/60"
                placeholder={t('detail.originalTitle')}
              />
              <input
                type="text"
                value={form.developer ?? game.developer ?? ''}
                onChange={e => setForm({ ...form, developer: e.target.value || null })}
                className="w-full rounded-lg border border-surface-100/25 bg-surface-100/[0.65] px-3 py-2
                           text-sm text-white/70 focus:outline-none focus:border-accent/60"
                placeholder={t('detail.developer')}
              />
              <input
                type="text"
                value={form.releaseDate ?? game.releaseDate ?? ''}
                onChange={e => setForm({ ...form, releaseDate: e.target.value || null })}
                className="w-full rounded-lg border border-surface-100/25 bg-surface-100/[0.65] px-3 py-2
                           text-sm text-white/70 focus:outline-none focus:border-accent/60"
                placeholder={t('detail.releaseDatePlaceholder')}
              />
              <div className="flex gap-2">
                <button
                  onClick={handleSave}
                  className="flex-1 rounded-lg bg-accent py-2 text-sm font-medium text-surface-300
                             transition-colors hover:bg-accent/[0.85]"
                >
                  {t('detail.save')}
                </button>
                <button
                  onClick={() => setEditing(false)}
                  className="flex-1 rounded-lg border border-surface-100/20 bg-surface-100/[0.65] py-2
                             text-sm font-medium text-gray-300 transition-colors hover:bg-surface-100/90"
                >
                  {t('detail.cancel')}
                </button>
              </div>
            </div>
          ) : (
            <div>
              <div className="flex items-start justify-between gap-2">
                <h2 className="min-w-0 flex-1 break-words text-2xl font-semibold leading-tight text-white">
                  {game.title}
                </h2>
                <button
                  onClick={() => updateGame(game.id, { isFavorite: !game.isFavorite })}
                  aria-label={t(game.isFavorite ? 'card.removeFavorite' : 'card.addFavorite')}
                  title={t(game.isFavorite ? 'card.removeFavorite' : 'card.addFavorite')}
                  className="shrink-0 rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-white/10 hover:text-white"
                >
                  <Star
                    size={18}
                    className={game.isFavorite ? 'text-yellow-400 fill-yellow-400' : 'text-gray-500'}
                  />
                </button>
              </div>
              {game.originalTitle && (
                <p className="text-sm text-gray-500 mt-0.5">{game.originalTitle}</p>
              )}
              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-500">
                {game.developer && (
                  <span className="flex items-center gap-1">
                    <Monitor size={12} />
                    {game.developer}
                  </span>
                )}
                <span className="flex items-center gap-1">
                  <Calendar size={12} />
                  {game.releaseDate || t('detail.unknown')}
                </span>
              </div>
              <GameRatings key={`${game.id}:${game.vndbId || ''}`} game={game} onFindVndb={() => { setShowCoverMenu(true); setVndbQuery(game.title) }} />
            </div>
          )}

          {/* Description */}
          {editing ? (
            <textarea
              value={form.description ?? game.description ?? ''}
              onChange={e => setForm({ ...form, description: e.target.value || null })}
              className="h-32 w-full resize-none rounded-lg border border-surface-100/25
                         bg-surface-100/[0.65] px-3 py-2 text-sm text-white/70
                         focus:outline-none focus:border-accent/60"
              placeholder={t('detail.description')}
            />
          ) : (
            game.description && (
              <div>
                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                  {t('detail.descriptionLabel')}
                </h4>
                <p className="text-sm text-gray-400 leading-relaxed whitespace-pre-wrap">
                  {game.description}
                </p>
              </div>
            )
          )}

          {/* Stats */}
          <div className="grid grid-cols-2 gap-3">
            <StatItem icon={<Clock size={14} />} label={t('detail.lastPlayed')} value={game.lastPlayed
              ? new Date(game.lastPlayed).toLocaleDateString()
              : t('detail.never')} />
            <StatItem icon={<Calendar size={14} />} label={t('detail.added')} value={
              new Date(game.dateAdded).toLocaleDateString()
            } />
          </div>

          {/* Notes */}
          {editing ? (
            <textarea
              value={form.notes ?? game.notes ?? ''}
              onChange={e => setForm({ ...form, notes: e.target.value || null })}
              className="h-24 w-full resize-none rounded-lg border border-surface-100/25
                         bg-surface-100/[0.65] px-3 py-2 text-sm text-white/70
                         focus:outline-none focus:border-accent/60"
              placeholder={t('detail.personalNotes')}
            />
          ) : (
            game.notes && (
              <div>
                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                  {t('detail.notesLabel')}
                </h4>
                <p className="text-sm text-gray-400 whitespace-pre-wrap">{game.notes}</p>
              </div>
            )
          )}

          {/* Actions */}
          <div className="space-y-2 border-t border-surface-100/20 pt-3">
            <button
              onClick={handleLaunch}
              disabled={launching}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-accent py-2.5
                         font-medium text-surface-300 transition-colors hover:bg-accent/[0.85]
                         disabled:opacity-50"
            >
              <Play size={16} fill="currentColor" />
              {launching ? t('detail.launching') : t('detail.launch')}
            </button>

            {!editing && (
              <button
                onClick={() => {
                  setEditing(true)
                  setForm({})
                }}
                className="w-full rounded-lg border border-surface-100/20 bg-surface-100/[0.65] py-2.5
                           text-sm font-medium text-gray-300 transition-colors hover:bg-white/10"
              >
                {t('detail.editDetails')}
              </button>
            )}

            <button
              onClick={handleDelete}
              className="w-full rounded-lg py-2 text-sm font-medium text-red-400/70
                         transition-colors hover:bg-red-500/5 hover:text-red-400"
            >
              {t('detail.remove')}
            </button>
          </div>

          {/* Game path info */}
          <div className="border-t border-surface-100/20 pt-3">
            <p className="text-xs text-gray-600 break-all">
              {game.exePath}
            </p>
          </div>
            </div>
          </div>
        </div>
      </aside>
    </>
  )
}

function StatItem({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-surface-100/20 bg-surface-100/[0.55] p-3">
      <div className="flex items-center gap-1.5 text-gray-500 mb-1">
        {icon}
        <span className="text-xs">{label}</span>
      </div>
      <p className="text-sm text-white/80">{value}</p>
    </div>
  )
}
