import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { flushSync } from 'react-dom'
import { ChevronDown, ChevronUp, ExternalLink, Music2, Pause, Play, Square } from 'lucide-react'
import type { WorldMusicTrack } from '../../../shared/types'
import { toLocalFileUrl } from '../../utils/media'
import { useTranslation } from '../../i18n/useTranslation'
import './musicPlayback.css'

interface MusicOwner { gameId: string; gameTitle: string }
interface CloudSelection { id: string; type: 1 | 2; title: string; sourceUrl: string }
type Selection = MusicOwner & (
  | { kind: 'local'; title: string; track: WorldMusicTrack }
  | { kind: 'netease'; title: string; cloud: CloudSelection; track?: WorldMusicTrack }
)
interface MusicPlayback {
  selection: Selection | null
  playing: boolean
  playError: boolean
  expanded: boolean
  audioRef: RefObject<HTMLAudioElement>
  setExpanded(expanded: boolean): void
  setPlaying(playing: boolean): void
  setPlayError(error: boolean): void
  playTrack(owner: MusicOwner, track: WorldMusicTrack): Promise<void>
  playCloud(owner: MusicOwner, cloud: CloudSelection, track?: WorldMusicTrack): void
  stop(): void
}

const MusicContext = createContext<MusicPlayback | null>(null)

export function MusicPlaybackProvider({ children }: { children: ReactNode }) {
  const [selection, setSelection] = useState<Selection | null>(null)
  const [playing, setPlaying] = useState(false)
  const [playError, setPlayError] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const audioRef = useRef<HTMLAudioElement>(null)
  const revision = useRef(0)

  const clearLocalAudio = useCallback(() => {
    const audio = audioRef.current
    if (!audio) return
    audio.pause()
    audio.removeAttribute('src')
    audio.load()
  }, [])

  const stop = useCallback(() => {
    revision.current++
    clearLocalAudio()
    setSelection(null)
    setPlaying(false)
    setPlayError(false)
    setExpanded(false)
  }, [clearLocalAudio])

  useEffect(() => {
    // The preload invokes this synchronously for every launch entry point.
    // Flush the iframe removal before the launch IPC can start the game.
    return window.api.onBeforeGameLaunch(() => flushSync(stop))
  }, [stop])

  useEffect(() => () => {
    revision.current++
    audioRef.current?.pause()
  }, [])

  const playCloud = useCallback((owner: MusicOwner, cloud: CloudSelection, track?: WorldMusicTrack) => {
    if (!/^[1-9]\d{0,17}$/.test(cloud.id)) return
    revision.current++
    clearLocalAudio()
    setPlaying(false)
    setPlayError(false)
    setSelection({ ...owner, kind: 'netease', title: cloud.title, cloud, track })
    setExpanded(true)
  }, [clearLocalAudio])

  const playTrack = useCallback(async (owner: MusicOwner, track: WorldMusicTrack) => {
    if (track.neteaseId) {
      playCloud(owner, { id: track.neteaseId, type: 2, title: track.title, sourceUrl: `https://music.163.com/#/song?id=${track.neteaseId}` }, track)
      return
    }
    const audio = audioRef.current
    if (!track.localPath || !audio) return
    const operation = ++revision.current
    const url = toLocalFileUrl(track.localPath)
    setPlayError(false)
    if (audio.getAttribute('src') === url && !audio.paused) { audio.pause(); return }
    // A new local track replaces the cloud iframe before audio can start.
    flushSync(() => setSelection({ ...owner, kind: 'local', title: track.title, track }))
    if (audio.getAttribute('src') !== url) {
      audio.src = url
      audio.load()
    }
    setExpanded(true)
    try { await audio.play() } catch {
      if (revision.current === operation) { setPlaying(false); setPlayError(true) }
    }
  }, [playCloud])

  return <MusicContext.Provider value={{ selection, playing, playError, expanded, audioRef, setExpanded, setPlaying, setPlayError, playTrack, playCloud, stop }}>{children}</MusicContext.Provider>
}

export function useMusicPlayback(): MusicPlayback {
  const playback = useContext(MusicContext)
  if (!playback) throw new Error('MusicPlaybackProvider is required')
  return playback
}

// Mounted once in the app shell. Collapsing only hides controls; the audio and
// iframe stay in the same DOM parent through navigation and window minimization.
export function BackgroundMusicPlayer() {
  const music = useMusicPlayback()
  const { t } = useTranslation()
  const { selection, playing, expanded } = music
  const cloud = selection?.kind === 'netease' ? selection.cloud : null
  return (
    <section className="background-music" hidden={!selection} data-background-music={selection?.kind || 'idle'} aria-label={t('world.music.background')}>
      <Music2 size={17} className="background-music-icon" />
      <button className="background-music-title" onClick={() => music.setExpanded(!expanded)} aria-expanded={expanded} data-music-controls>
        <strong>{selection?.title}</strong>
        <small>{selection?.gameTitle} · {t(cloud ? 'world.music.source.netease' : 'world.music.source.local')} · {t('world.music.background')}</small>
      </button>
      <span className="background-music-policy">{t('world.music.stopOnLaunch')}</span>
      {selection?.kind === 'local' && <button className="background-music-button" onClick={() => void music.playTrack(selection, selection.track)} aria-label={t(playing ? 'world.music.pause' : 'world.music.play')} data-music-toggle>
        {playing ? <Pause size={15} /> : <Play size={15} />}
      </button>}
      <button className="background-music-button" onClick={() => music.setExpanded(!expanded)} title={t(expanded ? 'world.music.collapsePlayer' : 'world.music.showPlayer')} aria-label={t(expanded ? 'world.music.collapsePlayer' : 'world.music.showPlayer')} data-music-expand>
        {expanded ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
      </button>
      <button className="background-music-button" onClick={music.stop} title={t('world.music.stop')} aria-label={t('world.music.stop')} data-music-stop><Square size={14} /></button>

      <div className={'background-music-controls' + (expanded ? ' is-expanded' : '')} aria-hidden={!expanded}>
        <div className="background-music-controls-title"><strong>{selection?.title}</strong><button onClick={() => music.setExpanded(false)} title={t('world.music.collapsePlayer')} aria-label={t('world.music.collapsePlayer')}><ChevronDown size={15} /></button></div>
        {cloud && <>
          <iframe key={`${cloud.type}:${cloud.id}`} data-netease-player className={'background-music-embed' + (cloud.type === 1 ? ' is-album' : '')} title={`${t('world.music.neteasePlayer')} · ${cloud.title}`}
            src={`https://music.163.com/outchain/player?type=${cloud.type}&id=${cloud.id}&auto=1&height=${cloud.type === 1 ? 310 : 66}`}
            sandbox="allow-scripts allow-same-origin allow-popups" allow="autoplay; encrypted-media" referrerPolicy="no-referrer" />
          <a href={cloud.sourceUrl} target="_blank" rel="noreferrer"><ExternalLink size={11} />{t('world.music.openNetease')}</a>
          <p>{t('world.music.playbackHint')}</p>
        </>}
        <audio ref={music.audioRef} data-music-audio hidden={!!cloud} controls preload="metadata" onPlay={() => { music.setPlaying(true); music.setPlayError(false) }} onPause={() => music.setPlaying(false)} onEnded={() => music.setPlaying(false)} onError={() => { music.setPlaying(false); music.setPlayError(true) }} />
        {music.playError && <p role="status">{t('world.music.playError')}</p>}
        <p>{t('world.music.backgroundHint')}</p>
      </div>
    </section>
  )
}
