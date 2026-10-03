import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeft, Compass, Globe2, Hammer, Home, Loader2, Music2, Play, RotateCw, Sparkles,
  Trash2, Trees, Undo2, X, ZoomOut
} from 'lucide-react'
import { HUB_WORLD_ID } from '../../../shared/constants'
import type {
  Game, LegacyWorldRecord, PlacedObject, WorldAnalysis, WorldBlueprint, WorldElement,
  WorldInfo, WorldMusicInfo, WorldQuality, WorldState
} from '../../../shared/types'
import type { HubInfo } from '../../../shared/types'
import { PALETTES, type Biome } from '../../../shared/worldRules'
import { freeSlotFor } from '../../../shared/worldBlueprint'
import { BUILDABLE_IDS, catalogModel } from '../../../shared/worldCatalog'
import { useGameStore } from '../../store/gameStore'
import { useUIStore } from '../../store/uiStore'
import { useTranslation } from '../../i18n/useTranslation'
import { en, zh, type TranslationKey } from '../../i18n/translations'
import { toLocalFileUrl } from '../../utils/media'
import { PlanetCatalog } from './PlanetCatalog'
import { WorldFeaturePanel } from './WorldFeaturePanel'
import { WorldMusicWindow } from './WorldMusicWindow'
import { createWorldEngine, type EngineMode, type PlaceBlock, type WorldEngine } from './scene/worldEngine'
import './world.css'

// The React shell around the 3D engine: it loads a world, hands the scene to the
// engine and hosts the catalogue, the build tools and the world feature panel.

interface WorldBundle {
  game: Game | null
  blueprint: WorldBlueprint
  state: WorldState
  analysis: WorldAnalysis | null
  imageUrl: string | null
  metadataStatus: string
}

interface WorldPatch {
  placements?: PlacedObject[]
  addedElements?: WorldElement[]
  removedElementIds?: string[]
  launchElementId?: string | null
}

const LEGACY_PREFIX = 'gal-world-props:'

const PLACE_KEY: Record<PlaceBlock, TranslationKey> = {
  outside: 'world.place.outside',
  plaza: 'world.place.plaza',
  corridor: 'world.place.corridor',
  dock: 'world.place.dock',
  taken: 'world.place.taken',
  river: 'world.place.river'
}

const STATUS_KEY: Record<string, TranslationKey> = {
  ready: 'world.sync.ready',
  cached: 'world.sync.cached',
  disabled: 'world.sync.disabled',
  error: 'world.sync.error',
  local: 'world.sync.local'
}

// The control hints read as one sentence in each language; the dots between the
// clauses are their own elements so the row's flex gap spaces them evenly.
function Hint({ text, extra }: { text: string; extra?: string }) {
  const parts = [text, extra].filter(Boolean).join(' · ').split('·').map(part => part.trim()).filter(Boolean)
  return (
    <>
      {parts.map((part, index) => (
        <Fragment key={part + index}>
          {index > 0 && <span>·</span>}
          <span>{part}</span>
        </Fragment>
      ))}
    </>
  )
}

