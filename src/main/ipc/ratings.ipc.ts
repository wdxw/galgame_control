import { ipcMain, shell } from 'electron'
import { IPC_CHANNELS } from '../../shared/constants'
import type { RatingProvider, EgsSite, ManualEgsRatingInput } from '../../shared/types'
import { getGameRating, searchRatingCandidates, selectRatingCandidate } from '../services/ratings'
import { ratingSourceUrl } from '../services/ratingMatching'

import { saveManualRating, clearManualRating } from '../services/manualRatings'

export function registerRatingHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.SAVE_MANUAL_RATING, (_event, gameId: string, vndbId: string | null, input: ManualEgsRatingInput) =>
    saveManualRating(gameId, vndbId, input))
  ipcMain.handle(IPC_CHANNELS.CLEAR_MANUAL_RATING, (_event, gameId: string, vndbId: string | null) =>
    clearManualRating(gameId, vndbId))
  ipcMain.handle(IPC_CHANNELS.GET_GAME_RATING, (_event, gameId: string, provider: RatingProvider, force?: boolean) =>
    getGameRating(gameId, provider, force === true))
  ipcMain.handle(IPC_CHANNELS.SEARCH_RATING_CANDIDATES, (_event, gameId: string, query: string) =>
    searchRatingCandidates(gameId, query))
  ipcMain.handle(IPC_CHANNELS.SELECT_RATING_CANDIDATE, (_event, gameId: string, vndbId: string | null, subjectId: number) =>
    selectRatingCandidate(gameId, vndbId, subjectId))
  ipcMain.handle(IPC_CHANNELS.OPEN_RATING_SOURCE, async (_event, provider: RatingProvider, id: string, site?: EgsSite) => {
    if (typeof id !== 'string') throw new Error('Invalid rating source ID')
    await shell.openExternal(ratingSourceUrl(provider, id, site))
  })
}
