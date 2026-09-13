import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '../../shared/constants'
import { launchGame } from '../services/gameLauncher'

export function registerLauncherHandlers(): void {
  ipcMain.handle(
    IPC_CHANNELS.LAUNCH_GAME,
    async (_event, gameId: string): Promise<{ success: boolean; error?: string }> => {
      return launchGame(gameId)
    }
  )
}
