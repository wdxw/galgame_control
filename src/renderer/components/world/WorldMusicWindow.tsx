import { useEffect, useMemo, useRef, useState } from 'react'
import { Disc3, ExternalLink, Loader2, Music2, Pause, Play, RefreshCw, Search, X } from 'lucide-react'
import type { NeteaseMusicInfo, WorldMusicAlbum, WorldMusicInfo, WorldMusicTrack } from '../../../shared/types'
import { useTranslation } from '../../i18n/useTranslation'
import { useMusicPlayback } from '../music/MusicPlayback'

interface WorldMusicWindowProps {
  gameId: string
  gameTitle: string
  info: WorldMusicInfo | null
  loading: boolean
  open: boolean
  onClose(): void
  onRefresh(): void
}

type MusicSource = 'all' | 'netease' | 'vndb' | 'local'
const sourceOf = (album: WorldMusicAlbum): MusicSource => album.neteaseId ? 'netease' : album.id === 'local' ? 'local' : 'vndb'

export function WorldMusicWindow(props: WorldMusicWindowProps) {
  const { t, language } = useTranslation()
  const music = useMusicPlayback()
  const currentTrack = music.selection?.track
  const playing = music.selection?.kind === 'local' && music.playing
  const [source, setSource] = useState<MusicSource>('all')
  const [query, setQuery] = useState('')
  const [netease, setNetease] = useState<NeteaseMusicInfo | null>(null)
  const [searching, setSearching] = useState(false)
  const [searchFailed, setSearchFailed] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [details, setDetails] = useState<Record<string, WorldMusicAlbum>>({})
  const [loadingAlbum, setLoadingAlbum] = useState<string | null>(null)
  const [albumError, setAlbumError] = useState<string | null>(null)
  const searchRevision = useRef(0)
  const albumRevision = useRef(0)

  async function searchNetease(searchQuery?: string, force = false): Promise<void> {
    const revision = ++searchRevision.current
    setSearching(true)
    setSearchFailed(false)
    try {
      const result = await window.api.searchNeteaseMusic(props.gameId, searchQuery, force)
      if (revision !== searchRevision.current) return
      setNetease(result)
      setSearchFailed(result.status === 'error')
      if (!searchQuery) setQuery(previous => previous || result.query)
    } catch {
      if (revision === searchRevision.current) { setSearchFailed(true); setNetease(null) }
    } finally {
      if (revision === searchRevision.current) setSearching(false)
    }
  }

  useEffect(() => {
    void searchNetease()
    return () => {
      searchRevision.current++
      albumRevision.current++
      music.setExpanded(false)
    }
  }, [props.gameId])

  useEffect(() => { if (!props.open) music.setExpanded(false) }, [props.open])
  // VNDB may finish after NetEase. Metadata arriving must not interrupt music.
  useEffect(() => { setDetails({}); albumRevision.current++; setLoadingAlbum(null) }, [props.info?.updatedAt])

  const localAlbum = useMemo<WorldMusicAlbum | null>(() => {
    if (!props.info?.localTracks.length) return null
    return {
      id: 'local', title: t('world.music.localAlbum'), originalTitle: null, artist: null, releaseDate: null,
      coverUrl: null, sourceUrl: '', detailUrl: null, tracks: props.info.localTracks, tracksLoaded: true
    }
  }, [props.info?.localTracks, t])

  const allAlbums = useMemo(() => [
    ...(netease?.albums || []), ...(props.info?.albums || []), ...(localAlbum ? [localAlbum] : [])
  ], [netease?.albums, props.info?.albums, localAlbum])
  const albums = allAlbums.filter(album => source === 'all' || sourceOf(album) === source)
  const loading = source === 'netease' ? searching : source === 'vndb' || source === 'local' ? props.loading : props.loading || searching

  if (!props.open) return null

  async function toggleAlbum(album: WorldMusicAlbum): Promise<void> {
    const revision = ++albumRevision.current
    setLoadingAlbum(null)
    setAlbumError(null)
    if (expanded === album.id) { setExpanded(null); return }
    setExpanded(album.id)
    if (album.tracksLoaded || details[album.id] || !album.detailUrl) return
    if (!/^vgmdb:\d+$/.test(album.id)) return
    setLoadingAlbum(album.id)
    try {
      const loaded = await window.api.getWorldMusicAlbum(props.gameId, album.id)
      if (revision === albumRevision.current) setDetails(previous => ({ ...previous, [album.id]: loaded }))
    } catch {
      if (revision === albumRevision.current) setAlbumError(album.id)
    } finally {
      if (revision === albumRevision.current) setLoadingAlbum(null)
    }
  }

  function playTrack(track: WorldMusicTrack): Promise<void> {
    return music.playTrack({ gameId: props.gameId, gameTitle: props.gameTitle }, track)
  }

  const searchUrl = netease?.searchUrl || `https://music.163.com/#/search/m/?s=${encodeURIComponent(query || props.gameTitle)}&type=10`
  return (
    <aside className="world-music-window" aria-label={t('world.music.title')} data-world-music>
      <header className="world-music-header">
        <div className="world-music-heading">
          <span className="world-music-icon"><Music2 size={15} /></span>
          <div><strong>{t('world.music.title')}</strong><small>{t('world.music.sources')}</small></div>
        </div>
        <div className="world-music-actions">
          <button className="world-icon-btn" title={t('world.music.refresh')} aria-label={t('world.music.refresh')} onClick={() => { props.onRefresh(); void searchNetease(query.trim() || undefined, true) }} disabled={props.loading || searching}>
            <RefreshCw size={13} className={props.loading || searching ? 'is-spinning' : ''} />
          </button>
          <button className="world-icon-btn" title={t('world.music.close')} aria-label={t('world.music.close')} onClick={props.onClose}><X size={14} /></button>
        </div>
      </header>

      <div className="world-music-filters" role="group" aria-label={t('world.music.sourceFilter')}>
        {(['all', 'netease', 'vndb', 'local'] as const).map(value => (
          <button key={value} aria-pressed={source === value} className={source === value ? 'is-active' : ''} data-music-source={value} onClick={() => setSource(value)}>{t(`world.music.source.${value}`)}</button>
        ))}
      </div>
      {(source === 'all' || source === 'netease') && (
        <form className="world-music-search" onSubmit={event => { event.preventDefault(); if (query.trim()) { setSource('netease'); setExpanded(null); void searchNetease(query.trim(), true) } }}>
          <input value={query} maxLength={160} aria-label={t('world.music.searchLabel')} placeholder={props.gameTitle || t('world.music.searchLabel')} onChange={event => setQuery(event.target.value)} />
          <button type="submit" disabled={!query.trim() || searching} aria-label={t('world.music.search')} title={t('world.music.search')}><Search size={14} /></button>
        </form>
      )}

      <div className="world-music-body" aria-busy={loading}>
        {(source === 'all' || source === 'netease') && <div className="world-music-network-note">
          <p className="world-music-note" data-netease-status={searching ? 'loading' : searchFailed ? 'error' : netease?.status}>
            {searching ? t('world.music.neteaseLoading') : searchFailed ? t('world.music.neteaseError') : netease?.status === 'cached' ? t('world.music.neteaseCached') : netease?.status === 'empty' ? t('world.music.neteaseEmpty') : t('world.music.neteaseHint')}
            {netease?.partial && !searching && !searchFailed && ` ${t('world.music.neteasePartial')}`}
          </p>
          <a className="world-music-source" href={searchUrl} target="_blank" rel="noreferrer"><ExternalLink size={11} />{t('world.music.openNeteaseSearch')}</a>
        </div>}
        {loading && !albums.length && <div className="world-music-empty"><Loader2 size={17} className="is-spinning" />{t('world.music.loading')}</div>}
        {!loading && !albums.length && <div className="world-music-empty"><Disc3 size={18} />{t('world.music.empty')}</div>}
        {(source === 'all' || source === 'vndb') && props.info?.message && <p className="world-music-note">VNDB · {props.info.message}</p>}
        {albums.map(summary => {
          const album = details[summary.id] || summary
          const isExpanded = expanded === album.id
          const isLoading = loadingAlbum === album.id
          return (
            <section className={'world-music-album' + (isExpanded ? ' is-expanded' : '')} key={album.id} data-world-music-album={album.id}>
              <button className="world-music-album-row" onClick={() => void toggleAlbum(summary)} aria-expanded={isExpanded}>
                <span className="world-music-cover">{album.coverUrl ? <img src={album.coverUrl} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <Disc3 size={17} />}</span>
                <span className="world-music-album-text"><strong title={album.title}>{album.title}</strong><small>{t(`world.music.source.${sourceOf(album)}`)}{(album.artist || album.releaseDate) && ` · ${album.artist || album.releaseDate}`}</small></span>
                <span className="world-music-count">{album.tracksLoaded ? `${album.tracks.length}${album.tracksPartial ? '+' : ''}` : '…'}</span>
              </button>
              {isExpanded && (
                <div className="world-music-tracklist">
                  {album.neteaseId && <div className="world-music-album-tools">
                    <button className="world-btn" data-music-play-album={album.id} onClick={() => music.playCloud({ gameId: props.gameId, gameTitle: props.gameTitle }, { id: album.neteaseId!, type: 1, title: album.title, sourceUrl: album.sourceUrl })}><Play size={12} />{t('world.music.playAlbum')}</button>
                    <p className="world-music-note">{t('world.music.partialTracks')}</p>
                  </div>}
                  {isLoading && <div className="world-music-empty"><Loader2 size={14} className="is-spinning" />{t('world.music.loadingTracks')}</div>}
                  {!isLoading && !album.tracks.length && !album.neteaseId && <div className="world-music-empty compact">{t(albumError === album.id ? 'world.music.failed' : 'world.music.noTracks')}</div>}
                  {!isLoading && album.tracks.map(track => (
                    <div className={'world-music-track' + (currentTrack?.id === track.id ? ' is-current' : '')} key={track.id} data-world-music-track={track.id}>
                      <button className="world-music-play" disabled={!track.localPath && !track.neteaseId} aria-label={`${t(track.neteaseId ? 'world.music.playNetease' : 'world.music.play')} ${track.title}`} title={track.neteaseId ? t('world.music.playNetease') : track.localPath ? t('world.music.play') : t('world.music.noLocalAudio')} onClick={() => void playTrack(track)}>
                        {currentTrack?.id === track.id && playing ? <Pause size={12} fill="currentColor" /> : <Play size={12} fill="currentColor" />}
                      </button>
                      <span className="world-music-number">{track.number}</span>
                      <span className="world-music-track-title"><strong title={track.title}>{track.title}</strong>{track.artist && <small>{track.artist}</small>}{track.originalTitle && language === 'en' && <small>{track.originalTitle}</small>}</span>
                      <span className="world-music-duration">{track.duration || '—'}</span>
                    </div>
                  ))}
                  {album.sourceUrl && <a className="world-music-source" href={album.sourceUrl} target="_blank" rel="noreferrer"><ExternalLink size={11} />{t('world.music.openSource')}</a>}
                </div>
              )}
            </section>
          )
        })}
      </div>

      <div className="world-music-player">
        <p className="world-music-note">{t('world.music.backgroundHint')}</p>
        {music.selection && <button className="world-btn" onClick={() => music.setExpanded(true)}><Music2 size={12} />{t('world.music.showPlayer')}</button>}
      </div>
    </aside>
  )
}
