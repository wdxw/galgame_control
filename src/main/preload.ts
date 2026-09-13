import { contextBridge, ipcRenderer } from 'electron'
import type { Game, ScanCandidate, ScanProgress, VndbSearchResult, AppSettings } from '../shared/types'
import { IPC_CHANNELS } from '../shared/constants'

// Type-safe API exposed to the renderer process
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
  launchGame: (gameId: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.LAUNCH_GAME, gameId),

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

  // Window controls
  minimizeWindow: (): void => ipcRenderer.send(IPC_CHANNELS.WINDOW_MINIMIZE),
  maximizeWindow: (): void => ipcRenderer.send(IPC_CHANNELS.WINDOW_MAXIMIZE),
  closeWindow: (): void => ipcRenderer.send(IPC_CHANNELS.WINDOW_CLOSE),
}

contextBridge.exposeInMainWorld('api', api)

export type ElectronAPI = typeof api
