import type { Game, ScanCandidate, ScanProgress, VndbSearchResult, AppSettings, WorldAnalysis, WorldInfo, WorldState, AiStatus, LegacyWorldRecord, WorldMusicInfo, WorldMusicAlbum } from '../../shared/types'
import type { ElectronAPI } from '../../main/preload'
import type { NeteaseMusicInfo } from '../../shared/types'
import type { HubInfo, CustomizationInput } from '../../shared/types'

declare global {
  interface Window {
    /** Lets the UI point at the 3D scene: world coordinates to CSS pixels. */
    galWorldProbe?: {
      screenPoint(x: number, z: number): { x: number; y: number } | null
      launchScreenPoint(): { x: number; y: number } | null
      propScreenPoint(id: string): { x: number; y: number } | null
      stats(): import('../components/world/scene/worldEngine').EngineStats
    }
    api: {
      // Library
      saveManualRating: ElectronAPI['saveManualRating']
      clearManualRating: ElectronAPI['clearManualRating']
      getGameRating: ElectronAPI['getGameRating']
      searchRatingCandidates: ElectronAPI['searchRatingCandidates']
      selectRatingCandidate: ElectronAPI['selectRatingCandidate']
      openRatingSource: ElectronAPI['openRatingSource']
      getAllGames: () => Promise<Game[]>
      getGame: (id: string) => Promise<Game | null>
      addGame: (game: Game) => Promise<void>
      updateGame: (id: string, fields: Partial<Game>) => Promise<void>
      deleteGame: (id: string) => Promise<void>
      searchGames: (query: string) => Promise<Game[]>

      // Scanner
      startScan: (roots: string[]) => Promise<ScanCandidate[]>
      cancelScan: () => Promise<void>
      onScanProgress: (callback: (progress: ScanProgress) => void) => () => void

      // Cover
      getWorldMetadata: ElectronAPI['getWorldMetadata']
      findLocalCovers: (gameDir: string) => Promise<string[]>
      searchVndb: (title: string) => Promise<VndbSearchResult[]>
      downloadVndbCover: (gameId: string, imageUrl: string) => Promise<string>
      extractExeIcon: (gameId: string, exePath: string) => Promise<string | null>
      copyCoverFile: (gameId: string, sourcePath: string) => Promise<string>

      // Launcher
      launchGame: (gameId: string) => Promise<{ success: boolean; error?: string }>
      onBeforeGameLaunch: (callback: () => void) => () => void
      openGameDir: (gameDir: string) => Promise<void>

      // Dialog
      selectDirectory: () => Promise<string[] | null>
      selectFile: (filters: { name: string; extensions: string[] }[]) => Promise<string | null>

      // Settings
      getSettings: () => Promise<AppSettings>
      updateSettings: (settings: Partial<AppSettings>) => Promise<void>

      // World
      getWorld: (gameId: string, options?: { force?: boolean; regenerate?: boolean }) => Promise<WorldInfo>
      getHubWorld: () => Promise<HubInfo>
      getWorldMusic: (gameId: string, force?: boolean) => Promise<WorldMusicInfo>
      getWorldMusicAlbum: (gameId: string, albumId: string, force?: boolean) => Promise<WorldMusicAlbum>
      searchNeteaseMusic: (gameId: string, query?: string, force?: boolean) => Promise<NeteaseMusicInfo>
      saveWorld: (gameId: string, input: CustomizationInput) => Promise<WorldState>
      analyzeWorld: (gameId: string) => Promise<WorldAnalysis>
      analyzeWorldQueue: () => Promise<{ analyzed: number; remaining: number }>
      migrateWorldProps: (records: LegacyWorldRecord[]) => Promise<{ migrated: number; keys: string[] }>
      getAiStatus: () => Promise<AiStatus>
      saveAiSettings: (input: { baseUrl?: string; model?: string; apiKey?: string; autoAnalyze?: boolean }) => Promise<AiStatus>
      testAiConnection: () => Promise<{ ok: boolean; message: string; encrypted: boolean }>

      // Window controls
      minimizeWindow: () => void
      maximizeWindow: () => void
      closeWindow: () => void
    }
  }
}

export {}