export function WorldView() {
  const { t, language } = useTranslation()
  // Messages raised from callbacks and from the engine effect read the wording
  // through a ref: `t` changes identity with the language, and keying the scene
  // rebuild on it would flash the island every time the wording changes.
  const tRef = useRef(t)
  tRef.current = t
  // The catalogue and the palettes ship both names; the reader picks which one.
  const nameOf = (model: { name: string; nameEn: string }): string => (language === 'en' ? model.nameEn : model.name)
  const libraryGames = useGameStore(state => state.games)
  const addToast = useUIStore(state => state.addToast)
  const [games, setGames] = useState<Game[]>(libraryGames)
  const [worldId, setWorldId] = useState<string | null>(null)
  const [bundle, setBundle] = useState<WorldBundle | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [quality, setQuality] = useState<WorldQuality>('high')
  const [mode, setMode] = useState<EngineMode>('roam')
  const [tool, setTool] = useState<string | null>(null)
  const [placeBlock, setPlaceBlock] = useState<PlaceBlock | null>(null)
  const [undoReady, setUndoReady] = useState(false)
  const [selected, setSelected] = useState<PlacedObject | null>(null)
  const [panel, setPanel] = useState(false)
  const [catalog, setCatalog] = useState(false)
  const [music, setMusic] = useState<WorldMusicInfo | null>(null)
  const [musicLoading, setMusicLoading] = useState(false)
  const [musicOpen, setMusicOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [launching, setLaunching] = useState(false)
  const [paused, setPaused] = useState(false)
  const [fading, setFading] = useState(false)
  const [reloadToken, setReloadToken] = useState(0)
  // Bumped whenever a freshly loaded world lands, so the renderer is rebuilt for
  // it: React skips the intermediate "loading" render when the query answers in
  // the same tick, and the scene would otherwise keep the previous island.
  const [loadToken, setLoadToken] = useState(0)

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const launchLabelRef = useRef<HTMLButtonElement>(null)
  const engineRef = useRef<WorldEngine | null>(null)
  const bundleRef = useRef<WorldBundle | null>(null)
  const saves = useRef(new Set<Promise<void>>())
  const saveRevision = useRef(0)
  const launchBusy = useRef(false)

  bundleRef.current = bundle

  const worldKey = worldId || HUB_WORLD_ID
  // Identity of the scene the engine effect builds; the canvas carries it as a key
  // so a rebuilt engine always starts from a fresh, unspent WebGL context.
  const stageKey = `${worldKey}:${loadToken}:${quality}`
  const recognized = useMemo(() => games.filter(game => !!game.vndbId), [games])
  const biome: Biome = (bundle?.analysis?.biome as Biome) || (worldId ? 'garden' : 'hub')
  const palette = PALETTES[biome] || PALETTES.garden
  const coverUrl = bundle?.game ? toLocalFileUrl(bundle.imageUrl || bundle.game.coverPath) : ''
  const elements = useMemo<WorldElement[]>(() => {
    if (!bundle || !worldId) return []
    const removed = new Set(bundle.state.removedElementIds)
    const seen = new Set<string>()
    return [...(bundle.analysis?.elements || []), ...bundle.state.addedElements]
      .filter(item => !removed.has(item.id) && !seen.has(item.id) && !!seen.add(item.id))
  }, [bundle, worldId])

  // --- loading ---------------------------------------------------------------

  useEffect(() => {
    let active = true
    window.api.getAllGames().then(all => { if (active) setGames(all) }).catch(() => {})
    return () => { active = false }
  }, [libraryGames])

  useEffect(() => {
    window.api.getSettings().then(settings => setQuality(settings.worldQuality || 'high')).catch(() => {})
    // A new tier has to reach the scene that is already running: the settings panel
    // closes over this view, and the engine effect rebuilds on a quality change.
    const onSettings = (event: Event): void => {
      const worldQuality = (event as CustomEvent<{ worldQuality?: WorldQuality }>).detail?.worldQuality
      if (worldQuality) setQuality(current => (current === worldQuality ? current : worldQuality))
    }
    window.addEventListener('gal:settings', onSettings)
    return () => window.removeEventListener('gal:settings', onSettings)
  }, [])

  // Older builds kept the layout in localStorage; hand it to the database once.
  useEffect(() => {
    const records: LegacyWorldRecord[] = []
    for (let index = 0; index < localStorage.length; index++) {
      const key = localStorage.key(index)
      if (!key || !key.startsWith(LEGACY_PREFIX)) continue
      try {
        const props = JSON.parse(localStorage.getItem(key) || '[]') as LegacyWorldRecord['props']
        if (Array.isArray(props)) records.push({ key, props })
      } catch { /* unreadable legacy entry — leave it where it is */ }
    }
    if (!records.length) return
    window.api.migrateWorldProps(records)
      .then(result => { for (const key of result.keys) localStorage.removeItem(key) })
      .catch(() => {})
  }, [])

  // Works linked since the last visit are analyzed in the background.
  useEffect(() => {
    window.api.getAiStatus().then(status => {
      if (!status.autoAnalyze || !status.baseUrl) return
      return window.api.analyzeWorldQueue().then(result => {
        if (result.analyzed > 0) setReloadToken(token => token + 1)
      })
    }).catch(() => {})
  }, [])

  useEffect(() => {
    let active = true
    setLoading(true)
    setError(null)
    setBundle(null)
    setMusic(null)
    setMusicOpen(Boolean(worldId))
    setSelected(null)
    setUndoReady(false)
    setPaused(false)
    setMode('roam')
    setTool(null)
    const request: Promise<WorldInfo | HubInfo> = worldId
      ? window.api.getWorld(worldId)
      : window.api.getHubWorld()
    request.then(result => {
      if (!active) return
      setBundle('game' in result
        ? {
            game: result.game, blueprint: result.blueprint, state: result.state,
            analysis: result.analysis, imageUrl: result.imageUrl, metadataStatus: result.metadataStatus
          }
        : { game: null, blueprint: result.blueprint, state: result.state, analysis: null, imageUrl: null, metadataStatus: 'local' })
      setLoadToken(token => token + 1)
      setLoading(false)
    }).catch((reason: Error) => {
      if (!active) return
      setError(reason?.message || tRef.current('world.openFailed'))
      setLoading(false)
    })
    return () => { active = false }
  }, [worldId, reloadToken])

  useEffect(() => {
    let active = true
    if (!worldId) {
      setMusic(null)
      setMusicLoading(false)
      return () => { active = false }
    }
    setMusicLoading(true)
    window.api.getWorldMusic(worldId)
      .then(result => { if (active) setMusic(result) })
      .catch(() => { if (active) setMusic(null) })
      .finally(() => { if (active) setMusicLoading(false) })
    return () => { active = false }
  }, [worldId, reloadToken])

  // --- engine ----------------------------------------------------------------

  const handleLaunch = useCallback(async () => {
    const game = bundleRef.current?.game
    if (!game || launchBusy.current) return
    launchBusy.current = true
    setLaunching(true)
    try {
      const result = await window.api.launchGame(game.id)
      addToast(
        result.success ? tRef.current('world.launchingGame', { title: game.title }) : result.error || tRef.current('world.launchFailed'),
        result.success ? 'success' : 'error'
      )
      if (result.success) {
        // The game takes the screen; stop drawing until the player comes back.
        engineRef.current?.pause()
        setPaused(true)
      }
    } catch {
      addToast(tRef.current('world.launchFailed'), 'error')
    } finally {
      launchBusy.current = false
      setLaunching(false)
    }
  }, [addToast])

  const handleDirty = useCallback((patch: { placements: PlacedObject[]; removedElementIds: string[] }) => {
    setUndoReady(true)
    const key = worldId || HUB_WORLD_ID
    const revision = ++saveRevision.current
    const snapshot = { placements: patch.placements.map(item => ({ ...item })), removedElementIds: [...patch.removedElementIds] }
    const current = bundleRef.current
    if (current?.state.gameId === key) {
      const next = { ...current, state: { ...current.state, ...snapshot } }
      bundleRef.current = next
      setBundle(next)
    }
    // Commit before navigation or unmount. A delayed response must also never
    // overwrite the state of the next island the player opens.
    const request = window.api.saveWorld(key, snapshot).then(state => {
      if (bundleRef.current?.state.gameId !== key || revision !== saveRevision.current) return
      setBundle(previous => previous?.state.gameId === key ? { ...previous, state } : previous)
    }).catch(() => addToast(tRef.current('world.saveFailed'), 'error'))
    saves.current.add(request)
    void request.finally(() => saves.current.delete(request))
  }, [worldId, addToast])

  useEffect(() => {
    const canvas = canvasRef.current
    const current = bundleRef.current
    if (loading || !canvas || !current) return
    let engine: WorldEngine | null = null
    try {
      engine = createWorldEngine({
        canvas,
        blueprint: current.blueprint,
        state: current.state,
        quality,
        onLaunch: () => { void handleLaunch() },
        onInspect: prop => {
          if (!worldId && engineRef.current?.mode === 'roam' && prop?.modelId === 'globe_monument') {
            setCatalog(true)
            return
          }
          setSelected(prop)
          if (!engineRef.current?.tool) setTool(null)
        },
        onDirty: handleDirty,
        onModeChange: setMode,
        onHint: setPlaceBlock,
        launchLabel: launchLabelRef.current
      })
      engineRef.current = engine
      // Where things are drawn, for the UI suite and for anything that needs to
      // point at the scene from the DOM.
      window.galWorldProbe = {
        screenPoint: (x, z) => engine!.screenPoint(x, z),
        launchScreenPoint: () => engine!.launchScreenPoint(),
        propScreenPoint: id => engine!.propScreenPoint(id),
        stats: () => engine!.stats()
      }
    } catch (reason) {
      console.error('World renderer failed:', reason)
      setError(tRef.current('world.stageFailed'))
    }
    return () => {
      delete window.galWorldProbe
      engine?.dispose()
      if (engineRef.current === engine) engineRef.current = null
    }
  }, [worldKey, loadToken, quality, loading, handleDirty, handleLaunch])

  useEffect(() => {
    const onVisibility = (): void => {
      if (!engineRef.current) return
      if (document.hidden) engineRef.current.pause()
      else if (!paused) engineRef.current.resume()
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [paused])

  // --- world feature edits ---------------------------------------------------

  const persist = useCallback(async (patch: WorldPatch): Promise<WorldState> => {
    await Promise.all([...saves.current])
    ++saveRevision.current
    const state = await window.api.saveWorld(worldId || HUB_WORLD_ID, patch)
    setBundle(previous => previous?.state.gameId === state.gameId ? { ...previous, state } : previous)
    return state
  }, [worldId])

  const addElement = useCallback(async (modelId: string, name: string) => {
    const current = bundleRef.current
    const model = catalogModel(modelId)
    if (!current || !model) return
    setBusy(true)
    try {
      const slot = freeSlotFor(current.blueprint, current.state.placements, modelId)
      if (!slot) {
        addToast(tRef.current('world.noRoom'), 'info')
        return
      }
      const key = `u${Date.now().toString(36)}`
      const element: WorldElement = {
        id: model.id, name, nameEn: model.nameEn, category: model.category,
        // The row outlives whichever screen wrote it, so the reason is stored in
        // both languages rather than in the one the player happened to be using.
        reason: zh['world.addedByYou'], reasonEn: en['world.addedByYou'],
        launchable: model.interactive
      }
      const state = await persist({
        placements: [...current.state.placements, { id: key, addedId: key, modelId, x: slot.x, z: slot.z, rot: slot.rot }],
        addedElements: [...current.state.addedElements.filter(item => item.id !== modelId), element],
        removedElementIds: current.state.removedElementIds.filter(id => id !== modelId)
      })
      engineRef.current?.refreshState(state)
    } catch {
      addToast(tRef.current('world.addFailed'), 'error')
    } finally {
      setBusy(false)
    }
  }, [persist, addToast])

  const removeElement = useCallback(async (modelId: string) => {
    const current = bundleRef.current
    if (!current) return
    setBusy(true)
    try {
      const state = await persist({
        placements: current.state.placements.filter(item => item.modelId !== modelId),
        addedElements: current.state.addedElements.filter(item => item.id !== modelId),
        removedElementIds: [...new Set([...current.state.removedElementIds, modelId])],
        launchElementId: current.state.launchElementId === modelId ? null : current.state.launchElementId
      })
      engineRef.current?.refreshState(state)
    } catch {
      addToast(tRef.current('world.removeFailed'), 'error')
    } finally {
      setBusy(false)
    }
  }, [persist, addToast])

  const setLaunch = useCallback(async (modelId: string | null) => {
    const current = bundleRef.current
    if (!current) return
    setBusy(true)
    try {
      const state = await persist({ launchElementId: modelId })
      engineRef.current?.refreshState(state)
    } catch {
      addToast(tRef.current('world.launchSaveFailed'), 'error')
    } finally {
      setBusy(false)
    }
  }, [persist, addToast])

  const reanalyze = useCallback(async (regenerate: boolean) => {
    if (!worldId) return
    setBusy(true)
    try {
      await Promise.all([...saves.current])
      const result = await window.api.getWorld(worldId, regenerate ? { regenerate: true } : { force: true })
      setBundle({
        game: result.game, blueprint: result.blueprint, state: result.state,
        analysis: result.analysis, imageUrl: result.imageUrl, metadataStatus: result.metadataStatus
      })
      setLoadToken(token => token + 1)
      setMode('roam'); setTool(null); setSelected(null); setUndoReady(false)
      addToast(tRef.current(regenerate ? 'world.regenerated' : 'world.reanalyzed'), 'success')
    } catch {
      addToast(tRef.current('world.analyzeFailed'), 'error')
    } finally {
      setBusy(false)
    }
  }, [worldId, addToast])

  // --- navigation ------------------------------------------------------------

  const enterWorld = useCallback(async (id: string | null) => {
    setFading(true)
    setCatalog(false)
    setPanel(false)
    await Promise.all([...saves.current])
    window.setTimeout(() => {
      setWorldId(id)
      setFading(false)
    }, 220)
  }, [])

  function chooseTool(modelId: string | null): void {
    engineRef.current?.setTool(modelId)
    setTool(modelId)
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      if (tool) chooseTool(null)
      else if (panel) setPanel(false)
      else if (musicOpen) setMusicOpen(false)
      else if (catalog) setCatalog(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const toggleBuild = (): void => {
    const engine = engineRef.current
    if (!engine) return
    const next: EngineMode = mode === 'build' ? 'roam' : 'build'
    engine.setMode(next)
    setMode(next)
    if (next === 'roam') { engine.setTool(null); setTool(null) }
    else setCatalog(false)
  }

  const resume = (): void => {
    if (!paused) return
    setPaused(false)
    engineRef.current?.resume()
  }

  const refreshMusic = useCallback(() => {
    if (!worldId) return
    setMusicLoading(true)
    window.api.getWorldMusic(worldId, true)
      .then(result => { if (bundleRef.current?.game?.id === worldId) setMusic(result) })
      .catch(() => { if (bundleRef.current?.game?.id === worldId) addToast(tRef.current('world.music.failed'), 'error') })
      .finally(() => { if (bundleRef.current?.game?.id === worldId) setMusicLoading(false) })
  }, [worldId, addToast])

  const selectedModel = selected ? catalogModel(selected.modelId) : null
  const launchModel = bundle && catalogModel(bundle.state.launchElementId || bundle.blueprint.defaultLaunchElementId || '')

  return (
    <section className={'world-shell' + (mode === 'build' ? ' is-building' : '')} data-world-biome={worldId ? biome : 'hub'}>
      <div className="world-stage" onPointerDown={resume}>
        {/* Each engine gets a canvas of its own: teardown releases the WebGL
            context outright, and a released context cannot be drawn into again. */}
        <canvas key={stageKey} ref={canvasRef} className="world-canvas" aria-label={t('world.canvas')} />
        <div className="world-vignette" />
        {worldId && launchModel && <button ref={launchLabelRef} className="world-bound-label" data-world-action="bound-object" onClick={() => void handleLaunch()}>
          <Play size={11} fill="currentColor" />{nameOf(launchModel)}
        </button>}

        <header className="world-topbar">
          <div className="world-identity">
            <span className="world-eyebrow"><Compass size={12} />{t(worldId ? 'world.workWorld' : 'world.hub')}</span>
            <strong>{bundle?.game?.title || t('world.hubName')}</strong>
            <small>{worldId ? (language === 'en' ? palette.subtitleEn : palette.subtitle) : t('world.hubSubtitle')}</small>
          </div>
          <div className="world-topbar-actions">
            {worldId ? (
              <button className="world-btn world-btn-ghost" data-world-action="back" onClick={() => enterWorld(null)}>
                <ArrowLeft size={14} />{t('world.backToHub')}
              </button>
            ) : (
              <button className={'world-btn' + (catalog ? ' is-active' : '')} data-world-action="catalog" onClick={() => setCatalog(!catalog)}>
                <Globe2 size={14} />{t('world.catalog')}
              </button>
            )}
            {worldId && (
              <button className={'world-btn' + (panel ? ' is-active' : '')} data-world-action="features" onClick={() => { setPanel(!panel); setMusicOpen(false) }}>
                <Sparkles size={14} />{t('world.features')}
              </button>
            )}
            {worldId && (
              <button className={'world-btn' + (musicOpen ? ' is-active' : '')} data-world-action="music" onClick={() => { setMusicOpen(!musicOpen); setPanel(false) }}>
                <Music2 size={14} />{t('world.music.button')}
              </button>
            )}
            <button className={'world-btn' + (mode === 'build' ? ' is-active' : '')} data-world-action="build" onClick={toggleBuild}>
              <Hammer size={14} />{t(mode === 'build' ? 'world.buildDone' : 'world.build')}
            </button>
          </div>
        </header>

        {bundle?.game && mode !== 'build' && !loading && (
          <aside className="world-launch-card">
            <div className="world-mini-cover">
              {coverUrl
                ? <img src={coverUrl} alt="" onError={event => { (event.target as HTMLImageElement).style.visibility = 'hidden' }} />
                : <span style={{ background: palette.accent }}>{bundle.game.title.slice(0, 1)}</span>}
            </div>
            <div className="world-launch-text">
              <strong>{bundle.game.originalTitle || bundle.game.title}</strong>
              <small>{t(STATUS_KEY[bundle.metadataStatus] || 'world.sync.local')}</small>
            </div>
            <button className="world-launch" data-world-action="launch" disabled={launching} onClick={() => void handleLaunch()}>
              <Play size={13} fill="currentColor" />{t(launching ? 'world.launching' : 'world.launch')}
            </button>
          </aside>
        )}

        {selected && selectedModel && mode === 'build' && (
          <div className="world-selection">
            <span>{nameOf(selectedModel)}</span>
            {selected.addedId && <>
              <button className="world-btn" data-world-action="move-selected" onClick={() => { engineRef.current?.moveSelected(); setTool(selected.modelId) }}>{t('world.moveObject')}</button>
              <button className="world-btn" data-world-action="rotate-selected" onClick={() => engineRef.current?.rotateSelected()}><RotateCw size={13} />{t('world.rotate')}</button>
            </>}
            <button
              className="world-btn world-danger"
              data-world-action="delete-selected"
              onClick={() => { engineRef.current?.removeSelected(); setSelected(null); setUndoReady(true) }}
            >
              <Trash2 size={13} />{t('world.remove')}
            </button>
          </div>
        )}

        {loading && <div className="world-loading"><Loader2 size={22} className="is-spinning" /><span>{t('world.generating')}</span></div>}
        {!loading && error && (
          <div className="world-fallback">
            <Compass size={26} />
            <strong>{error}</strong>
            <p>{t('world.errorHint')}</p>
            <button className="world-btn" onClick={() => enterWorld(null)}>{t('world.backToHub')}</button>
          </div>
        )}
        {!loading && !error && !worldId && recognized.length === 0 && (
          <div className="world-fallback">
            <Globe2 size={26} />
            <strong>{t('world.emptyTitle')}</strong>
            <p>{t('world.emptyHint')}</p>
          </div>
        )}

        {paused && !loading && (
          <button className="world-resume" onClick={resume}>
            <Play size={13} fill="currentColor" />{t('world.paused')}
          </button>
        )}

        {/* Inside the stage rather than below it, so the build bar takes its own
            room and the hint sits above it instead of under it. */}
        <div className="world-hint">
          {mode === 'build'
            ? <Hint text={t('world.hintBuild')} />
            : <><kbd>WASD</kbd><Hint text={t('world.hintRoam')} extra={worldId ? t('world.hintRoamLaunch') : undefined} /></>}
        </div>
      </div>

      {mode === 'build' && (
        <div className="world-build-bar">
          <div className="world-build-group">
            {BUILDABLE_IDS.map(id => {
              const model = catalogModel(id)
              if (!model) return null
              return (
                <button
                  key={id}
                  className={'world-btn world-btn-chip' + (tool === id ? ' is-active' : '')}
                  data-world-tool={id}
                  onClick={() => chooseTool(tool === id ? null : id)}
                >
                  {model.category === 'plant' && <Trees size={12} />}{nameOf(model)}
                </button>
              )
            })}
            {/* The ground turns red under a refused spot; this says why, so a
                player who cannot place something is not left guessing. */}
            {tool && placeBlock && <span className="world-place-hint" data-world-hint={placeBlock}>{t(PLACE_KEY[placeBlock])}</span>}
          </div>
          <div className="world-build-group">
            <button className="world-btn" data-world-action="rotate" onClick={() => engineRef.current?.rotateTool()}><RotateCw size={14} />{t('world.rotate')}</button>
            <button
              className="world-btn"
              data-world-action="undo"
              disabled={!undoReady}
              onClick={() => { engineRef.current?.undo(); setUndoReady(engineRef.current?.canUndo ?? false) }}
            >
              <Undo2 size={14} />{t('world.undo')}
            </button>
            <button className="world-btn" data-world-action="frame" onClick={() => engineRef.current?.frameIsland()}><ZoomOut size={14} />{t('world.frameIsland')}</button>
            <button className="world-btn" data-world-action="reset" onClick={() => engineRef.current?.resetCamera()}><Home size={14} />{t('world.followCamera')}</button>
            {tool && <button className="world-btn world-danger" onClick={() => chooseTool(null)}><X size={13} />{t('world.cancelPlace')}</button>}
          </div>
        </div>
      )}

      <PlanetCatalog
        games={recognized}
        currentId={worldId}
        open={!worldId && catalog}
        onEnter={id => enterWorld(id)}
        onBack={() => enterWorld(null)}
        onClose={() => setCatalog(false)}
      />

      {worldId && (
        <WorldMusicWindow
          key={worldId}
          gameId={worldId}
          gameTitle={bundle?.game?.title || ''}
          info={music}
          loading={musicLoading}
          open={musicOpen && !panel}
          onRefresh={refreshMusic}
          onClose={() => setMusicOpen(false)}
        />
      )}

      {worldId && panel && bundle && (
        <WorldFeaturePanel
          analysis={bundle.analysis}
          biome={biome}
          elements={elements}
          removed={bundle.state.removedElementIds.filter(id => !elements.some(element => element.id === id))}
          launchElementId={bundle.state.launchElementId}
          defaultLaunchId={bundle.blueprint.defaultLaunchElementId}
          busy={busy}
          onAdd={(modelId, name) => void addElement(modelId, name)}
          onRemove={modelId => void removeElement(modelId)}
          onSetLaunch={modelId => void setLaunch(modelId)}
          onRegenerate={() => void reanalyze(true)}
          onReanalyze={() => void reanalyze(false)}
          onClose={() => setPanel(false)}
        />
      )}

      <div className={'world-fade' + (fading ? ' is-on' : '')} />
    </section>
  )
}
