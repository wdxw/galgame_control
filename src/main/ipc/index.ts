import { ipcMain, BrowserWindow, dialog, shell } from 'electron'
import { IPC_CHANNELS } from '../../shared/constants'
import { registerLibraryHandlers } from './library.ipc'
import { registerScannerHandlers } from './scanner.ipc'
import { registerCoverHandlers } from './cover.ipc'
import { registerLauncherHandlers } from './launcher.ipc'
import { getAllSettings, setSetting } from '../services/library.db'
import { DEFAULT_SETTINGS, type AppSettings, type Language } from '../../shared/types'

export function registerAllHandlers(): void {
  // Register domain-specific handlers
  registerLibraryHandlers()
  registerScannerHandlers()
  registerCoverHandlers()
  registerLauncherHandlers()

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
      scanDepth: raw.scanDepth ? parseInt(raw.scanDepth, 10) : DEFAULT_SETTINGS.scanDepth,
      vndbEnabled: raw.vndbEnabled !== undefined ? raw.vndbEnabled === 'true' : DEFAULT_SETTINGS.vndbEnabled,
      theme: (raw.theme as AppSettings['theme']) || DEFAULT_SETTINGS.theme,
      thumbnailSize: raw.thumbnailSize ? parseInt(raw.thumbnailSize, 10) : DEFAULT_SETTINGS.thumbnailSize,
      scanRoots: raw.scanRoots ? JSON.parse(raw.scanRoots) : DEFAULT_SETTINGS.scanRoots,
      sidebarCollapsed: raw.sidebarCollapsed === 'true',
      language: (raw.language as Language) || DEFAULT_SETTINGS.language
    }
  })

  ipcMain.handle(
    IPC_CHANNELS.UPDATE_SETTINGS,
    (_event, settings: Partial<AppSettings>): void => {
      if (settings.scanDepth !== undefined) setSetting('scanDepth', String(settings.scanDepth))
      if (settings.vndbEnabled !== undefined) setSetting('vndbEnabled', String(settings.vndbEnabled))
      if (settings.theme !== undefined) setSetting('theme', settings.theme)
      if (settings.thumbnailSize !== undefined) setSetting('thumbnailSize', String(settings.thumbnailSize))
      if (settings.scanRoots !== undefined) setSetting('scanRoots', JSON.stringify(settings.scanRoots))
      if (settings.sidebarCollapsed !== undefined) setSetting('sidebarCollapsed', String(settings.sidebarCollapsed))
      if (settings.language !== undefined) setSetting('language', settings.language)
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
