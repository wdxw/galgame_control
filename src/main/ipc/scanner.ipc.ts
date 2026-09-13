import { ipcMain, BrowserWindow } from 'electron'
import { IPC_CHANNELS } from '../../shared/constants'
import { scanDirectories, cancelScan } from '../services/scanner'
import { DEFAULT_SETTINGS } from '../../shared/types'
import { getAllSettings } from '../services/library.db'
import type { ScanProgress } from '../../shared/types'

export function registerScannerHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.START_SCAN, async (_event, roots: string[]): Promise<unknown> => {
    const window = BrowserWindow.getFocusedWindow()

    // Get scan depth from settings
    const settings = getAllSettings()
    const scanDepth = settings.scanDepth
      ? parseInt(settings.scanDepth, 10)
      : DEFAULT_SETTINGS.scanDepth

    const candidates = scanDirectories(roots, scanDepth, (progress: ScanProgress) => {
      if (window && !window.isDestroyed()) {
        window.webContents.send(IPC_CHANNELS.SCAN_PROGRESS, progress)
      }
    })

    return candidates
  })

  ipcMain.handle(IPC_CHANNELS.CANCEL_SCAN, (): void => {
    cancelScan()
  })
}
