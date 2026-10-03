import { contextBridge, ipcRenderer } from 'electron'
import type { NeteaseMusicInfo } from '../shared/types'
import type { EgsSite, ManualEgsRatingInput, GameRating, RatingCandidate, RatingProvider, Game, ScanCandidate, ScanProgress, VndbSearchResult, AppSettings, WorldAnalysis, WorldInfo, WorldState, AiStatus, LegacyWorldRecord, WorldMusicInfo, WorldMusicAlbum } from '../shared/types'
import { IPC_CHANNELS } from '../shared/constants'
import type { WorldMetadata } from '../shared/types'
import type { HubInfo, CustomizationInput } from '../shared/types'

// Type-safe API exposed to the renderer process
const beforeGameLaunch = new Set<() => void>()
const api = {
  // Library
  getAllGames: (): Promise<Game[]> =>
    ipcRenderer.invoke(IPC_CHANNELS.GET_ALL_GAMES),

  getGame: (id: string): Promise<Game | null> =>
    ipcRenderer.invoke(IPC_CHANNELS.GET_GAME, id),

  addGame: (game: Game): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.ADD_GAME, game),

  updateGame: (id: string, fields: Partial<Game>): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.UPDATE_GAME, id, fields),

  deleteGame: (id: string): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.DELETE_GAME, id),

  searchGames: (query: string): Promise<Game[]> =>
    ipcRenderer.invoke(IPC_CHANNELS.SEARCH_GAMES, query),

  // Scanner
  startScan: (roots: string[]): Promise<ScanCandidate[]> =>
    ipcRenderer.invoke(IPC_CHANNELS.START_SCAN, roots),

  cancelScan: (): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.CANCEL_SCAN),

  onScanProgress: (callback: (progress: ScanProgress) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, progress: ScanProgress) =>
      callback(progress)
    ipcRenderer.on(IPC_CHANNELS.SCAN_PROGRESS, handler)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.SCAN_PROGRESS, handler)
  },

  // Cover
  getWorldMetadata: (gameId: string, force = false): Promise<WorldMetadata> =>
    ipcRenderer.invoke(IPC_CHANNELS.GET_WORLD_METADATA, gameId, force),
  findLocalCovers: (gameDir: string): Promise<string[]> =>
    ipcRenderer.invoke(IPC_CHANNELS.FIND_LOCAL_COVERS, gameDir),

  searchVndb: (title: string): Promise<VndbSearchResult[]> =>
    ipcRenderer.invoke(IPC_CHANNELS.SEARCH_VNDB, title),

  downloadVndbCover: (gameId: string, imageUrl: string): Promise<string> =>
    ipcRenderer.invoke(IPC_CHANNELS.DOWNLOAD_VNDB_COVER, gameId, imageUrl),

  extractExeIcon: (gameId: string, exePath: string): Promise<string | null> =>
    ipcRenderer.invoke(IPC_CHANNELS.EXTRACT_EXE_ICON, gameId, exePath),

  copyCoverFile: (gameId: string, sourcePath: string): Promise<string> =>
    ipcRenderer.invoke(IPC_CHANNELS.COPY_COVER_FILE, gameId, sourcePath),

  // Launcher
  launchGame: (gameId: string): Promise<{ success: boolean; error?: string }> => {
    beforeGameLaunch.forEach(stopMusic => stopMusic())
    return ipcRenderer.invoke(IPC_CHANNELS.LAUNCH_GAME, gameId)
  },

  onBeforeGameLaunch: (callback: () => void): (() => void) => {
    beforeGameLaunch.add(callback)
    return () => { beforeGameLaunch.delete(callback) }
  },

  openGameDir: (gameDir: string): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.OPEN_GAME_DIR, gameDir),

  // Dialog
  selectDirectory: (): Promise<string[] | null> =>
    ipcRenderer.invoke(IPC_CHANNELS.SELECT_DIRECTORY),

  selectFile: (filters: { name: string; extensions: string[] }[]): Promise<string | null> =>
    ipcRenderer.invoke(IPC_CHANNELS.SELECT_FILE, filters),

  // Settings
  getSettings: (): Promise<AppSettings> =>
    ipcRenderer.invoke(IPC_CHANNELS.GET_SETTINGS),

  updateSettings: (settings: Partial<AppSettings>): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.UPDATE_SETTINGS, settings),

  saveManualRating: (gameId: string, vndbId: string | null, input: ManualEgsRatingInput): Promise<GameRating> =>
    ipcRenderer.invoke(IPC_CHANNELS.SAVE_MANUAL_RATING, gameId, vndbId, input),
  clearManualRating: (gameId: string, vndbId: string | null): Promise<GameRating> =>
    ipcRenderer.invoke(IPC_CHANNELS.CLEAR_MANUAL_RATING, gameId, vndbId),
  getGameRating: (gameId: string, provider: RatingProvider, force = false): Promise<GameRating> =>
    ipcRenderer.invoke(IPC_CHANNELS.GET_GAME_RATING, gameId, provider, force),
  searchRatingCandidates: (gameId: string, query: string): Promise<RatingCandidate[]> =>
    ipcRenderer.invoke(IPC_CHANNELS.SEARCH_RATING_CANDIDATES, gameId, query),
  selectRatingCandidate: (gameId: string, vndbId: string | null, subjectId: number): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.SELECT_RATING_CANDIDATE, gameId, vndbId, subjectId),
  openRatingSource: (provider: RatingProvider, id: string, site?: EgsSite): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.OPEN_RATING_SOURCE, provider, id, site),

  // World
  getWorld: (gameId: string, options?: { force?: boolean; regenerate?: boolean }): Promise<WorldInfo> =>
    ipcRenderer.invoke(IPC_CHANNELS.GET_WORLD, gameId, options),
  getHubWorld: (): Promise<HubInfo> =>
    ipcRenderer.invoke(IPC_CHANNELS.GET_HUB_WORLD),

  getWorldMusic: (gameId: string, force = false): Promise<WorldMusicInfo> =>
    ipcRenderer.invoke(IPC_CHANNELS.GET_WORLD_MUSIC, gameId, force),

  getWorldMusicAlbum: (gameId: string, albumId: string, force = false): Promise<WorldMusicAlbum> =>
    ipcRenderer.invoke(IPC_CHANNELS.GET_WORLD_MUSIC_ALBUM, gameId, albumId, force),
  searchNeteaseMusic: (gameId: string, query?: string, force = false): Promise<NeteaseMusicInfo> =>
    ipcRenderer.invoke(IPC_CHANNELS.SEARCH_NETEASE_MUSIC, gameId, query, force),
  saveWorld: (gameId: string, input: CustomizationInput): Promise<WorldState> =>
    ipcRenderer.invoke(IPC_CHANNELS.SAVE_WORLD, gameId, input),
  analyzeWorld: (gameId: string): Promise<WorldAnalysis> =>
    ipcRenderer.invoke(IPC_CHANNELS.ANALYZE_WORLD, gameId),
  analyzeWorldQueue: (): Promise<{ analyzed: number; remaining: number }> =>
    ipcRenderer.invoke(IPC_CHANNELS.ANALYZE_WORLD_QUEUE),
  migrateWorldProps: (records: LegacyWorldRecord[]): Promise<{ migrated: number; keys: string[] }> =>
    ipcRenderer.invoke(IPC_CHANNELS.MIGRATE_WORLD_PROPS, records),
  getAiStatus: (): Promise<AiStatus> =>
    ipcRenderer.invoke(IPC_CHANNELS.AI_STATUS),
  saveAiSettings: (input: { baseUrl?: string; model?: string; apiKey?: string; autoAnalyze?: boolean }): Promise<AiStatus> =>
    ipcRenderer.invoke(IPC_CHANNELS.AI_SAVE, input),
  testAiConnection: (): Promise<{ ok: boolean; message: string; encrypted: boolean }> =>
    ipcRenderer.invoke(IPC_CHANNELS.AI_TEST),

  // Window controls
  minimizeWindow: (): void => ipcRenderer.send(IPC_CHANNELS.WINDOW_MINIMIZE),
  maximizeWindow: (): void => ipcRenderer.send(IPC_CHANNELS.WINDOW_MAXIMIZE),
  closeWindow: (): void => ipcRenderer.send(IPC_CHANNELS.WINDOW_CLOSE),
}

// Embedded music pages must never receive the library or launcher bridge.
if (process.isMainFrame) contextBridge.exposeInMainWorld('api', api)

export type ElectronAPI = typeof api
