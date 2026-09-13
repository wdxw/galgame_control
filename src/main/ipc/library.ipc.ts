import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '../../shared/constants'
import {
  getAllGames,
  getGameById,
  addGame,
  updateGame,
  deleteGame,
  searchGames
} from '../services/library.db'
import type { Game } from '../../shared/types'

export function registerLibraryHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.GET_ALL_GAMES, (): Game[] => {
    return getAllGames()
  })

  ipcMain.handle(IPC_CHANNELS.GET_GAME, (_event, id: string): Game | null => {
    return getGameById(id)
  })

  ipcMain.handle(IPC_CHANNELS.ADD_GAME, (_event, game: Game): void => {
    addGame(game)
  })

  ipcMain.handle(IPC_CHANNELS.UPDATE_GAME, (_event, id: string, fields: Partial<Game>): void => {
    updateGame(id, fields)
  })

  ipcMain.handle(IPC_CHANNELS.DELETE_GAME, (_event, id: string): void => {
    deleteGame(id)
  })

  ipcMain.handle(IPC_CHANNELS.SEARCH_GAMES, (_event, query: string): Game[] => {
    return searchGames(query)
  })
}
