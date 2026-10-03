import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Globe2, Search, X } from 'lucide-react'
import type { Game } from '../../../shared/types'
import { seedFor } from '../../../shared/worldSeed'
import { toLocalFileUrl } from '../../utils/media'
import { useTranslation } from '../../i18n/useTranslation'

// The star dock catalogue: every linked work gets a planet, and the list stays
// searchable and paged so a large collection is still navigable.

const PER_PAGE = 6

function planetColor(id: string): string {
  const hue = seedFor(id) % 360
  return `hsl(${hue}, 62%, 68%)`
}

function Thumb({ game }: { game: Game }) {
  const [failed, setFailed] = useState(false)
  const url = toLocalFileUrl(game.coverPath)
  useEffect(() => setFailed(false), [url])
  if (url && !failed) return <img src={url} alt="" onError={() => setFailed(true)} />
  return <span className="world-thumb-fallback" style={{ background: planetColor(game.id) }}>{game.title.slice(0, 1)}</span>
}

export interface PlanetCatalogProps {
  games: Game[]
  currentId: string | null
  open: boolean
  onEnter(id: string): void
  onBack(): void
  onClose(): void
}

export function PlanetCatalog({ games, currentId, open, onEnter, onBack, onClose }: PlanetCatalogProps) {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(0)
  const filtered = useMemo(() => {
    const value = query.trim().toLowerCase()
    if (!value) return games
    return games.filter(game =>
      game.title.toLowerCase().includes(value) ||
      (game.originalTitle || '').toLowerCase().includes(value) ||
      (game.vndbId || '').toLowerCase().includes(value) ||
      (game.developer || '').toLowerCase().includes(value))
  }, [games, query])
  const pages = Math.max(1, Math.ceil(filtered.length / PER_PAGE))
  const safePage = Math.min(page, pages - 1)
  const shown = filtered.slice(safePage * PER_PAGE, safePage * PER_PAGE + PER_PAGE)

  useEffect(() => { setPage(0) }, [query, games.length])

  if (!open) return null

  return (
    <aside className="world-catalog" aria-label={t('world.catalog')}>
      <header>
        <Globe2 size={15} />
        <strong>{t('world.catalog')}</strong>
        <span>{t('world.catalogCount', { count: filtered.length })}</span>
        <button className="world-icon-btn" aria-label={t('world.closeCatalog')} onClick={onClose}><X size={14} /></button>
      </header>
      <label className="world-search">
        <Search size={14} />
        <input
          value={query}
          placeholder={t('world.searchPlanetsHint')}
          aria-label={t('world.searchPlanets')}
          onChange={event => setQuery(event.target.value)}
        />
        {query && <button aria-label={t('world.clearSearch')} onClick={() => setQuery('')}><X size={13} /></button>}
      </label>

      <div className="world-planet-list">
        {shown.map(game => (
          <button
            key={game.id}
            className={'world-planet' + (game.id === currentId ? ' is-current' : '')}
            data-enter-world={game.id}
            onClick={() => onEnter(game.id)}
          >
            <span className="world-planet-orb" style={{ background: planetColor(game.id) }} />
            <span className="world-thumb"><Thumb game={game} /></span>
            <span className="world-planet-text">
              <strong>{game.title}</strong>
              <small>{game.originalTitle || game.developer || game.vndbId}</small>
            </span>
            <ChevronRight size={14} />
          </button>
        ))}
        {shown.length === 0 && (
          <p className="world-planet-empty">
            {games.length === 0 ? t('world.catalogEmptyLibrary') : t('world.catalogEmptyMatch')}
          </p>
        )}
      </div>

      <footer>
        <button aria-label={t('world.prevPage')} disabled={safePage === 0} onClick={() => setPage(safePage - 1)}><ChevronLeft size={14} /></button>
        <span>{safePage + 1} / {pages}</span>
        <button aria-label={t('world.nextPage')} disabled={safePage >= pages - 1} onClick={() => setPage(safePage + 1)}><ChevronRight size={14} /></button>
        {currentId && <button className="world-btn world-btn-ghost" onClick={onBack}>{t('world.backToHub')}</button>}
      </footer>
    </aside>
  )
}
