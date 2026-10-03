import { ipcMain } from 'electron'
import { getGameRating } from '../services/ratings'
import { scheduleWorldAnalysis } from '../services/worldAnalysis'
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
    if (addGame(game)) void scheduleWorldAnalysis(game.id).catch(() => {})
  })

  ipcMain.handle(IPC_CHANNELS.UPDATE_GAME, (_event, id: string, fields: Partial<Game>): void => {
    const previousVndbId = getGameById(id)?.vndbId
    updateGame(id, fields)
    if (fields.vndbId) {
      void getGameRating(id, 'vndb').catch(() => {})
      void getGameRating(id, 'bangumi').catch(() => {})
      if (fields.vndbId !== previousVndbId) void scheduleWorldAnalysis(id).catch(() => {})
    }
  })

  ipcMain.handle(IPC_CHANNELS.DELETE_GAME, (_event, id: string): void => {
    deleteGame(id)
  })

  ipcMain.handle(IPC_CHANNELS.SEARCH_GAMES, (_event, query: string): Game[] => {
    return searchGames(query)
  })
}
