import type { Game, ScanCandidate, ScanProgress, VndbSearchResult, AppSettings } from '../../shared/types'
import type { ElectronAPI } from '../../main/preload'

declare global {
  interface Window {
    api: {
      // Library
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
      findLocalCovers: (gameDir: string) => Promise<string[]>
      searchVndb: (title: string) => Promise<VndbSearchResult[]>
      downloadVndbCover: (gameId: string, imageUrl: string) => Promise<string>
      extractExeIcon: (gameId: string, exePath: string) => Promise<string | null>
      copyCoverFile: (gameId: string, sourcePath: string) => Promise<string>

      // Launcher
      launchGame: (gameId: string) => Promise<{ success: boolean; error?: string }>
      openGameDir: (gameDir: string) => Promise<void>

      // Dialog
      selectDirectory: () => Promise<string[] | null>
      selectFile: (filters: { name: string; extensions: string[] }[]) => Promise<string | null>

      // Settings
      getSettings: () => Promise<AppSettings>
      updateSettings: (settings: Partial<AppSettings>) => Promise<void>

      // Window controls
      minimizeWindow: () => void
      maximizeWindow: () => void
      closeWindow: () => void
    }
  }
}

export {}
