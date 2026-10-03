import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '../../shared/constants'
import { getWorldMusic, getWorldMusicAlbum } from '../services/musicClient'
import { searchNeteaseMusic } from '../services/neteaseMusic'

export function registerMusicHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.SEARCH_NETEASE_MUSIC, (_event, gameId: string, query?: string, force = false) => {
    if (typeof gameId !== 'string' || typeof force !== 'boolean' || (query !== undefined && typeof query !== 'string')) throw new Error('Invalid music search')
    return searchNeteaseMusic(gameId, query, force)
  })
  ipcMain.handle(IPC_CHANNELS.GET_WORLD_MUSIC, (_event, gameId: string, force = false) => {
    if (typeof gameId !== 'string' || typeof force !== 'boolean') throw new Error('Invalid music request')
    return getWorldMusic(gameId, force)
  })

  ipcMain.handle(IPC_CHANNELS.GET_WORLD_MUSIC_ALBUM, (_event, gameId: string, albumId: string, force = false) => {
    if (typeof gameId !== 'string' || typeof albumId !== 'string' || typeof force !== 'boolean') throw new Error('Invalid music album request')
    return getWorldMusicAlbum(gameId, albumId, force)
  })
}
