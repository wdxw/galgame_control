import { ipcMain, BrowserWindow, dialog, shell } from 'electron'
import { IPC_CHANNELS } from '../../shared/constants'
import { registerRatingHandlers } from './ratings.ipc'
import { registerLibraryHandlers } from './library.ipc'
import { registerScannerHandlers } from './scanner.ipc'
import { registerCoverHandlers } from './cover.ipc'
import { registerLauncherHandlers } from './launcher.ipc'
import { registerWorldHandlers } from './world.ipc'
import { registerMusicHandlers } from './music.ipc'
import { getAllSettings, setSetting } from '../services/library.db'
import { DEFAULT_SETTINGS, type AppSettings, type Language, type RatingProvider, type WorldQuality } from '../../shared/types'

const ratingProviders: RatingProvider[] = ['vndb', 'bangumi', 'erogamescape']
const worldQualities: WorldQuality[] = ['high', 'medium', 'low']
function hiddenProviders(raw?: string): RatingProvider[] {
  try {
    const values: unknown = JSON.parse(raw || '[]')
    return Array.isArray(values) ? ratingProviders.filter(provider => values.includes(provider)) : []
  } catch { return [] }
}

export function registerAllHandlers(): void {
  // Register domain-specific handlers
  registerLibraryHandlers()
  registerScannerHandlers()
  registerCoverHandlers()
  registerLauncherHandlers()
  registerRatingHandlers()
  registerWorldHandlers()
  registerMusicHandlers()

  ipcMain.handle(IPC_CHANNELS.OPEN_GAME_DIR, (_event, gameDir: string): void => {
    shell.openPath(gameDir)
  })

  // Dialog handlers
  ipcMain.handle(IPC_CHANNELS.SELECT_DIRECTORY, async (): Promise<string[] | null> => {
    const window = BrowserWindow.getFocusedWindow()
    if (!window) return null

    const result = await dialog.showOpenDialog(window, {
      properties: ['openDirectory', 'multiSelections'],
      title: 'Select Game Directories'
    })

    return result.canceled ? null : result.filePaths
  })

  ipcMain.handle(
    IPC_CHANNELS.SELECT_FILE,
    async (_event, filters: { name: string; extensions: string[] }[]): Promise<string | null> => {
      const window = BrowserWindow.getFocusedWindow()
      if (!window) return null

      const result = await dialog.showOpenDialog(window, {
        properties: ['openFile'],
        filters,
        title: 'Select File'
      })

      return result.canceled ? null : result.filePaths[0]
    }
  )

  // Settings handlers
  ipcMain.handle(IPC_CHANNELS.GET_SETTINGS, (): AppSettings => {
    const raw = getAllSettings()
    return {
      hiddenRatingProviders: hiddenProviders(raw.hiddenRatingProviders),
      scanDepth: raw.scanDepth ? parseInt(raw.scanDepth, 10) : DEFAULT_SETTINGS.scanDepth,
      vndbEnabled: raw.vndbEnabled !== undefined ? raw.vndbEnabled === 'true' : DEFAULT_SETTINGS.vndbEnabled,
      theme: (raw.theme as AppSettings['theme']) || DEFAULT_SETTINGS.theme,
      thumbnailSize: raw.thumbnailSize ? parseInt(raw.thumbnailSize, 10) : DEFAULT_SETTINGS.thumbnailSize,
      scanRoots: raw.scanRoots ? JSON.parse(raw.scanRoots) : DEFAULT_SETTINGS.scanRoots,
      sidebarCollapsed: raw.sidebarCollapsed === 'true',
      language: (raw.language as Language) || DEFAULT_SETTINGS.language,
      worldQuality: worldQualities.includes(raw.worldQuality as WorldQuality)
        ? (raw.worldQuality as WorldQuality) : DEFAULT_SETTINGS.worldQuality,
      aiBaseUrl: raw.aiBaseUrl || DEFAULT_SETTINGS.aiBaseUrl,
      aiModel: raw.aiModel || DEFAULT_SETTINGS.aiModel,
      aiAutoAnalyze: raw.aiAutoAnalyze !== undefined ? raw.aiAutoAnalyze === 'true' : DEFAULT_SETTINGS.aiAutoAnalyze
    }
  })

  ipcMain.handle(
    IPC_CHANNELS.UPDATE_SETTINGS,
    (_event, settings: Partial<AppSettings>): void => {
      if (settings.hiddenRatingProviders !== undefined) {
        if (!Array.isArray(settings.hiddenRatingProviders) || settings.hiddenRatingProviders.some(provider => !ratingProviders.includes(provider))) {
          throw new Error('Invalid hidden rating providers')
        }
        setSetting('hiddenRatingProviders', JSON.stringify([...new Set(settings.hiddenRatingProviders)]))
      }
      if (settings.scanDepth !== undefined) setSetting('scanDepth', String(settings.scanDepth))
      if (settings.vndbEnabled !== undefined) setSetting('vndbEnabled', String(settings.vndbEnabled))
      if (settings.theme !== undefined) setSetting('theme', settings.theme)
      if (settings.thumbnailSize !== undefined) setSetting('thumbnailSize', String(settings.thumbnailSize))
      if (settings.scanRoots !== undefined) setSetting('scanRoots', JSON.stringify(settings.scanRoots))
      if (settings.sidebarCollapsed !== undefined) setSetting('sidebarCollapsed', String(settings.sidebarCollapsed))
      if (settings.language !== undefined) setSetting('language', settings.language)
      if (settings.worldQuality !== undefined) {
        if (!worldQualities.includes(settings.worldQuality)) throw new Error('Invalid world quality')
        setSetting('worldQuality', settings.worldQuality)
      }
      // AI settings (address, model, key, auto-analyze) are written through the
      // dedicated ai:save channel only, so the API key never travels through the
      // generic settings API. GET_SETTINGS returns the non-secret fields for display.
    }
  )

  // Window control handlers
  ipcMain.on(IPC_CHANNELS.WINDOW_MINIMIZE, () => {
    BrowserWindow.getFocusedWindow()?.minimize()
  })

  ipcMain.on(IPC_CHANNELS.WINDOW_MAXIMIZE, () => {
    const win = BrowserWindow.getFocusedWindow()
    if (win) {
      win.isMaximized() ? win.unmaximize() : win.maximize()
    }
  })

  ipcMain.on(IPC_CHANNELS.WINDOW_CLOSE, () => {
    BrowserWindow.getFocusedWindow()?.close()
  })
}
